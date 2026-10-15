import { prisma } from '../../config/db.js';
import { AppError } from '../../shared/exceptions/AppError.js';
import { ERROR_CODES } from '../../shared/exceptions/AppError.js';
import { quantityError, roundQty } from '../../shared/utils/units.js';
import { getConfig } from '../config/config.service.js';
import { assertFeature } from '../../shared/plans.js';
import { getSystemSupplier } from '../suppliers/suppliers.service.js';
import { addBatchStock, consumeBatch, consumeFefo, requireBatchFields } from './batches.service.js';
import { changeBranchStock, getBranchStock, getBranchStockMap } from './branchStock.js';
import { getWorkingBranchId } from '../branches/branches.service.js';
import { buildPaginationQuery, getPaginationMeta, applyCreatedAtRange, cleanFilterString } from '../../shared/utils/helpers.js';

/**
 * Get inventory logs with pagination and filters
 */
export async function getInventoryLogs({ page = 1, limit = 50, sortBy = 'createdAt', sortOrder = 'desc', productId, type, userId, startDate, endDate, q, branchId }) {
  const { skip, take, orderBy } = buildPaginationQuery({ page, limit, sortBy, sortOrder });

  // Por omisión, los movimientos de la sucursal de trabajo; branchId=ALL trae los de toda la empresa
  const where = branchId === 'ALL' ? {} : { branchId: branchId || (await getWorkingBranchId()) };

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
        branch: { select: { id: true, name: true } },
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
  const branchId = await getWorkingBranchId();
  const logWhere = { productId, branchId };
  const branchStock = await getBranchStock(prisma, productId, branchId);

  const [logs, total] = await Promise.all([
    prisma.inventoryLog.findMany({
      where: logWhere,
      skip,
      take,
      orderBy,
      include: {
        user: { select: { id: true, username: true, fullName: true } },
      },
    }),
    prisma.inventoryLog.count({ where: logWhere }),
  ]);

  // Calculate running balance
  let runningBalance = 0;
  const logsWithBalance = logs.map(log => {
    if (log.type === 'ENTRADA' || log.type === 'DEVOLUCION' || log.type === 'TRANSFER_IN') {
      runningBalance += log.quantity;
    } else {
      runningBalance -= log.quantity;
    }
    return { ...log, balance: runningBalance };
  });

  return {
    // `stock` es el de la sucursal de trabajo; `totalStock` el de toda la empresa
    product: { ...product, stock: branchStock, totalStock: product.stock },
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

  const branchId = await getWorkingBranchId();
  const currentStock = await getBranchStock(prisma, productId, branchId);
  const isOut = type === 'SALIDA' || type === 'MERMA';
  if (isOut && currentStock + 0.004 < quantity) {
    throw AppError.badRequest('El stock disponible no cubre la salida', ERROR_CODES.INSUFFICIENT_STOCK);
  }

  const { perishable } = await getConfig();
  // Perecederos: la entrada pide lote y vencimiento; la salida descuenta por FEFO (se permiten lotes vencidos: es una baja)
  const delta = roundQty(type === 'AJUSTE' ? quantity - currentStock : isOut ? -quantity : quantity);
  if (product.isPerishable && delta > 0) await assertFeature('perishables'); // crear o sumar a un lote
  const entryBatch = product.isPerishable && delta > 0 ? requireBatchFields(data) : null;

  return prisma.$transaction(async (tx) => {
    const newStock = roundQty(currentStock + delta);

    if (product.isPerishable && delta !== 0) {
      if (delta > 0) {
        await addBatchStock(tx, { productId, branchId, ...entryBatch, quantity: delta, costPrice: Number(product.costPrice) });
      } else if (data.batchId) {
        await consumeBatch(tx, product, data.batchId, -delta, { branchId }); // baja de un lote concreto
      } else {
        await consumeFefo(tx, product, -delta, perishable, { allowExpired: true, branchId });
      }
    }

    await changeBranchStock(tx, { productId, branchId, delta, productName: product.name });

    const log = await tx.inventoryLog.create({
      data: {
        productId,
        branchId,
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
  // Sin proveedor, la compra se registra con el «Compra sin proveedor»
  const supplierId = data.supplierId || (await getSystemSupplier())?.id;

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
  if (product.isPerishable) await assertFeature('perishables'); // cada compra de un perecedero crea o suma a un lote
  const batchFields = product.isPerishable ? requireBatchFields(data) : null;
  const totalCost = Math.round(quantity * Number(unitCost) * 100) / 100;

  const branchId = await getWorkingBranchId();
  // Costo promedio ponderado con el stock de toda la empresa (el costo es del producto, no de la sucursal)
  const currentStock = product.stock || 0;
  const currentCost = Number(product.costPrice) || 0;
  const newStock = roundQty(currentStock + quantity);
  const weightedAverageCost = newStock > 0
    ? Math.round(((currentStock * currentCost + quantity * Number(unitCost)) / newStock) * 100) / 100
    : Number(unitCost);

  return prisma.$transaction(async (tx) => {
    await tx.product.update({ where: { id: productId }, data: { costPrice: weightedAverageCost } });

    if (batchFields) {
      await addBatchStock(tx, { productId, branchId, ...batchFields, quantity, costPrice: Number(unitCost), supplierId: supplierId || null });
    }
    await changeBranchStock(tx, { productId, branchId, delta: quantity, productName: product.name });
    const branchStockNow = await getBranchStock(tx, productId, branchId);

    const log = await tx.inventoryLog.create({
      data: {
        productId,
        branchId,
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

    return { success: true, updatedStock: branchStockNow, totalCost, newPurchasePrice: weightedAverageCost, log };
  });
}

/**
 * Resumen del inventario de la sucursal de trabajo (existencias, valor, bajo mínimo y agotados).
 */
export async function getInventorySummary() {
  const branchId = await getWorkingBranchId();
  const [totalProducts, products] = await Promise.all([
    prisma.product.count(),
    prisma.product.findMany({ where: { active: true }, select: { id: true, minStock: true, costPrice: true } }),
  ]);
  const stocks = await getBranchStockMap(prisma, products.map(p => p.id), branchId);

  let totalStockUnits = 0;
  let inventoryValue = 0;
  let lowStockProducts = 0;
  let outOfStockProducts = 0;
  for (const p of products) {
    const stock = stocks.get(p.id) ?? 0;
    totalStockUnits += stock;
    inventoryValue += stock * Number(p.costPrice);
    if (stock <= p.minStock) lowStockProducts += 1;
    if (stock === 0) outOfStockProducts += 1;
  }

  return {
    totalProducts,
    activeProducts: products.length,
    lowStockProducts,
    outOfStockProducts,
    totalStockUnits,
    inventoryValue: Math.round(inventoryValue * 100) / 100,
  };
}
