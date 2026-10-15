import { prisma } from '../../config/db.js';
import { AppError } from '../../shared/exceptions/AppError.js';
import { ERROR_CODES } from '../../shared/exceptions/AppError.js';
import { quantityError, roundQty } from '../../shared/utils/units.js';
import { getConfig } from '../config/config.service.js';
import { getDefaultSupplier } from '../suppliers/suppliers.service.js';
import { addBatchStock, consumeBatch, consumeFefo, requireBatchFields } from './batches.service.js';
import { buildPaginationQuery, getPaginationMeta, applyCreatedAtRange, cleanFilterString } from '../../shared/utils/helpers.js';

/**
 * Get inventory logs with pagination and filters
 */
export async function getInventoryLogs({ page = 1, limit = 50, sortBy = 'createdAt', sortOrder = 'desc', productId, type, userId, startDate, endDate, q }) {
  const { skip, take, orderBy } = buildPaginationQuery({ page, limit, sortBy, sortOrder });

  const where = {};

  const cleanQ = cleanFilterString(q);
  if (cleanQ) {
    where.OR = [
      { productName: { contains: cleanQ, mode: 'insensitive' } },
      { reason: { contains: cleanQ, mode: 'insensitive' } },
    ];
  }

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

  // AJUSTE fija el stock total (puede ser 0); el resto de movimientos exige una cantidad válida para la unidad
  const qtyError = type === 'AJUSTE' && Number(quantity) === 0 ? null : quantityError(quantity, product.unit);
  if (qtyError) throw AppError.badRequest(qtyError);

  const isOut = type === 'SALIDA' || type === 'MERMA';
  if (isOut && product.stock + 0.004 < quantity) {
    throw AppError.badRequest('El stock disponible no cubre la salida', ERROR_CODES.INSUFFICIENT_STOCK);
  }

  const { perishable } = await getConfig();
  // Perecederos: la entrada pide lote y vencimiento; la salida descuenta por FEFO (se permiten lotes vencidos: es una baja)
  const delta = roundQty(type === 'AJUSTE' ? quantity - product.stock : isOut ? -quantity : quantity);
  const entryBatch = product.isPerishable && delta > 0 ? requireBatchFields(data) : null;

  return prisma.$transaction(async (tx) => {
    let newStock = product.stock;
    if (type === 'ENTRADA') newStock = roundQty(newStock + quantity);
    else if (isOut) newStock = roundQty(newStock - quantity);
    else if (type === 'AJUSTE') newStock = roundQty(quantity);
    else if (type === 'DEVOLUCION') newStock = roundQty(newStock + quantity);

    if (product.isPerishable && delta !== 0) {
      if (delta > 0) {
        await addBatchStock(tx, { productId, ...entryBatch, quantity: delta, costPrice: Number(product.costPrice) });
      } else if (data.batchId) {
        await consumeBatch(tx, product, data.batchId, -delta); // baja de un lote concreto
      } else {
        await consumeFefo(tx, product, -delta, perishable, { allowExpired: true });
      }
    }

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
        // La merma registra el costo perdido (para el reporte de vencimientos y mermas)
        ...(type === 'MERMA' ? { unitCost: Number(product.costPrice), totalCost: Math.round(quantity * Number(product.costPrice) * 100) / 100 } : {}),
      },
    });

    return { success: true, updatedStock: newStock, log };
  });
}

/**
 * Register purchase from supplier (entry with cost)
 */
export async function registerPurchase(data, userId, userName) {
  const { productId, quantity, unitCost, invoiceNumber } = data;
  let supplier = data.supplier;
  // Sin proveedor, la compra se registra con el «Proveedor general»
  const supplierId = data.supplierId || (await getDefaultSupplier())?.id;

  if (supplierId) {
    const supplierRecord = await prisma.supplier.findUnique({ where: { id: supplierId } });
    if (!supplierRecord || !supplierRecord.active) {
      throw AppError.notFound('Proveedor no encontrado o inactivo');
    }
    supplier = supplierRecord.name;
  }

  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product) {
    throw AppError.notFound('Producto no encontrado');
  }
  const purchaseQtyError = quantityError(quantity, product.unit);
  if (purchaseQtyError) throw AppError.badRequest(purchaseQtyError);

  // Perecederos: cada compra entra como lote con su vencimiento
  const batchFields = product.isPerishable ? requireBatchFields(data) : null;
  const totalCost = Math.round(quantity * Number(unitCost) * 100) / 100;

  // Weighted average cost: ((current stock x current cost) + (qty x new unit cost)) / new stock
  const currentStock = product.stock || 0;
  const currentCost = Number(product.costPrice) || 0;
  const newStock = roundQty(currentStock + quantity);
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

    if (batchFields) {
      await addBatchStock(tx, { productId, ...batchFields, quantity, costPrice: Number(unitCost), supplierId: supplierId || null });
    }

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
        supplierId: supplierId || null,
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