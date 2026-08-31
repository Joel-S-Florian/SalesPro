import { prisma } from '../../config/db.js';
import { AppError } from '../../shared/exceptions/AppError.js';
import { ERROR_CODES } from '../../shared/exceptions/AppError.js';
import { buildPaginationQuery, getPaginationMeta, round2 } from '../../shared/utils/helpers.js';
import { getNextNCF, determineNCFType } from '../../shared/utils/ncf.js';
import { TAX_RATE } from '@salespro/shared/constants.js';

/**
 * Get all sales with pagination and filters
 */
export async function getSales({ page = 1, limit = 20, sortBy = 'createdAt', sortOrder = 'desc', customerId, userId, startDate, endDate, paymentMethod }) {
  const { skip, take, orderBy } = buildPaginationQuery({ page, limit, sortBy, sortOrder });

  const where = {};

  if (customerId) where.customerId = customerId;
  if (userId) where.userId = userId;
  if (paymentMethod) where.paymentMethod = paymentMethod;

  if (startDate || endDate) {
    where.createdAt = {};
    if (startDate) where.createdAt.gte = new Date(startDate);
    if (endDate) where.createdAt.lte = new Date(endDate);
  }

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
export async function getSaleById(id) {
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

  return sale;
}

/**
 * Create new sale (POS)
 */
export async function createSale(data, userId, userName) {
  const { customerId, details, discount, paymentMethod, notes } = data;

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
      discount: item.discount || 0,
      subtotal: Math.max(0, round2(itemSubtotal)),
    });

    subtotal += Number(product.salePrice) * item.quantity;
  }

  const finalDiscount = Number(discount || 0);
  const taxableAmount = Math.max(0, subtotal - finalDiscount);
  const tax = round2(taxableAmount * TAX_RATE);
  const total = round2(taxableAmount + tax);

  // Normalize payment method to uppercase enum (Solo Efectivo y Tarjeta)
  const validMethods = ['EFECTIVO', 'TARJETA'];
  const rawMethod = (paymentMethod || 'EFECTIVO').toUpperCase();
  const normalizedPaymentMethod = validMethods.includes(rawMethod) ? rawMethod : 'EFECTIVO';

  // Determine NCF type
  const ncfType = determineNCFType(customer, total);
  const invoiceNumber = await getNextNCF(ncfType);

  // Create sale in transaction
  const sale = await prisma.$transaction(async (tx) => {
    // Create sale
    const newSale = await tx.sale.create({
      data: {
        invoiceNumber,
        ncfType,
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
        details: {
          create: saleDetails.map(d => ({
            productId: d.productId,
            productName: d.productName,
            quantity: d.quantity,
            unitPrice: d.unitPrice,
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

    return newSale;
  });

  return sale;
}

/**
 * Create credit note (nota de crédito)
 */
export async function createCreditNote(originalSaleId, data, userId, userName) {
  const originalSale = await prisma.sale.findUnique({
    where: { id: originalSaleId },
    include: { details: true },
  });

  if (!originalSale) {
    throw AppError.notFound('Venta original no encontrada');
  }

  // For now, create a negative sale (credit note)
  // In future: proper B16 NCF type
  const creditNote = await createSale({
    customerId: originalSale.customerId,
    details: data.details.map(d => ({
      productId: d.productId,
      quantity: d.quantity,
      discount: d.discount || 0,
    })),
    discount: 0,
    paymentMethod: 'EFECTIVO', // Credit notes don't have payment method
    notes: `NOTA DE CRÉDITO - Ref: ${originalSale.invoiceNumber} - ${data.reason}`,
  }, userId, userName);

  // Update NCF type to B16 (Nota de Crédito)
  await prisma.sale.update({
    where: { id: creditNote.id },
    data: { ncfType: 'B16' },
  });

  return creditNote;
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