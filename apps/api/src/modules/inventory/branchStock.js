import { prisma } from '../../config/db.js';
import { getTenantId } from '../../config/tenant.js';
import { AppError, ERROR_CODES } from '../../shared/exceptions/AppError.js';
import { roundQty } from '../../shared/utils/units.js';

/**
 * Existencias por sucursal. Invariante: Product.stock = suma de BranchStock.stock de sus sucursales
 * (más, en perecederos, la suma de los lotes de cada sucursal = su BranchStock).
 * Todo cambio de stock pasa por `changeBranchStock`, que mantiene las dos cifras en la misma transacción.
 */

const EPS = 0.004; // tolerancia de coma flotante en cantidades con 2 decimales

const key = (branchId, productId) => ({ branchId_productId: { branchId, productId } });
const insufficient = name => AppError.badRequest(`Stock insuficiente para ${name}`, ERROR_CODES.INSUFFICIENT_STOCK);

/** Stock de un producto en una sucursal (0 si nunca tuvo). `client` puede ser `prisma` o una transacción. */
export async function getBranchStock(client, productId, branchId) {
  const row = await client.branchStock.findUnique({ where: key(branchId, productId), select: { stock: true } });
  return row?.stock ?? 0;
}

/** Stock de varios productos en una sucursal: Map(productId -> stock). */
export async function getBranchStockMap(client, productIds, branchId) {
  if (!productIds.length) return new Map();
  const rows = await client.branchStock.findMany({ where: { branchId, productId: { in: productIds } }, select: { productId: true, stock: true } });
  return new Map(rows.map(r => [r.productId, r.stock]));
}

async function addStock(tx, productId, branchId, qty) {
  try {
    await tx.branchStock.upsert({
      where: key(branchId, productId),
      create: { productId, branchId, stock: qty, companyId: getTenantId() },
      update: { stock: { increment: qty } },
    });
  } catch (err) {
    // Dos entradas simultáneas del mismo producto en una sucursal nueva: la segunda ya encuentra la fila
    if (err?.code !== 'P2002') throw err;
    await tx.branchStock.update({ where: key(branchId, productId), data: { stock: { increment: qty } } });
  }
  await tx.product.update({ where: { id: productId }, data: { stock: { increment: qty } } });
}

/**
 * Suma (delta > 0) o resta (delta < 0) stock de un producto en una sucursal y mantiene Product.stock.
 * La resta es atómica: si la sucursal no tiene suficiente, lanza INSUFFICIENT_STOCK y no cambia nada.
 */
export async function changeBranchStock(tx, { productId, branchId, delta, productName = 'el producto' }) {
  const amount = roundQty(delta);
  if (amount === 0) return;
  if (amount > 0) return addStock(tx, productId, branchId, amount);

  const qty = -amount;
  await takeStock(tx.branchStock, { ...key(branchId, productId) }, qty, productName);
  await takeStock(tx.product, { id: productId }, qty, productName);
}

/**
 * Resta `qty` de una fila solo si alcanza (un único UPDATE guardado que devuelve la fila: sin lecturas ni segundo UPDATE en el caso normal).
 * Si el resto queda en polvo de coma flotante (p. ej. 1e-16) lo deja en 0.
 */
async function takeStock(delegate, where, qty, productName) {
  let row;
  try {
    row = await delegate.update({ where: { ...where, stock: { gte: qty - EPS } }, data: { stock: { decrement: qty } }, select: { stock: true } });
  } catch (err) {
    if (err?.code === 'P2025') throw insufficient(productName);
    throw err;
  }
  if (row.stock !== 0 && Math.abs(row.stock) < EPS) await delegate.update({ where, data: { stock: 0 } });
}

/** Fija el stock de una sucursal (ajuste de conteo). Devuelve el delta aplicado. */
export async function setBranchStock(tx, { productId, branchId, newStock, productName }) {
  const current = await getBranchStock(tx, productId, branchId);
  const delta = roundQty(newStock - current);
  await changeBranchStock(tx, { productId, branchId, delta, productName });
  return delta;
}

/** Productos activos con su stock en una sucursal y el total de la empresa (para listados). */
export async function sumBranchStock(productId) {
  const agg = await prisma.branchStock.aggregate({ where: { productId }, _sum: { stock: true } });
  return agg._sum.stock || 0;
}
