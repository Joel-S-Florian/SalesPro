import { prisma } from '../../config/db.js';
import { getTenantId } from '../../config/tenant.js';
import { AppError } from '../../shared/exceptions/AppError.js';
import { quantityError, roundQty } from '../../shared/utils/units.js';
import { buildPaginationQuery, getPaginationMeta } from '../../shared/utils/helpers.js';
import { getConfig } from '../config/config.service.js';
import { addBatchStock, consumeFefo } from '../inventory/batches.service.js';
import { changeBranchStock } from '../inventory/branchStock.js';

/**
 * Transferencias de mercancía entre sucursales de la misma empresa.
 *  - Al crearla (ENVIADA) la mercancía sale del origen y no cuenta en ninguna sucursal mientras va en camino.
 *  - Al recibirla (RECIBIDA) entra al destino; los perecederos conservan lote y vencimiento.
 *  - Si se anula en tránsito (ANULADA) vuelve al origen.
 * Product.stock (suma de sucursales) baja al enviar y sube al recibir, siempre en la misma transacción.
 */

export const transferCode = number => `T-${String(number).padStart(6, '0')}`;

const include = {
  fromBranch: { select: { id: true, name: true, code: true } },
  toBranch: { select: { id: true, name: true, code: true } },
  lines: { orderBy: { productName: 'asc' } },
};

const decorate = transfer => ({ ...transfer, code: transferCode(transfer.number), lines: transfer.lines?.map(l => ({ ...l, lots: l.lots || [] })) });

export async function listTransfers({ page = 1, limit = 20, status, branchId } = {}) {
  const { skip, take } = buildPaginationQuery({ page, limit, sortBy: 'createdAt', sortOrder: 'desc' });
  const where = {
    ...(status ? { status } : {}),
    ...(branchId ? { OR: [{ fromBranchId: branchId }, { toBranchId: branchId }] } : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.stockTransfer.findMany({ where, skip, take, orderBy: { createdAt: 'desc' }, include }),
    prisma.stockTransfer.count({ where }),
  ]);
  return { data: rows.map(decorate), pagination: getPaginationMeta(page, limit, total) };
}

export async function getTransfer(id) {
  const transfer = await prisma.stockTransfer.findUnique({ where: { id }, include });
  if (!transfer) throw AppError.notFound('Transferencia no encontrada');
  return decorate(transfer);
}

async function activeBranch(id, label) {
  const branch = await prisma.branch.findUnique({ where: { id } });
  if (!branch || !branch.active) throw AppError.badRequest(`La sucursal ${label} no existe o está inactiva`);
  return branch;
}

export async function createTransfer({ fromBranchId, toBranchId, note, lines }, requester) {
  if (fromBranchId === toBranchId) throw AppError.badRequest('El origen y el destino deben ser sucursales distintas');
  await activeBranch(fromBranchId, 'de origen');
  const to = await activeBranch(toBranchId, 'de destino');

  const ids = lines.map(l => l.productId);
  if (new Set(ids).size !== ids.length) throw AppError.badRequest('Un producto solo puede aparecer una vez en la transferencia');
  const products = await prisma.product.findMany({ where: { id: { in: ids } } });
  const byId = new Map(products.map(p => [p.id, p]));
  for (const line of lines) {
    const product = byId.get(line.productId);
    if (!product) throw AppError.notFound('Producto no encontrado');
    if (!product.active) throw AppError.badRequest(`El producto ${product.name} está inactivo`);
    const qtyError = quantityError(line.quantity, product.unit);
    if (qtyError) throw AppError.badRequest(`${product.name}: ${qtyError}`);
  }
  const { perishable } = await getConfig();

  const transfer = await prisma.$transaction(async tx => {
    const created = await tx.stockTransfer.create({
      data: { fromBranchId, toBranchId, note: note || null, createdById: requester.userId, createdByName: requester.fullName, companyId: getTenantId() },
    });
    const code = transferCode(created.number);
    // Siempre en el mismo orden (por producto) para que dos transferencias no se bloqueen entre sí
    for (const line of [...lines].sort((a, b) => (a.productId < b.productId ? -1 : 1))) {
      const product = byId.get(line.productId);
      const quantity = roundQty(line.quantity);
      let lots = null;
      if (product.isPerishable) {
        // Sale por FEFO (se permiten lotes vencidos: es mercancía que se mueve, no una venta)
        const allocations = await consumeFefo(tx, product, quantity, perishable, { allowExpired: true, branchId: fromBranchId });
        const batches = await tx.productBatch.findMany({ where: { id: { in: allocations.map(a => a.batchId) } } });
        const batchById = new Map(batches.map(b => [b.id, b]));
        lots = allocations.map(a => {
          const batch = batchById.get(a.batchId);
          return { batchNumber: batch.batchNumber, expirationDate: batch.expirationDate ? batch.expirationDate.toISOString() : null, quantity: a.quantity, costPrice: Number(batch.costPrice), supplierId: batch.supplierId };
        });
      }
      await changeBranchStock(tx, { productId: product.id, branchId: fromBranchId, delta: -quantity, productName: product.name });
      await tx.stockTransferLine.create({ data: { transferId: created.id, productId: product.id, productName: product.name, quantity, lots, companyId: getTenantId() } });
      await tx.inventoryLog.create({
        data: { productId: product.id, productName: product.name, branchId: fromBranchId, type: 'TRANSFER_OUT', quantity, reason: `Transferencia ${code} hacia ${to.name}`, userId: requester.userId, userName: requester.fullName },
      });
    }
    return created;
  });
  return getTransfer(transfer.id);
}

/** Aplica las líneas de una transferencia a una sucursal (recibir en destino, o devolver al origen al anular). */
async function putLinesIn(tx, transfer, branchId, { type, reason, requester }) {
  for (const line of [...transfer.lines].sort((a, b) => (a.productId < b.productId ? -1 : 1))) {
    for (const lot of line.lots || []) {
      await addBatchStock(tx, {
        productId: line.productId,
        branchId,
        batchNumber: lot.batchNumber,
        expiration: lot.expirationDate ? new Date(lot.expirationDate) : null,
        quantity: lot.quantity,
        costPrice: lot.costPrice || 0,
        supplierId: lot.supplierId || null,
      });
    }
    await changeBranchStock(tx, { productId: line.productId, branchId, delta: line.quantity, productName: line.productName });
    await tx.inventoryLog.create({
      data: { productId: line.productId, productName: line.productName, branchId, type, quantity: line.quantity, reason, userId: requester.userId, userName: requester.fullName },
    });
  }
}

export async function receiveTransfer(id, requester) {
  const transfer = await getTransfer(id);
  if (transfer.status !== 'ENVIADA') throw AppError.conflict(`La transferencia ${transfer.code} ya está ${transfer.status === 'RECIBIDA' ? 'recibida' : 'anulada'}`);
  await activeBranch(transfer.toBranchId, 'de destino');
  await prisma.$transaction(async tx => {
    // Solo una persona puede recibirla: si otra ya la recibió o anuló, esta no cuenta nada
    const { count } = await tx.stockTransfer.updateMany({
      where: { id, status: 'ENVIADA' },
      data: { status: 'RECIBIDA', receivedAt: new Date(), receivedById: requester.userId, receivedByName: requester.fullName },
    });
    if (count !== 1) throw AppError.conflict('La transferencia cambió mientras se procesaba; actualice la pantalla');
    await putLinesIn(tx, transfer, transfer.toBranchId, { type: 'TRANSFER_IN', reason: `Transferencia ${transfer.code} desde ${transfer.fromBranch.name}`, requester });
  });
  return getTransfer(id);
}

export async function voidTransfer(id, requester) {
  const transfer = await getTransfer(id);
  if (transfer.status !== 'ENVIADA') throw AppError.conflict(`Solo se puede anular una transferencia en tránsito (esta ya está ${transfer.status === 'RECIBIDA' ? 'recibida' : 'anulada'})`);
  await prisma.$transaction(async tx => {
    const { count } = await tx.stockTransfer.updateMany({ where: { id, status: 'ENVIADA' }, data: { status: 'ANULADA', voidedAt: new Date() } });
    if (count !== 1) throw AppError.conflict('La transferencia cambió mientras se procesaba; actualice la pantalla');
    await putLinesIn(tx, transfer, transfer.fromBranchId, { type: 'TRANSFER_IN', reason: `Anulación de la transferencia ${transfer.code}: regresa a ${transfer.fromBranch.name}`, requester });
  });
  return getTransfer(id);
}
