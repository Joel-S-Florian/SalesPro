import { prisma } from '../../config/db.js';
import { getTenantId, tenantStore } from '../../config/tenant.js';
import { AppError, ERROR_CODES } from '../../shared/exceptions/AppError.js';
import { assertWithinPlan } from '../../shared/plans.js';

export const MAIN_BRANCH_NAME = 'Principal';

const withCounts = { _count: { select: { terminals: true, users: true, sales: true } } };

const clean = data => Object.fromEntries(Object.entries(data).map(([key, value]) => [key, value === '' ? null : value]));

async function assertUnique({ name, code }, exceptId) {
  const clashes = await prisma.branch.findMany({
    where: { OR: [...(name ? [{ name: { equals: name, mode: 'insensitive' } }] : []), ...(code ? [{ code: { equals: code, mode: 'insensitive' } }] : [])] },
    select: { id: true, name: true, code: true },
  });
  const other = clashes.find(b => b.id !== exceptId);
  if (other) {
    const sameCode = code && other.code.toLowerCase() === code.toLowerCase();
    throw AppError.conflict(sameCode ? 'Ya existe una sucursal con ese código' : 'Ya existe una sucursal con ese nombre', ERROR_CODES.DUPLICATE_ENTRY);
  }
}

/** Sucursal Principal de la empresa del contexto (se crea al registrar la empresa). */
export async function getMainBranch() {
  return prisma.branch.findFirst({ where: { isMain: true } });
}

export async function getMainBranchId() {
  return (await getMainBranch())?.id || null;
}

/**
 * Sucursal con la que trabaja la petición en curso (inventario, lotes, compras): la asignada al usuario, o la del
 * encabezado X-Branch-Id, o la Principal. Se calcula una vez por petición.
 */
export async function getWorkingBranchId() {
  const store = tenantStore.getStore();
  if (store?.workingBranchId) return store.workingBranchId;
  let id = store?.userBranchId || null;
  if (!id && store?.requestedBranchId) id = await resolveBranchId(String(store.requestedBranchId));
  if (!id) id = await getMainBranchId();
  if (store) store.workingBranchId = id;
  return id;
}

export function listBranches({ onlyActive = false } = {}) {
  return prisma.branch.findMany({ where: onlyActive ? { active: true } : {}, orderBy: [{ isMain: 'desc' }, { name: 'asc' }], include: withCounts });
}

export async function getBranch(id) {
  const branch = await prisma.branch.findUnique({ where: { id }, include: withCounts });
  if (!branch) throw AppError.notFound('Sucursal no encontrada');
  return branch;
}

/** Siguiente código libre («002», «003»…) cuando el usuario no escribe uno. */
async function nextCode() {
  const codes = (await prisma.branch.findMany({ select: { code: true } })).map(b => b.code);
  for (let n = codes.length + 1; ; n++) {
    const code = String(n).padStart(3, '0');
    if (!codes.includes(code)) return code;
  }
}

export async function createBranch(data) {
  await assertWithinPlan('branches');
  const { name, code, ...rest } = clean(data);
  const finalCode = code || (await nextCode());
  await assertUnique({ name, code: finalCode });
  return prisma.branch.create({ data: { ...rest, name, code: finalCode, company: { connect: { id: getTenantId() } } }, include: withCounts });
}

export async function updateBranch(id, data) {
  const branch = await getBranch(id);
  const { name, code, active, ...rest } = clean(data);
  if (branch.isMain && active === false) throw AppError.badRequest('La sucursal Principal no se puede desactivar');
  await assertUnique({ name, code }, id);
  // Reactivar una sucursal cuenta contra el tope del plan
  if (active === true && !branch.active) await assertWithinPlan('branches');
  if (active === false && branch.active) {
    const openShift = await prisma.cashierClose.findFirst({ where: { branchId: id, status: 'OPEN' } });
    if (openShift) throw AppError.conflict('Hay un turno de caja abierto en esta sucursal. Ciérrelo antes de desactivarla');
  }
  return prisma.branch.update({ where: { id }, data: { ...rest, ...(name && { name }), ...(code && { code }), ...(active !== undefined && { active }) }, include: withCounts });
}

/** Sucursal válida y activa de la empresa; si no se indica, la Principal. */
export async function resolveBranchId(branchId) {
  if (!branchId) return getMainBranchId();
  const branch = await prisma.branch.findUnique({ where: { id: branchId } });
  if (!branch || !branch.active) throw AppError.badRequest('Sucursal no encontrada o inactiva');
  return branch.id;
}

/** Crea la sucursal Principal de una empresa. Idempotente; usa el cliente base porque corre al registrar la empresa. */
export async function ensureMainBranch(client, companyId) {
  const existing = await client.branch.findFirst({ where: { companyId, isMain: true } });
  if (existing) return existing;
  return client.branch.create({ data: { companyId, name: MAIN_BRANCH_NAME, code: '001', isMain: true } });
}
