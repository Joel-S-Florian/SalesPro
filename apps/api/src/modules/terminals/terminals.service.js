import { prisma } from '../../config/db.js';
import { getTenantId } from '../../config/tenant.js';
import { AppError, ERROR_CODES } from '../../shared/exceptions/AppError.js';
import { assertWithinPlan } from '../../shared/plans.js';
import { resolveBranchId } from '../branches/branches.service.js';

const withUsers = {
  branch: { select: { id: true, name: true, code: true } },
  users: { select: { id: true, username: true, fullName: true } },
  _count: { select: { sales: true } },
};

async function assertNameAvailable(name, exceptId) {
  const existing = await prisma.terminal.findFirst({ where: { name } });
  if (existing && existing.id !== exceptId) {
    throw AppError.conflict('Ya existe una caja con ese nombre', ERROR_CODES.DUPLICATE_ENTRY);
  }
}

export function listTerminals() {
  return prisma.terminal.findMany({ orderBy: { name: 'asc' }, include: withUsers });
}

export async function createTerminal({ name, branchId, userIds = [] }) {
  await assertWithinPlan('terminals');
  await assertNameAvailable(name);
  const resolvedBranchId = await resolveBranchId(branchId);
  return prisma.terminal.create({
    data: {
      name,
      branch: { connect: { id: resolvedBranchId } },
      company: { connect: { id: getTenantId() } },
      users: { connect: userIds.map(id => ({ id })) },
    },
    include: withUsers,
  });
}

export async function updateTerminal(id, { name, active, userIds, branchId }) {
  const terminal = await prisma.terminal.findUnique({ where: { id } });
  if (!terminal) throw AppError.notFound('Caja no encontrada');
  if (name) await assertNameAvailable(name, id);
  // Reactivar una caja cuenta contra el tope del plan
  if (active === true && !terminal.active) await assertWithinPlan('terminals');

  if (branchId && branchId !== terminal.branchId) {
    // Cambiar de sucursal una caja con turno abierto mezclaría las ventas del turno
    if (await prisma.cashierClose.findFirst({ where: { terminalId: id, status: 'OPEN' } })) throw AppError.conflict('La caja tiene un turno abierto. Ciérrelo antes de cambiarla de sucursal');
    await resolveBranchId(branchId);
  }

  return prisma.terminal.update({
    where: { id },
    data: {
      ...(name && { name }),
      ...(branchId && { branchId }),
      ...(active !== undefined && { active }),
      ...(userIds && { users: { set: userIds.map(userId => ({ id: userId })) } }),
    },
    include: withUsers,
  });
}

/**
 * Cajas que el usuario puede usar: las asignadas (VENDEDOR) o todas las activas (ADMINISTRADOR).
 */
export async function getMyTerminals(requester) {
  const isAdmin = requester.role === 'ADMINISTRADOR';
  const user = await prisma.user.findUnique({ where: { id: requester.userId }, select: { defaultTerminalId: true, branchId: true } });
  // Un vendedor con sucursal asignada solo ve las cajas de esa sucursal
  const [terminals] = await Promise.all([
    prisma.terminal.findMany({
      where: { active: true, branch: { active: true }, ...(isAdmin ? {} : { users: { some: { id: requester.userId } }, ...(user?.branchId ? { branchId: user.branchId } : {}) }) },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, branchId: true, branch: { select: { name: true } } },
    }),
  ]);
  return { terminals, defaultTerminalId: user?.defaultTerminalId || null };
}

export async function setMyDefaultTerminal(requester, terminalId) {
  const { terminals } = await getMyTerminals(requester);
  if (terminalId && !terminals.some(t => t.id === terminalId)) {
    throw AppError.forbidden('No tiene acceso a esa caja');
  }
  await prisma.user.update({
    where: { id: requester.userId },
    data: { defaultTerminalId: terminalId || null },
  });
  return { defaultTerminalId: terminalId || null };
}

/**
 * Verifica que el usuario pueda operar en la caja y devuelve la caja.
 */
export async function assertTerminalAccess(requester, terminalId) {
  const terminal = await prisma.terminal.findUnique({
    where: { id: terminalId },
    include: { users: { select: { id: true } } },
  });
  if (!terminal || !terminal.active) throw AppError.notFound('Caja no encontrada o inactiva');

  const allowed =
    requester.role === 'ADMINISTRADOR' || terminal.users.some(u => u.id === requester.userId);
  if (!allowed) throw AppError.forbidden('No tiene acceso a esa caja');
  if (requester.role !== 'ADMINISTRADOR') {
    const user = await prisma.user.findUnique({ where: { id: requester.userId }, select: { branchId: true } });
    if (user?.branchId && user.branchId !== terminal.branchId) throw AppError.forbidden('Esa caja es de otra sucursal');
  }
  return terminal;
}
