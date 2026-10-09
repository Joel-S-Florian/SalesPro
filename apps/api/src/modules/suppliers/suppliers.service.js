import { prisma } from '../../config/db.js';
import { AppError, ERROR_CODES } from '../../shared/exceptions/AppError.js';
import { buildPaginationQuery, getPaginationMeta, cleanFilterString } from '../../shared/utils/helpers.js';

// Los campos opcionales vacíos se guardan como null (rnc es único: '' chocaría entre proveedores)
const normalize = data =>
  Object.fromEntries(Object.entries(data).map(([key, value]) => [key, value === '' ? null : value]));

const SORTABLE = ['name', 'createdAt', 'rnc'];

export async function getSuppliers({ page = 1, limit = 20, sortBy = 'name', sortOrder = 'asc', q, active }) {
  const { skip, take, orderBy } = buildPaginationQuery({
    page,
    limit,
    sortBy: SORTABLE.includes(sortBy) ? sortBy : 'name',
    sortOrder,
  });

  const cleanQ = cleanFilterString(q);
  const where = {
    ...(active !== undefined && { active: active === 'true' }),
    ...(cleanQ && {
      OR: [
        { name: { contains: cleanQ, mode: 'insensitive' } },
        { rnc: { contains: cleanQ, mode: 'insensitive' } },
        { contactName: { contains: cleanQ, mode: 'insensitive' } },
        { email: { contains: cleanQ, mode: 'insensitive' } },
      ],
    }),
  };

  const [suppliers, total] = await Promise.all([
    prisma.supplier.findMany({
      where,
      skip,
      take,
      orderBy,
      include: { _count: { select: { purchases: true } } },
    }),
    prisma.supplier.count({ where }),
  ]);

  return { data: suppliers, pagination: getPaginationMeta(page, limit, total) };
}

export async function getSupplierById(id) {
  const supplier = await prisma.supplier.findUnique({
    where: { id },
    include: { _count: { select: { purchases: true } } },
  });
  if (!supplier) throw AppError.notFound('Proveedor no encontrado');
  return supplier;
}

async function assertRncAvailable(rnc, exceptId) {
  if (!rnc) return;
  const existing = await prisma.supplier.findUnique({ where: { rnc } });
  if (existing && existing.id !== exceptId) {
    throw AppError.conflict('Ya existe un proveedor con ese RNC', ERROR_CODES.DUPLICATE_ENTRY);
  }
}

export async function createSupplier(data) {
  const clean = normalize(data);
  await assertRncAvailable(clean.rnc);
  return prisma.supplier.create({ data: clean });
}

export async function updateSupplier(id, data) {
  await getSupplierById(id);
  const clean = normalize(data);
  await assertRncAvailable(clean.rnc, id);
  return prisma.supplier.update({ where: { id }, data: clean });
}

/**
 * Soft delete: el proveedor se desactiva para conservar el historial de compras.
 */
export async function deactivateSupplier(id) {
  await getSupplierById(id);
  return prisma.supplier.update({ where: { id }, data: { active: false } });
}

/**
 * Historial de compras (entradas de inventario) de un proveedor.
 */
export async function getSupplierPurchases(id, { page = 1, limit = 20 }) {
  await getSupplierById(id);
  const where = { supplierId: id, type: 'ENTRADA' };
  const { skip, take } = buildPaginationQuery({ page, limit });

  const [purchases, total, totals] = await Promise.all([
    prisma.inventoryLog.findMany({ where, skip, take, orderBy: { createdAt: 'desc' } }),
    prisma.inventoryLog.count({ where }),
    prisma.inventoryLog.aggregate({ where, _sum: { totalCost: true } }),
  ]);

  return {
    data: purchases,
    totalSpent: totals._sum.totalCost || 0,
    pagination: getPaginationMeta(page, limit, total),
  };
}
