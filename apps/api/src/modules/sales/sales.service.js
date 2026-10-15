import { consumeFefo, previewSaleLine, restoreToBatches } from '../inventory/batches.service.js';
import { daysLeft, discountPercentFor } from '../inventory/batches.logic.js';
import { QTY_EPS, quantityError, roundQty, unitInfo } from '../../shared/utils/units.js';
import { prisma } from '../../config/db.js';
import { AppError } from '../../shared/exceptions/AppError.js';
import { ERROR_CODES } from '../../shared/exceptions/AppError.js';
import { buildPaginationQuery, getPaginationMeta, round2, applyCreatedAtRange, cleanFilterString, cleanPaymentMethod } from '../../shared/utils/helpers.js';
import { getNextNCF, determineNCFType } from '../../shared/utils/ncf.js';
import { CREDIT_NOTE_NCF } from '../../../../../packages/shared/constants.js';
import { comparePassword } from '../../shared/utils/crypto.js';
import { createAuditLog } from '../../shared/middleware/audit.js';
import { getTenantId } from '../../config/tenant.js';
import * as cardPayments from '../payments/payments.service.js';
import { changeDue, normalizeBreakdown, sumBreakdown } from '../../shared/utils/cashChange.js';
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
      cardPayment: { select: { provider: true, brand: true, last4: true, authCode: true, reference: true } },
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
/**
 * Efectivo de la venta (opcional): lo recibido y la devuelta entregada, por billetes y monedas.
 * Se exige que lo recibido cubra el total y que la devuelta sea la diferencia (a pesos enteros).
 */
function validateCashTender(raw, total) {
  if (!raw) return null;
  const received = normalizeBreakdown(raw.received);
  const change = normalizeBreakdown(raw.change);
  if (!received.ok) throw AppError.badRequest(received.error);
  if (!change.ok) throw AppError.badRequest(change.error);
  const receivedTotal = sumBreakdown(received.breakdown);
  const changeTotal = sumBreakdown(change.breakdown);
  if (receivedTotal + 0.001 < total) throw AppError.badRequest('El efectivo recibido no cubre el total de la venta');
  const expected = changeDue(receivedTotal, total).due;
  if (changeTotal !== expected) throw AppError.badRequest(`La devuelta (${changeTotal}) no coincide con lo que corresponde (${expected})`);
  return { received: received.breakdown, change: change.breakdown };
}

/**
 * Reintenta una transacción que PostgreSQL canceló por deadlock (40P01) o conflicto de serialización (P2034):
 * con muchas cajas vendiendo a la vez, es normal que de vez en cuando dos ventas se crucen y una deba repetirse.
 */
async function withDeadlockRetry(run, attempts = 4) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await run();
    } catch (err) {
      const transient = err?.code === 'P2034' || /40P01|deadlock/i.test(String(err?.message || ''));
      if (!transient || attempt >= attempts) throw err;
      await new Promise(resolve => setTimeout(resolve, 20 * attempt + Math.random() * 40));
    }
  }
}

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
  let lineDiscounts = 0;
  const saleDetails = [];

  for (const item of details) {
    const product = await prisma.product.findUnique({
      where: { id: item.productId },
      include: { presentations: true },
    });

    if (!product) {
      throw AppError.notFound(`Producto con ID ${item.productId} no encontrado`);
    }

    if (!product.active) {
      throw AppError.badRequest(`El producto ${product.name} se encuentra inactivo`, ERROR_CODES.PRODUCT_INACTIVE);
    }

    // Presentación (paquete, caja): la cantidad enviada es de presentaciones y se descuentan `factor` unidades base cada una
    const presentation = item.presentationId ? product.presentations.find(p => p.id === item.presentationId && p.active) : null;
    if (item.presentationId && !presentation) {
      throw AppError.badRequest(`La presentación elegida de ${product.name} no existe o está inactiva`);
    }
    const factor = presentation ? Number(presentation.factor) : 1;
    const qtyError = quantityError(item.quantity, presentation ? 'UND' : product.unit);
    if (qtyError) throw AppError.badRequest(`${product.name}: ${qtyError}`);
    const quantity = roundQty(item.quantity * factor); // en unidades base del producto
    const lineGross = round2(presentation ? Number(presentation.salePrice) * item.quantity : Number(product.salePrice) * quantity);
    const unitPrice = lineGross / quantity; // precio por unidad base (sin redondear para que la línea cuadre al centavo)

    // Perecederos: la asignación por lotes (FEFO) y el descuento por vencimiento los decide el servidor
    let preview = null;
    if (product.isPerishable) {
      preview = await previewSaleLine(product, quantity, unitPrice, config.perishable);
    } else if (product.stock + QTY_EPS < quantity) {
      throw AppError.badRequest(`Stock insuficiente para ${product.name}. Stock disponible: ${roundQty(product.stock)}`, ERROR_CODES.INSUFFICIENT_STOCK);
    }

    const expiryDiscount = preview?.autoDiscount || 0;
    const manualDiscount = round2(Number(item.discount) || 0);
    if (manualDiscount + expiryDiscount > round2(lineGross)) {
      throw AppError.badRequest(`El descuento de ${product.name} no puede superar el valor de la línea`);
    }
    const lineDiscount = round2(manualDiscount + expiryDiscount);
    const itemSubtotal = lineGross - lineDiscount;
    lineDiscounts += lineDiscount;
    saleDetails.push({
      productId: product.id,
      productName: product.name,
      quantity,
      unit: product.unit,
      presentationName: presentation?.name || null,
      presentationQty: presentation ? item.quantity : null,
      unitPrice,
      unitCost: Number(product.costPrice),
      discount: lineDiscount,
      expiryDiscount,
      allocations: preview?.allocations || null,
      product,
      subtotal: Math.max(0, round2(itemSubtotal)),
    });

    subtotal += lineGross;
  }

  // Sale.discount reúne los descuentos de línea y el global: subtotal - discount + tax = total
  const finalDiscount = round2(lineDiscounts + Number(discount || 0));
  const taxableAmount = Math.max(0, subtotal - finalDiscount);
  const tax = round2(taxableAmount * config.taxRate);
  const total = round2(taxableAmount + tax);

  // Método de pago: debe estar habilitado en la configuración
  const normalizedPaymentMethod = (paymentMethod || 'EFECTIVO').toUpperCase();
  if (!config.paymentMethods.includes(normalizedPaymentMethod)) {
    throw AppError.badRequest('Método de pago no habilitado');
  }

  // Con terminal de tarjeta configurado, la venta exige un cobro aprobado por el monto exacto (se reclama en la transacción)
  const cardPayment = await cardPayments.requireForSale(normalizedPaymentMethod, data.cardPaymentId, total);
  const cash = normalizedPaymentMethod === 'EFECTIVO' ? validateCashTender(data.cash, total) : null;

  // Con facturación electrónica activa el comprobante es un e-CF (se asigna dentro de la transacción);
  // si no, se usa el NCF de papel (serie B)
  const ecfContext = await loadIssuingContext({ purpose: 'sign-ecf', userId });
  const ncfType = determineNCFType(customer);
  let invoiceNumber = ecfContext ? null : await getNextNCF(ncfType);

  // Create sale in transaction
  const sale = await withDeadlockRetry(() => prisma.$transaction(async (tx) => {
    let ecf = null;
    if (ecfContext) {
      ecf = await issueEcf(tx, ecfContext, {
        ecfType: ecfTypeForCustomer(customer),
        customer,
        lines: saleDetails.map(d => ({ name: d.productName, quantity: d.quantity, unitPrice: d.unitPrice, unitCode: unitInfo(d.unit).ecf })),
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
        ...(cash ? { cashReceived: cash.received, cashChange: cash.change } : {}),
        notes: notes || null,
        terminalId: shift.terminalId,
        cashierCloseId: shift.cashierCloseId,
        details: {
          create: saleDetails.map(d => ({
            companyId: getTenantId(),
            productId: d.productId,
            productName: d.productName,
            quantity: d.quantity,
            unit: d.unit,
            presentationName: d.presentationName,
            presentationQty: d.presentationQty,
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

    await cardPayments.claimForSale(tx, cardPayment, newSale.id);

    // Update product stock and create inventory logs
    const usedDetails = new Set();
    // Siempre en el mismo orden (por producto): dos ventas con productos en común no se bloquean entre sí en orden cruzado (deadlock)
    for (const item of [...saleDetails].sort((a, b) => (a.productId < b.productId ? -1 : a.productId > b.productId ? 1 : 0))) {
      // Perecederos: descuenta los lotes de forma atómica (FEFO) y deja la trazabilidad por lote vendido
      if (item.product.isPerishable) {
        const allocations = await consumeFefo(tx, item.product, item.quantity, config.perishable);
        const created = newSale.details.find(
          d => !usedDetails.has(d.id) && d.productId === item.productId && d.quantity === item.quantity && Number(d.discount) === item.discount
        );
        usedDetails.add(created.id);
        await tx.saleBatchDetail.createMany({
          data: allocations.map(a => ({
            companyId: getTenantId(),
            saleDetailId: created.id,
            batchId: a.batchId,
            quantity: a.quantity,
            // descuento por vencimiento de esta porción (para el reporte de vencimientos)
            discountAmount: round2((item.unitPrice * a.quantity * discountPercentFor(daysLeft(a.expirationDate), config.perishable)) / 100),
          })),
        });
      }

      // Descuento atómico: si otra venta se llevó el stock mientras tanto, esta se rechaza (no queda stock negativo)
      const { count } = await tx.product.updateMany({
        where: { id: item.productId, stock: { gte: item.quantity - QTY_EPS } },
        data: { stock: { decrement: item.quantity } },
      });
      if (count !== 1) {
        throw AppError.badRequest(`Stock insuficiente para ${item.productName}`, ERROR_CODES.INSUFFICIENT_STOCK);
      }
      await tx.product.updateMany({ where: { id: item.productId, stock: { lt: QTY_EPS, gt: -QTY_EPS } }, data: { stock: 0 } });

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
  }));

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
    const e = sold.get(d.productId) || { quantity: 0, name: d.productName, unit: d.unit, unitPrice: Number(d.unitPrice), unitCost: Number(d.unitCost), lineDiscount: 0 };
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
    const available = roundQty(line.quantity - (credited.get(productId) || 0));
    const qtyError = quantityError(quantity, line.unit);
    if (qtyError) throw AppError.badRequest(`${line.name}: ${qtyError}`);
    if (quantity > available + QTY_EPS) {
      throw AppError.badRequest(`Solo se pueden devolver ${available} ${unitInfo(line.unit).short} de ${line.name}`);
    }
    const lineDiscount = line.quantity > 0 ? round2((line.lineDiscount * quantity) / line.quantity) : 0;
    const lineGross = round2(line.unitPrice * quantity);
    gross += lineGross;
    lines.push({ productId, name: line.name, unit: line.unit, quantity, unitPrice: line.unitPrice, unitCost: line.unitCost, discount: lineDiscount, subtotal: round2(lineGross - lineDiscount) });
  }

  const originalSubtotal = Number(original.subtotal) || 0;
  // El descuento original reúne líneas y global: las líneas se devuelven exactas y el global en proporción
  const originalLineDiscounts = original.details.reduce((a, d) => a + (Number(d.discount) || 0), 0);
  const originalGlobal = Math.max(0, Number(original.discount) - originalLineDiscounts);
  const returnedLineDiscounts = lines.reduce((a, l) => a + l.discount, 0);
  const discountShare = originalSubtotal > 0 ? round2(returnedLineDiscounts + originalGlobal * (gross / originalSubtotal)) : 0;
  const taxable = Math.max(0, gross - discountShare);
  const originalBase = originalSubtotal - Number(original.discount);
  const rate = originalBase > 0 ? Number(original.tax) / originalBase : config.taxRate;
  const tax = round2(taxable * rate);
  const total = round2(taxable + tax);

  // Devolución de una venta electrónica -> nota de crédito electrónica (E34) que referencia el e-CF original
  const ecfContext = await loadIssuingContext({ purpose: 'sign-ecf', userId });
  if (original.eNcf && !ecfContext) {
    throw AppError.badRequest('La venta original es un comprobante electrónico: active la facturación electrónica para emitir su nota de crédito');
  }
  const useEcf = Boolean(ecfContext && original.eNcf);
  let invoiceNumber = useEcf ? null : await getNextNCF(CREDIT_NOTE_NCF);
  const buyer = useEcf ? await prisma.customer.findUnique({ where: { id: original.customerId } }) : null;
  const fullyReturned = [...sold.entries()].every(([productId, line]) => (credited.get(productId) || 0) + (requested.get(productId) || 0) >= line.quantity - QTY_EPS);

  return prisma.$transaction(async tx => {
    let ecf = null;
    if (useEcf) {
      ecf = await issueEcf(tx, ecfContext, {
        ecfType: 'E34',
        customer: buyer,
        lines: lines.map(l => ({ name: l.name, quantity: l.quantity, unitPrice: l.unitPrice, unitCode: unitInfo(l.unit).ecf })),
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
            unit: l.unit,
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

    for (const l of [...lines].sort((a, b) => (a.productId < b.productId ? -1 : a.productId > b.productId ? 1 : 0))) {
      // Perecederos: la devolución vuelve a los lotes de donde salió y queda registrada (cantidad negativa)
      const product = await tx.product.findUnique({ where: { id: l.productId }, select: { isPerishable: true, costPrice: true } });
      if (product?.isPerishable) {
        const restored = await restoreToBatches(tx, { originalSaleId: original.id, productId: l.productId, quantity: l.quantity, costPrice: Number(product.costPrice) });
        const noteDetail = note.details.find(d => d.productId === l.productId);
        await tx.saleBatchDetail.createMany({
          data: restored.map(r => ({ companyId: getTenantId(), saleDetailId: noteDetail.id, batchId: r.batchId, quantity: -r.quantity })),
        });
      }
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
