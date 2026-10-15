import { prisma } from '../../config/db.js';
import { getTenantId } from '../../config/tenant.js';
import { AppError, ERROR_CODES } from '../../shared/exceptions/AppError.js';
import { assertWithinPlan } from '../../shared/plans.js';

const withUsers = {
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

export async function createTerminal({ name, userIds = [] }) {
  await assertWithinPlan('terminals');
  await assertNameAvailable(name);
  return prisma.terminal.create({
    data: {
      name,
      company: { connect: { id: getTenantId() } },
      users: { connect: userIds.map(id => ({ id })) },
    },
    include: withUsers,
  });
}

export async function updateTerminal(id, { name, active, userIds }) {
  const terminal = await prisma.terminal.findUnique({ where: { id } });
  if (!terminal) throw AppError.notFound('Caja no encontrada');
  if (name) await assertNameAvailable(name, id);
  // Reactivar una caja cuenta contra el tope del plan
  if (active === true && !terminal.active) await assertWithinPlan('terminals');

  return prisma.terminal.update({
    where: { id },
    data: {
      ...(name && { name }),
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
  const [terminals, user] = await Promise.all([
    prisma.terminal.findMany({
      where: { active: true, ...(isAdmin ? {} : { users: { some: { id: requester.userId } } }) },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    }),
    prisma.user.findUnique({ where: { id: requester.userId }, select: { defaultTerminalId: true } }),
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
  return terminal;
}
