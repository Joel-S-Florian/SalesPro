import { prisma } from '../../config/db.js';
import { getTenantId } from '../../config/tenant.js';
import { AppError, ERROR_CODES } from '../../shared/exceptions/AppError.js';
import { getConfig } from '../config/config.service.js';
import { allocateFefo, batchStatus, sortFefo, daysLeft, DEFAULT_BATCH_NUMBER, discountPercentFor, parseExpiration } from './batches.logic.js';

/**
 * Lotes de productos perecederos. Invariante: Product.stock = suma de currentStock de sus lotes.
 * Las funciones con `tx` solo tocan lotes; quien las llama actualiza Product.stock y el kárdex.
 */

const round2 = n => Math.round(n * 100) / 100;
const EPS = 0.004; // tolerancia de coma flotante en cantidades con 2 decimales

/** Valida lote y vencimiento exigidos en una entrada de un perecedero. */
export function requireBatchFields({ batchNumber, expirationDate }) {
  const number = String(batchNumber || '').trim();
  if (!number) throw AppError.badRequest('Indique el número de lote del producto perecedero');
  if (number.toUpperCase() === DEFAULT_BATCH_NUMBER) throw AppError.badRequest(`"${DEFAULT_BATCH_NUMBER}" está reservado para stock sin lote`);
  const expiration = parseExpiration(expirationDate);
  if (!expiration) throw AppError.badRequest('Indique la fecha de vencimiento (AAAA-MM-DD)');
  return { batchNumber: number, expiration };
}

/** Suma stock a un lote (lo crea si no existe). No modifica Product.stock. */
export async function addBatchStock(tx, { productId, batchNumber, expiration, quantity, costPrice = 0, supplierId = null }) {
  const existing = await tx.productBatch.findFirst({ where: { productId, batchNumber } });
  if (existing) {
    const sameDate = (existing.expirationDate?.getTime() ?? null) === (expiration?.getTime() ?? null);
    if (!sameDate) throw AppError.badRequest(`El lote ${batchNumber} ya existe con otra fecha de vencimiento`);
    return tx.productBatch.update({
      where: { id: existing.id },
      data: { currentStock: { increment: quantity }, initialStock: { increment: quantity }, ...(costPrice ? { costPrice } : {}) },
    });
  }
  return tx.productBatch.create({
    data: {
      companyId: getTenantId(),
      productId,
      batchNumber,
      expirationDate: expiration || null,
      initialStock: quantity,
      currentStock: quantity,
      costPrice,
      supplierId,
    },
  });
}

/** Stock sin lote (SIN-LOTE, sin vencimiento): al marcar perecedero un producto con stock o en importaciones sin lote. */
export function addUnbatchedStock(tx, { productId, quantity, costPrice = 0 }) {
  return addBatchStock(tx, { productId, batchNumber: DEFAULT_BATCH_NUMBER, expiration: null, quantity, costPrice });
}

/** Reparte una salida FEFO y descuenta los lotes de forma atómica. Devuelve las asignaciones. */
export async function consumeFefo(tx, product, quantity, perishable, { allowExpired } = {}) {
  const batches = await tx.productBatch.findMany({ where: { productId: product.id, currentStock: { gt: EPS } } });
  const { allocations, missing } = allocateFefo(batches, quantity, { allowExpired: allowExpired ?? !perishable.blockExpiredSales });
  if (missing > 0) {
    throw AppError.badRequest(`Stock insuficiente para ${product.name} (lotes vigentes: ${round2(quantity - missing)})`, ERROR_CODES.INSUFFICIENT_STOCK);
  }
  for (const allocation of allocations) {
    const { count } = await tx.productBatch.updateMany({
      where: { id: allocation.batchId, currentStock: { gte: allocation.quantity - EPS } },
      data: { currentStock: { decrement: allocation.quantity } },
    });
    if (count !== 1) throw AppError.conflict(`El stock de ${product.name} cambió mientras se procesaba la venta; intente de nuevo`);
    await tx.productBatch.updateMany({ where: { id: allocation.batchId, currentStock: { lt: EPS, gt: -EPS } }, data: { currentStock: 0 } });
  }
  return allocations;
}

/** Baja de un lote concreto (merma por vencimiento, rotura...). */
export async function consumeBatch(tx, product, batchId, quantity) {
  const batch = await tx.productBatch.findFirst({ where: { id: batchId, productId: product.id } });
  if (!batch) throw AppError.notFound('Lote no encontrado para este producto');
  const { count } = await tx.productBatch.updateMany({
    where: { id: batchId, currentStock: { gte: quantity - EPS } },
    data: { currentStock: { decrement: quantity } },
  });
  if (count !== 1) throw AppError.badRequest(`El lote ${batch.batchNumber} solo tiene ${round2(batch.currentStock)} unidad(es)`, ERROR_CODES.INSUFFICIENT_STOCK);
  await tx.productBatch.updateMany({ where: { id: batchId, currentStock: { lt: EPS, gt: -EPS } }, data: { currentStock: 0 } });
  return [{ batchId, quantity }];
}

/**
 * Vista previa (sin escribir) de la asignación FEFO de una línea de venta y de su descuento por vencimiento.
 * Sirve para fijar el precio antes de la transacción; consumeFefo vuelve a validar al descontar.
 */
export async function previewSaleLine(product, quantity, unitPrice, perishable) {
  const batches = await prisma.productBatch.findMany({ where: { productId: product.id, currentStock: { gt: EPS } } });
  const { allocations, missing } = allocateFefo(batches, quantity, { allowExpired: !perishable.blockExpiredSales });
  if (missing > 0) {
    throw AppError.badRequest(`Stock insuficiente para ${product.name}. Disponible (lotes vigentes): ${round2(quantity - missing)}`, ERROR_CODES.INSUFFICIENT_STOCK);
  }
  let autoDiscount = 0;
  for (const allocation of allocations) {
    const percent = discountPercentFor(daysLeft(allocation.expirationDate), perishable);
    allocation.discountPercent = percent;
    autoDiscount += (unitPrice * allocation.quantity * percent) / 100;
  }
  return { allocations, autoDiscount: round2(autoDiscount) };
}

/**
 * Devuelve unidades a los lotes de los que salieron en la venta original (los más recientes primero).
 * Lo que no se pueda rastrear (ventas anteriores a los lotes) vuelve al lote SIN-LOTE.
 * Devuelve las asignaciones para que la nota de crédito las registre.
 */
export async function restoreToBatches(tx, { originalSaleId, productId, quantity, costPrice = 0 }) {
  const sold = await tx.saleBatchDetail.findMany({
    where: { saleDetail: { saleId: originalSaleId, productId }, quantity: { gt: 0 } },
    orderBy: { id: 'desc' },
  });
  const returned = await tx.saleBatchDetail.findMany({
    where: { saleDetail: { sale: { relatedSaleId: originalSaleId }, productId } },
  });
  const returnedByBatch = new Map();
  for (const row of returned) returnedByBatch.set(row.batchId, (returnedByBatch.get(row.batchId) || 0) + Math.abs(row.quantity));
  const soldByBatch = new Map();
  for (const row of sold) soldByBatch.set(row.batchId, (soldByBatch.get(row.batchId) || 0) + row.quantity);

  let remaining = quantity;
  const restored = [];
  for (const [batchId, soldQty] of soldByBatch) {
    if (remaining <= 0) break;
    const take = round2(Math.min(soldQty - (returnedByBatch.get(batchId) || 0), remaining));
    if (take <= EPS) continue;
    await tx.productBatch.update({ where: { id: batchId }, data: { currentStock: { increment: take } } });
    restored.push({ batchId, quantity: take });
    remaining = round2(remaining - take);
  }
  if (remaining > EPS) {
    const fallback = await addUnbatchedStock(tx, { productId, quantity: remaining, costPrice });
    restored.push({ batchId: fallback.id, quantity: remaining });
  }
  return restored;
}

export function decorate(batch, perishable, now = new Date()) {
  const days = daysLeft(batch.expirationDate, now);
  return {
    ...batch,
    daysLeft: days,
    status: batchStatus(batch.expirationDate, perishable, now),
    discountPercent: discountPercentFor(days, perishable),
  };
}

/**
 * Agrega a cada producto perecedero su lote más próximo (el que FEFO venderá primero) con estado y descuento,
 * para que el POS y el catálogo muestren la alerta y el precio con descuento sin otra consulta.
 */
export async function attachNearestBatch(products) {
  const perishableIds = products.filter(p => p.isPerishable).map(p => p.id);
  if (!perishableIds.length) return products;
  const { perishable } = await getConfig();
  const batches = await prisma.productBatch.findMany({
    where: { productId: { in: perishableIds }, currentStock: { gt: EPS } },
    orderBy: [{ expirationDate: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }],
  });
  // Lotes vendibles por producto, en orden FEFO (los vencidos se excluyen si la empresa los bloquea)
  const sellable = new Map();
  for (const batch of sortFefo(batches)) {
    const expired = batch.expirationDate && daysLeft(batch.expirationDate) < 0;
    if (expired && perishable.blockExpiredSales) continue;
    if (!sellable.has(batch.productId)) sellable.set(batch.productId, []);
    sellable.get(batch.productId).push(batch);
  }
  return products.map(p => {
    if (!p.isPerishable) return p;
    const lots = sellable.get(p.id) || [];
    const batch = lots[0];
    // lots / sellableStock permiten al POS calcular el mismo descuento y límite de venta que el servidor
    const extra = {
      sellableStock: lots.reduce((sum, lot) => sum + lot.currentStock, 0),
      lots: lots.slice(0, 12).map(lot => {
        const d = decorate(lot, perishable);
        return { currentStock: lot.currentStock, daysLeft: d.daysLeft, discountPercent: d.discountPercent };
      }),
    };
    if (!batch) return { ...p, ...extra, nearestBatch: null };
    const decorated = decorate(batch, perishable);
    return {
      ...p,
      ...extra,
      nearestBatch: {
        batchNumber: batch.batchNumber,
        expirationDate: batch.expirationDate,
        currentStock: batch.currentStock,
        daysLeft: decorated.daysLeft,
        status: decorated.status,
        discountPercent: decorated.discountPercent,
      },
    };
  });
}

/** Lotes de un producto (más próximos a vencer primero) con su estado. */
export async function listBatches(productId, { includeEmpty = false } = {}) {
  const [config, batches] = await Promise.all([
    getConfig(),
    prisma.productBatch.findMany({
      where: { productId, ...(includeEmpty ? {} : { currentStock: { gt: EPS } }) },
      orderBy: [{ expirationDate: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }],
      include: { supplier: { select: { id: true, name: true } } },
    }),
  ]);
  return batches.map(batch => decorate(batch, config.perishable));
}

/**
 * Lotes en riesgo: vencidos, críticos (rojo) y por vencer (amarillo), con existencias.
 * status: ALL | EXPIRED | RED | YELLOW
 */
export async function getExpiringBatches({ status = 'ALL', page = 1, limit = 50 } = {}) {
  const { perishable } = await getConfig();
  const cutoff = new Date(Date.now() + (perishable.yellowThresholdDays + 1) * 86400000);
  const rows = await prisma.productBatch.findMany({
    where: { currentStock: { gt: EPS }, expirationDate: { not: null, lte: cutoff }, product: { active: true } },
    orderBy: { expirationDate: 'asc' },
    include: { product: { select: { id: true, code: true, name: true, costPrice: true } }, supplier: { select: { id: true, name: true } } },
  });
  const all = rows.map(row => decorate(row, perishable)).filter(row => row.status !== 'OK' && row.status !== 'NO_EXPIRY');
  const summary = { expired: 0, red: 0, yellow: 0, valueAtRisk: 0 };
  for (const row of all) {
    if (row.status === 'EXPIRED') summary.expired += 1;
    else if (row.status === 'RED') summary.red += 1;
    else summary.yellow += 1;
    summary.valueAtRisk += row.currentStock * Number(row.costPrice || row.product.costPrice || 0);
  }
  summary.valueAtRisk = round2(summary.valueAtRisk);
  const filtered = status === 'ALL' ? all : all.filter(row => row.status === status);
  const start = (Math.max(1, page) - 1) * limit;
  return {
    enabled: perishable.enabled,
    thresholds: { yellow: perishable.yellowThresholdDays, red: perishable.redThresholdDays },
    summary,
    data: filtered.slice(start, start + limit),
    pagination: { page, limit, total: filtered.length, totalPages: Math.max(1, Math.ceil(filtered.length / limit)) },
  };
}

/** Resumen corto para el dashboard y el aviso de inicio de turno. */
export async function getExpiringSummary() {
  const { perishable } = await getConfig();
  if (!perishable.enabled) return { enabled: false, expired: 0, red: 0, yellow: 0, valueAtRisk: 0 };
  const { summary } = await getExpiringBatches({ limit: 1 });
  return { enabled: true, ...summary };
}
