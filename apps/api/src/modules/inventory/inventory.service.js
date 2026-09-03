import { prisma } from '../../config/db.js';
import { AppError } from '../../shared/exceptions/AppError.js';
import { ERROR_CODES } from '../../shared/exceptions/AppError.js';
import { buildPaginationQuery, getPaginationMeta, applyCreatedAtRange, cleanFilterString } from '../../shared/utils/helpers.js';

/**
 * Get inventory logs with pagination and filters
 */
export async function getInventoryLogs({ page = 1, limit = 50, sortBy = 'createdAt', sortOrder = 'desc', productId, type, userId, startDate, endDate }) {
  const { skip, take, orderBy } = buildPaginationQuery({ page, limit, sortBy, sortOrder });

  const where = {};

  const cleanProduct = cleanFilterString(productId);
  if (cleanProduct) where.productId = cleanProduct;
  if (type) where.type = type;
  const cleanUser = cleanFilterString(userId);
  if (cleanUser) where.userId = cleanUser;

  applyCreatedAtRange(where, startDate, endDate);

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
        productName: product.name,
        type,
        quantity,
        reason: `Ajuste: ${reason}`,
        userId,
        userName,
      },
    });

    return { success: true, updatedStock: newStock, log };
  });
}

/**
 * Register purchase from supplier (entry with cost)
 */
export async function registerPurchase(data, userId, userName) {
  const { productId, quantity, unitCost, supplier, invoiceNumber } = data;

  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product) {
    throw AppError.notFound('Producto no encontrado');
  }

  const totalCost = Math.round(quantity * Number(unitCost) * 100) / 100;

  // Weighted average cost: ((current stock x current cost) + (qty x new unit cost)) / new stock
  const currentStock = product.stock || 0;
  const currentCost = Number(product.costPrice) || 0;
  const newStock = currentStock + quantity;
  const weightedAverageCost = newStock > 0
    ? Math.round(((currentStock * currentCost + quantity * Number(unitCost)) / newStock) * 100) / 100
    : Number(unitCost);

  return prisma.$transaction(async (tx) => {
    const updated = await tx.product.update({
      where: { id: productId },
      data: {
        stock: newStock,
        costPrice: weightedAverageCost,
      },
    });

    const log = await tx.inventoryLog.create({
      data: {
        productId,
        productName: product.name,
        type: 'ENTRADA',
        quantity,
        reason: `Compra a proveedor: ${supplier}${invoiceNumber ? ` (Factura ${invoiceNumber})` : ''}`,
        userId,
        userName,
        unitCost: Number(unitCost),
        totalCost,
        supplier,
        invoiceNumber: invoiceNumber || null,
      },
    });

    return { success: true, updatedStock: updated.stock, totalCost, newPurchasePrice: weightedAverageCost, log };
  });
}

/**
 * Get inventory summary
 */
export async function getInventorySummary() {
  const [
    totalProducts,
    activeProducts,
    outOfStockProducts,
    totalValue,
    activeList,
  ] = await Promise.all([
    prisma.product.count(),
    prisma.product.count({ where: { active: true } }),
    prisma.product.count({ where: { active: true, stock: 0 } }),
    prisma.product.aggregate({
      where: { active: true },
      _sum: {
        stock: true,
      },
    }),
    prisma.product.findMany({
      where: { active: true },
      select: { stock: true, minStock: true },
    }),
  ]);

  const lowStockProducts = activeList.filter(p => p.stock <= p.minStock).length;

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