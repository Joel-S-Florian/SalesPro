import { prisma } from '../../config/db.js';
import { AppError } from '../../shared/exceptions/AppError.js';
import { ERROR_CODES } from '../../shared/exceptions/AppError.js';
import { buildPaginationQuery, getPaginationMeta } from '../../shared/utils/helpers.js';

/**
 * Get inventory logs with pagination and filters
 */
export async function getInventoryLogs({ page = 1, limit = 50, sortBy = 'createdAt', sortOrder = 'desc', productId, type, userId, startDate, endDate }) {
  const { skip, take, orderBy } = buildPaginationQuery({ page, limit, sortBy, sortOrder });

  const where = {};

  if (productId) where.productId = productId;
  if (type) where.type = type;
  if (userId) where.userId = userId;

  if (startDate || endDate) {
    where.createdAt = {};
    if (startDate) where.createdAt.gte = new Date(startDate);
    if (endDate) where.createdAt.lte = new Date(endDate);
  }

  const [logs, total] = await Promise.all([
    prisma.inventoryLog.findMany({
      where,
      skip,
      take,
      orderBy,
      include: {
        product: { select: { id: true, code: true, name: true } },
        user: { select: { id: true, username: true, fullName: true } },
      },
    }),
    prisma.inventoryLog.count({ where }),
  ]);

  return {
    data: logs,
    pagination: getPaginationMeta(page, limit, total),
  };
}

/**
 * Get product kardex (detailed inventory history)
 */
export async function getProductKardex(productId, { page = 1, limit = 100 }) {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { id: true, code: true, name: true, stock: true, minStock: true },
  });

  if (!product) {
    throw AppError.notFound('Producto no encontrado');
  }

  const { skip, take, orderBy } = buildPaginationQuery({ page, limit, sortBy: 'createdAt', sortOrder: 'asc' });

  const [logs, total] = await Promise.all([
    prisma.inventoryLog.findMany({
      where: { productId },
      skip,
      take,
      orderBy,
      include: {
        user: { select: { id: true, username: true, fullName: true } },
      },
    }),
    prisma.inventoryLog.count({ where: { productId } }),
  ]);

  // Calculate running balance
  let runningBalance = 0;
  const logsWithBalance = logs.map(log => {
    if (log.type === 'ENTRADA' || log.type === 'DEVOLUCION') {
      runningBalance += log.quantity;
    } else {
      runningBalance -= log.quantity;
    }
    return { ...log, balance: runningBalance };
  });

  return {
    product,
    data: logsWithBalance,
    pagination: getPaginationMeta(page, limit, total),
  };
}

/**
 * Adjust stock manually
 */
export async function adjustStock(data, userId, userName) {
  const { productId, type, quantity, reason } = data;

  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product) {
    throw AppError.notFound('Producto no encontrado');
  }

  if (type === 'SALIDA' && product.stock < quantity) {
    throw AppError.badRequest('El stock disponible no cubre la salida', ERROR_CODES.INSUFFICIENT_STOCK);
  }

  return prisma.$transaction(async (tx) => {
    let newStock = product.stock;
    if (type === 'ENTRADA') newStock += quantity;
    else if (type === 'SALIDA') newStock -= quantity;
    else if (type === 'AJUSTE') newStock = quantity;
    else if (type === 'DEVOLUCION') newStock += quantity;

    const updated = await tx.product.update({
      where: { id: productId },
      data: { stock: newStock },
    });

    const log = await tx.inventoryLog.create({
      data: {
        productId,
        type,
        quantity,
        reason: `Ajuste: ${reason}`,
        userId,
      },
    });

    return { success: true, updatedStock: newStock, log };
  });
}

/**
 * Get inventory summary
 */
export async function getInventorySummary() {
  const [
    totalProducts,
    activeProducts,
    lowStockProducts,
    outOfStockProducts,
    totalValue,
  ] = await Promise.all([
    prisma.product.count(),
    prisma.product.count({ where: { active: true } }),
    prisma.product.count({ where: { active: true, stock: { lte: prisma.product.fields.minStock } } }),
    prisma.product.count({ where: { active: true, stock: 0 } }),
    prisma.product.aggregate({
      where: { active: true },
      _sum: {
        stock: true,
      },
    }),
  ]);

  // Calculate total inventory value (stock * costPrice)
  const products = await prisma.product.findMany({
    where: { active: true },
    select: { stock: true, costPrice: true },
  });

  const inventoryValue = products.reduce((sum, p) => sum + (p.stock * Number(p.costPrice)), 0);

  return {
    totalProducts,
    activeProducts,
    lowStockProducts,
    outOfStockProducts,
    totalStockUnits: totalValue._sum.stock || 0,
    inventoryValue: Math.round(inventoryValue * 100) / 100,
  };
}