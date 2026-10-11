import { prisma } from '../../config/db.js';
import { AppError } from '../../shared/exceptions/AppError.js';
import { ERROR_CODES } from '../../shared/exceptions/AppError.js';
import { buildPaginationQuery, getPaginationMeta, round2, applyCreatedAtRange, cleanFilterString, cleanPaymentMethod } from '../../shared/utils/helpers.js';
import { getNextNCF, determineNCFType } from '../../shared/utils/ncf.js';
import { CREDIT_NOTE_NCF } from '../../../../../packages/shared/constants.js';
import { comparePassword } from '../../shared/utils/crypto.js';
import { createAuditLog } from '../../shared/middleware/audit.js';
import { getTenantId } from '../../config/tenant.js';
import { getConfig } from '../config/config.service.js';
import { resolveShiftForSale } from '../cashier/cashier.service.js';
import { ecfTypeForCustomer, issueEcf, loadIssuingContext, saleEcfFields, saveEcfDocuments } from '../ecf/ecf.issue.js';
import { kickEcfWorker } from '../ecf/ecf.outbox.js';

function applyDateRange(where, startDate, endDate) {
  applyCreatedAtRange(where, startDate, endDate);
}

/**
 * Get all sales with pagination and filters
 */
export async function getSales({ page = 1, limit = 20, sortBy = 'createdAt', sortOrder = 'desc', customerId, userId, search, startDate, endDate, paymentMethod }) {
  const { skip, take, orderBy } = buildPaginationQuery({ page, limit, sortBy, sortOrder });

  const where = {};

  const cleanCustomer = cleanFilterString(customerId);
  if (cleanCustomer) where.customerId = cleanCustomer;
  const cleanUser = cleanFilterString(userId);
  if (cleanUser) where.userId = cleanUser;
  const cleanPayment = cleanPaymentMethod(paymentMethod);
  if (cleanPayment) where.paymentMethod = cleanPayment;

  const cleanSearch = cleanFilterString(search);
  if (cleanSearch) {
    where.OR = [
      { invoiceNumber: { contains: cleanSearch, mode: 'insensitive' } },
      { customerName: { contains: cleanSearch, mode: 'insensitive' } },
      { customer: { documentId: { contains: cleanSearch, mode: 'insensitive' } } },
    ];
  }

  applyDateRange(where, startDate, endDate);

  const [sales, total] = await Promise.all([
    prisma.sale.findMany({
      where,
      skip,
      take,
      orderBy,
      include: {
        customer: { select: { id: true, name: true, documentId: true } },
        user: { select: { id: true, username: true, fullName: true } },
        details: {
          include: {
            product: { select: { id: true, code: true, name: true } },
          },
        },
      },
    }),
    prisma.sale.count({ where }),
  ]);

  return {
    data: sales,
    pagination: getPaginationMeta(page, limit, total),
  };
}

/**
 * Get sale by ID
 */
export async function getSaleById(id, requester) {
  const sale = await prisma.sale.findUnique({
    where: { id },
    include: {
      customer: { select: { id: true, name: true, documentId: true, email: true, phone: true, address: true, rnc: true } },
      user: { select: { id: true, username: true, fullName: true } },
      details: {
        include: {
          product: { select: { id: true, code: true, name: true, costPrice: true } },
        },
      },
    },
  });

  if (!sale) {
    throw AppError.notFound('Venta no encontrada');
  }

  // RBAC: VENDEDOR can only view their own sales
  if (requester && requester.role === 'VENDEDOR' && sale.userId !== requester.userId) {
    throw AppError.forbidden('No tiene permisos para ver esta venta');
  }

  return sale;
}

/**
 * Get sales for current user (vendedor)
 */
export async function getMySales(userId, { page = 1, limit = 20, sortBy = 'createdAt', sortOrder = 'desc', customerId, search, startDate, endDate, paymentMethod } = {}) {
  const { skip, take, orderBy } = buildPaginationQuery({ page, limit, sortBy, sortOrder });

  const where = {
    userId,
  };

  const cleanCustomer = cleanFilterString(customerId);
  if (cleanCustomer) where.customerId = cleanCustomer;
  const cleanPayment = cleanPaymentMethod(paymentMethod);
  if (cleanPayment) where.paymentMethod = cleanPayment;

  const cleanSearch = cleanFilterString(search);
  if (cleanSearch) {
    where.AND = [
      {
        OR: [
          { invoiceNumber: { contains: cleanSearch, mode: 'insensitive' } },
          { customerName: { contains: cleanSearch, mode: 'insensitive' } },
          { customer: { documentId: { contains: cleanSearch, mode: 'insensitive' } } },
        ],
      },
    ];
  }

  applyDateRange(where, startDate, endDate);

  const [sales, total] = await Promise.all([
    prisma.sale.findMany({
      where,
      skip,
      take,
      orderBy,
      include: {
        customer: { select: { id: true, name: true, documentId: true } },
        user: { select: { id: true, username: true, fullName: true } },
        details: {
          include: {
            product: { select: { id: true, code: true, name: true } },
          },
        },
      },
    }),
    prisma.sale.count({ where }),
  ]);

  return {
    data: sales,
    pagination: getPaginationMeta(page, limit, total),
  };
}

/**
 * Get vendor statistics (today, month, top products, recent sales)
 */
export async function getVendorStats(userId) {
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();

  const sales = await prisma.sale.findMany({
    where: { userId },
    select: {
      id: true,
      invoiceNumber: true,
      customerName: true,
      total: true,
      paymentMethod: true,
      createdAt: true,
      details: { select: { productName: true, quantity: true, subtotal: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  let todayTotal = 0, todayCount = 0;
  let monthTotal = 0, monthCount = 0;

  const productMap = new Map();

  sales.forEach(s => {
    const saleDate = s.createdAt instanceof Date ? s.createdAt : new Date(s.createdAt);
    const saleDateStr = saleDate.toISOString().split('T')[0];

    if (saleDateStr === todayStr) {
      todayCount += 1;
      todayTotal += Number(s.total);
    }

    if (saleDate.getMonth() === currentMonth && saleDate.getFullYear() === currentYear) {
      monthCount += 1;
      monthTotal += Number(s.total);
    }

    (s.details || []).forEach(d => {
      const entry = productMap.get(d.productName) || { name: d.productName, quantity: 0, total: 0 };
      entry.quantity += d.quantity;
      entry.total += Number(d.subtotal);
      productMap.set(d.productName, entry);
    });
  });

  const topProducts = Array.from(productMap.values())
    .map(p => ({ ...p, total: round2(p.total) }))
    .sort((a, b) => b.quantity - a.quantity)
    .slice(0, 5);

  const recentSales = sales.slice(0, 5).map(s => ({
    id: s.id,
    invoiceNumber: s.invoiceNumber,
    customerName: s.customerName,
    total: Number(s.total),
    paymentMethod: s.paymentMethod,
    createdAt: s.createdAt,
  }));

  return {
    today: { total: round2(todayTotal), count: todayCount },
    month: { total: round2(monthTotal), count: monthCount },
    averageTicket: todayCount > 0 ? round2(todayTotal / todayCount) : 0,
    topProducts,
    recentSales,
  };
}

/**
 * Create new sale (POS)
 */
export async function createSale(data, userId, userName, requester = { userId, role: 'VENDEDOR' }) {
  const { customerId, details, discount, paymentMethod, notes, terminalId } = data;
  const config = await getConfig();

  if (requester.role === 'VENDEDOR' && !config.vendedorCanDiscount) {
    const hasDiscount = Number(discount || 0) > 0 || details.some(d => Number(d.discount || 0) > 0);
    if (hasDiscount) throw AppError.forbidden('Los vendedores no pueden aplicar descuentos');
  }

  const shift = await resolveShiftForSale(requester, terminalId, config);

  // Verify customer exists
  const customer = await prisma.customer.findUnique({ where: { id: customerId } });
  if (!customer) {
    throw AppError.notFound('Cliente no encontrado');
  }

  // Validate products and calculate totals
  let subtotal = 0;
  const saleDetails = [];

  for (const item of details) {
    const product = await prisma.product.findUnique({
      where: { id: item.productId },
    });

    if (!product) {
      throw AppError.notFound(`Producto con ID ${item.productId} no encontrado`);
    }

    if (!product.active) {
      throw AppError.badRequest(`El producto ${product.name} se encuentra inactivo`, ERROR_CODES.PRODUCT_INACTIVE);
    }

    if (product.stock < item.quantity) {
      throw AppError.badRequest(`Stock insuficiente para ${product.name}. Stock disponible: ${product.stock}`, ERROR_CODES.INSUFFICIENT_STOCK);
    }

    const itemSubtotal = (Number(product.salePrice) * item.quantity) - (item.discount || 0);
    saleDetails.push({
      productId: product.id,
      productName: product.name,
      quantity: item.quantity,
      unitPrice: Number(product.salePrice),
      unitCost: Number(product.costPrice),
      discount: item.discount || 0,
      subtotal: Math.max(0, round2(itemSubtotal)),
    });

    subtotal += Number(product.salePrice) * item.quantity;
  }

  const finalDiscount = Number(discount || 0);
  const taxableAmount = Math.max(0, subtotal - finalDiscount);
  const tax = round2(taxableAmount * config.taxRate);
  const total = round2(taxableAmount + tax);

  // Método de pago: debe estar habilitado en la configuración
  const normalizedPaymentMethod = (paymentMethod || 'EFECTIVO').toUpperCase();
  if (!config.paymentMethods.includes(normalizedPaymentMethod)) {
    throw AppError.badRequest('Método de pago no habilitado');
  }

  // Con facturación electrónica activa el comprobante es un e-CF (se asigna dentro de la transacción);
  // si no, se usa el NCF de papel (serie B)
  const ecfContext = await loadIssuingContext();
  const ncfType = determineNCFType(customer);
  let invoiceNumber = ecfContext ? null : await getNextNCF(ncfType);

  // Create sale in transaction
  const sale = await prisma.$transaction(async (tx) => {
    let ecf = null;
    if (ecfContext) {
      ecf = await issueEcf(tx, ecfContext, {
        ecfType: ecfTypeForCustomer(customer),
        customer,
        lines: saleDetails.map(d => ({ name: d.productName, quantity: d.quantity, unitPrice: d.unitPrice })),
        discount: finalDiscount,
        tax,
        total,
        taxRate: config.taxRate,
        paymentMethod: normalizedPaymentMethod,
      });
      invoiceNumber = ecf.eNcf;
    }

    // Create sale
    const newSale = await tx.sale.create({
      data: {
        invoiceNumber,
        ncfType,
        ...(ecf ? saleEcfFields(ecf) : {}),
        customerId: customer.id,
        customerName: customer.name,
        userId,
        userName,
        subtotal: round2(subtotal),
        tax,
        discount: finalDiscount,
        total,
        paymentMethod: normalizedPaymentMethod,
        notes: notes || null,
        terminalId: shift.terminalId,
        cashierCloseId: shift.cashierCloseId,
        details: {
          create: saleDetails.map(d => ({
            companyId: getTenantId(),
            productId: d.productId,
            productName: d.productName,
            quantity: d.quantity,
            unitPrice: d.unitPrice,
            unitCost: d.unitCost,
            discount: d.discount,
            subtotal: d.subtotal,
          })),
        },
      },
      include: {
        customer: { select: { id: true, name: true, documentId: true, rnc: true } },
        user: { select: { id: true, username: true, fullName: true } },
        details: {
          include: {
            product: { select: { id: true, code: true, name: true, costPrice: true } },
          },
        },
      },
    });

    // Update product stock and create inventory logs
    for (const item of saleDetails) {
      const product = await tx.product.findUnique({ where: { id: item.productId } });
      
      await tx.product.update({
        where: { id: item.productId },
        data: { stock: { decrement: item.quantity } },
      });

      await tx.inventoryLog.create({
        data: {
          productId: item.productId,
          productName: item.productName,
          type: 'SALIDA',
          quantity: item.quantity,
          reason: `Venta ${invoiceNumber}`,
          userId,
          userName,
        },
      });
    }

    if (ecf) await saveEcfDocuments(tx, newSale.id, ecf);

    return newSale;
  });

  // Envía a la DGII en segundo plano; la venta ya quedó registrada y firmada
  if (ecfContext) kickEcfWorker();

  return sale;
}

/**
 * Crea una nota de crédito (B04) por devolución de productos de una venta.
 * - Se guarda con montos y cantidades **negativos**, así los totales de ventas, caja y reportes restan solos.
 * - Devuelve el stock y deja un movimiento DEVOLUCION en el inventario.
 * - Solo se puede acreditar lo vendido y aún no devuelto; el impuesto y el descuento van en la misma proporción
 *   que la venta original.
 */
export async function createCreditNote(originalSaleId, data, userId, userName, requester = { userId, role: 'VENDEDOR' }) {
  const { details, reason, terminalId } = data;
  const config = await getConfig();

  const original = await prisma.sale.findUnique({
    where: { id: originalSaleId },
    include: { details: true, creditNotes: { include: { details: true } } },
  });
  if (!original) throw AppError.notFound('Venta original no encontrada');
  if (original.ncfType === CREDIT_NOTE_NCF) throw AppError.badRequest('No se puede crear una nota de crédito sobre otra nota de crédito');

  const shift = await resolveShiftForSale(requester, terminalId, config);

  // Cantidad vendida y ya devuelta por producto
  const sold = new Map();
  original.details.forEach(d => {
    const e = sold.get(d.productId) || { quantity: 0, name: d.productName, unitPrice: Number(d.unitPrice), unitCost: Number(d.unitCost), lineDiscount: 0 };
    e.quantity += d.quantity;
    e.lineDiscount += Number(d.discount) || 0;
    sold.set(d.productId, e);
  });
  const credited = new Map();
  original.creditNotes.forEach(note =>
    note.details.forEach(d => credited.set(d.productId, (credited.get(d.productId) || 0) + Math.abs(d.quantity)))
  );

  const requested = new Map();
  details.forEach(d => requested.set(d.productId, (requested.get(d.productId) || 0) + d.quantity));

  const lines = [];
  let gross = 0;
  for (const [productId, quantity] of requested) {
    const line = sold.get(productId);
    if (!line) throw AppError.badRequest('Uno de los productos no pertenece a la venta original');
    const available = line.quantity - (credited.get(productId) || 0);
    if (quantity > available) {
      throw AppError.badRequest(`Solo se pueden devolver ${available} unidad(es) de ${line.name}`);
    }
    const lineDiscount = line.quantity > 0 ? round2((line.lineDiscount * quantity) / line.quantity) : 0;
    const lineGross = line.unitPrice * quantity;
    gross += lineGross;
    lines.push({ productId, name: line.name, quantity, unitPrice: line.unitPrice, unitCost: line.unitCost, discount: lineDiscount, subtotal: round2(lineGross - lineDiscount) });
  }

  const originalSubtotal = Number(original.subtotal) || 0;
  const discountShare = originalSubtotal > 0 ? round2(Number(original.discount) * (gross / originalSubtotal)) : 0;
  const taxable = Math.max(0, gross - discountShare);
  const originalBase = originalSubtotal - Number(original.discount);
  const rate = originalBase > 0 ? Number(original.tax) / originalBase : config.taxRate;
  const tax = round2(taxable * rate);
  const total = round2(taxable + tax);

  // Devolución de una venta electrónica -> nota de crédito electrónica (E34) que referencia el e-CF original
  const ecfContext = await loadIssuingContext();
  if (original.eNcf && !ecfContext) {
    throw AppError.badRequest('La venta original es un comprobante electrónico: active la facturación electrónica para emitir su nota de crédito');
  }
  const useEcf = Boolean(ecfContext && original.eNcf);
  let invoiceNumber = useEcf ? null : await getNextNCF(CREDIT_NOTE_NCF);
  const buyer = useEcf ? await prisma.customer.findUnique({ where: { id: original.customerId } }) : null;
  const fullyReturned = [...sold.entries()].every(([productId, line]) => (credited.get(productId) || 0) + (requested.get(productId) || 0) >= line.quantity);

  return prisma.$transaction(async tx => {
    let ecf = null;
    if (useEcf) {
      ecf = await issueEcf(tx, ecfContext, {
        ecfType: 'E34',
        customer: buyer,
        lines: lines.map(l => ({ name: l.name, quantity: l.quantity, unitPrice: l.unitPrice })),
        discount: discountShare,
        tax,
        total,
        taxRate: Math.round(rate * 100) / 100,
        paymentMethod: original.paymentMethod,
        reference: {
          eNcf: original.eNcf,
          issuedAt: original.createdAt,
          // 1 = anula el comprobante original (devolución total); 3 = corrige montos (devolución parcial)
          modificationCode: fullyReturned ? 1 : 3,
          afterThirtyDays: Date.now() - new Date(original.createdAt).getTime() > 30 * 86400000,
        },
      });
      invoiceNumber = ecf.eNcf;
    }

    const note = await tx.sale.create({
      data: {
        invoiceNumber,
        ncfType: CREDIT_NOTE_NCF,
        ...(ecf ? saleEcfFields(ecf) : {}),
        relatedSaleId: original.id,
        customerId: original.customerId,
        customerName: original.customerName,
        userId,
        userName,
        subtotal: -round2(gross),
        tax: -tax,
        discount: -discountShare,
        total: -total,
        paymentMethod: original.paymentMethod,
        notes: `NOTA DE CRÉDITO - Ref: ${original.invoiceNumber} - ${reason}`,
        terminalId: shift.terminalId,
        cashierCloseId: shift.cashierCloseId,
        details: {
          create: lines.map(l => ({
            companyId: getTenantId(),
            productId: l.productId,
            productName: l.name,
            quantity: -l.quantity,
            unitPrice: l.unitPrice,
            unitCost: l.unitCost,
            discount: l.discount,
            subtotal: -l.subtotal,
          })),
        },
      },
      include: { details: true },
    });

    for (const l of lines) {
      await tx.product.update({ where: { id: l.productId }, data: { stock: { increment: l.quantity } } });
      await tx.inventoryLog.create({
        data: {
          productId: l.productId,
          productName: l.name,
          type: 'DEVOLUCION',
          quantity: l.quantity,
          reason: `Nota de crédito ${invoiceNumber} (venta ${original.invoiceNumber})`,
          userId,
          userName,
        },
      });
    }

    if (ecf) await saveEcfDocuments(tx, note.id, ecf);

    return note;
  }).then(note => {
    if (useEcf) kickEcfWorker();
    return note;
  });
}

/**
 * Get sales statistics for dashboard
 */
export async function getSalesStats() {
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();

  const allSales = await prisma.sale.findMany({
    select: { total: true, createdAt: true, details: { select: { productId: true, quantity: true, subtotal: true } } },
  });

  let salesToday = 0, revenueToday = 0;
  let salesMonth = 0, revenueMonth = 0;

  allSales.forEach(s => {
    const saleDate = new Date(s.createdAt);
    const saleDateStr = s.createdAt.split('T')[0];

    if (saleDateStr === todayStr) {
      salesToday += 1;
      revenueToday += Number(s.total);
    }

    if (saleDate.getMonth() === currentMonth && saleDate.getFullYear() === currentYear) {
      salesMonth += 1;
      revenueMonth += Number(s.total);
    }
  });

  return {
    salesToday,
    revenueToday: round2(revenueToday),
    salesMonth,
    revenueMonth: round2(revenueMonth),
  };
}

/**
 * Get top selling products
 */
export async function getTopSellingProducts(limit = 5) {
  const sales = await prisma.sale.findMany({
    include: { details: true },
  });

  const salesMap = new Map();
  sales.forEach(s => {
    s.details.forEach(d => {
      const entry = salesMap.get(d.productName) || { quantity: 0, revenue: 0 };
      entry.quantity += d.quantity;
      entry.revenue += Number(d.subtotal);
      salesMap.set(d.productName, entry);
    });
  });

  return Array.from(salesMap.entries())
    .map(([name, stat]) => ({ name, quantity: stat.quantity, revenue: round2(stat.revenue) }))
    .sort((a, b) => b.quantity - a.quantity)
    .slice(0, limit);
}

/**
 * Get recent sales
 */
export async function getRecentSales(limit = 5) {
  return prisma.sale.findMany({
    take: limit,
    orderBy: { createdAt: 'desc' },
    include: {
      customer: { select: { name: true } },
      user: { select: { fullName: true } },
    },
  });
}

/**
 * Get sales by day (last 7 days)
 */
export async function getSalesByDay() {
  const now = new Date();
  const last7Days = {};

  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];
    last7Days[dateStr] = { amount: 0, count: 0 };
  }

  const sales = await prisma.sale.findMany({
    where: {
      createdAt: {
        gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      },
    },
    select: { total: true, createdAt: true },
  });

  sales.forEach(s => {
    const dateStr = s.createdAt.split('T')[0];
    if (last7Days[dateStr]) {
      last7Days[dateStr].amount += Number(s.total);
      last7Days[dateStr].count += 1;
    }
  });

  return Object.entries(last7Days).map(([day, stat]) => {
    const [y, m, d] = day.split('-');
    return {
      day: `${d}/${m}`,
      amount: round2(stat.amount),
      count: stat.count,
    };
  });
}

/**
 * Registra en AuditLog la eliminación de un item del carrito.
 * Un ADMINISTRADOR se autoriza solo; un VENDEDOR requiere credenciales de un administrador activo.
 */
export async function logCartRemoval(data, requester, meta = {}) {
  const { productId, quantity, reason, adminUsername, adminPassword } = data;

  let authorizer = { id: requester.userId, username: requester.username };

  if (requester.role !== 'ADMINISTRADOR') {
    const invalid = () => AppError.forbidden('Credenciales de administrador inválidas');
    if (!adminUsername || !adminPassword) throw invalid();

    const admin = await prisma.user.findUnique({ where: { username: adminUsername.toLowerCase() } });
    if (!admin || !admin.active || admin.role !== 'ADMINISTRADOR') throw invalid();
    if (!(await comparePassword(adminPassword, admin.passwordHash))) throw invalid();

    authorizer = { id: admin.id, username: admin.username };
  }

  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { id: true, code: true, name: true },
  });
  if (!product) throw AppError.notFound('Producto no encontrado');

  await createAuditLog({
    userId: requester.userId,
    action: 'CART_ITEM_REMOVED',
    entity: 'cart',
    entityId: product.id,
    oldData: { productCode: product.code, productName: product.name, quantity },
    newData: { reason: reason || null, authorizedBy: authorizer, removedBy: requester.username },
    ipAddress: meta.ip,
    userAgent: meta.userAgent,
  });

  return { ok: true, authorizedBy: authorizer.username };
}
