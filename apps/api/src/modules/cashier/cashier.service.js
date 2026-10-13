import { prisma } from '../../config/db.js';
import { AppError } from '../../shared/exceptions/AppError.js';
import { round2 } from '../../shared/utils/helpers.js';
import { assertTerminalAccess } from '../terminals/terminals.service.js';
import { addBreakdowns, normalizeBreakdown, sumBreakdown } from '../../shared/utils/cashChange.js';

const closeInclude = {
  terminal: { select: { id: true, name: true } },
  user: { select: { id: true, username: true, fullName: true } },
};

/**
 * Totales del turno a partir de las ventas asociadas.
 */
async function buildSummary(cashierCloseId) {
  const [byMethod, totals] = await Promise.all([
    prisma.sale.groupBy({
      by: ['paymentMethod'],
      where: { cashierCloseId },
      _sum: { total: true },
      _count: true,
    }),
    prisma.sale.aggregate({
      where: { cashierCloseId },
      _sum: { total: true, tax: true, discount: true, subtotal: true },
      _count: true,
    }),
  ]);

  const paymentTotals = Object.fromEntries(
    byMethod.map(row => [row.paymentMethod, round2(row._sum.total || 0)])
  );

  return {
    transactions: totals._count,
    subtotal: round2(totals._sum.subtotal || 0),
    discount: round2(totals._sum.discount || 0),
    tax: round2(totals._sum.tax || 0),
    total: round2(totals._sum.total || 0),
    byPaymentMethod: paymentTotals,
    cashSales: paymentTotals.EFECTIVO || 0,
  };
}

async function withLiveSummary(close) {
  if (close.status === 'CLOSED' && close.summary) return close;
  return { ...close, summary: await buildSummary(close.id) };
}

export async function getCurrentShift(requester, terminalId) {
  const close = await prisma.cashierClose.findFirst({
    where: { terminalId, status: 'OPEN' },
    include: closeInclude,
  });
  if (!close) return null;
  return { ...(await withLiveSummary(close)), ownedByMe: close.userId === requester.userId };
}

export async function openShift(requester, { terminalId, openingBalance = 0, openingCount }) {
  await assertTerminalAccess(requester, terminalId);

  // Con el conteo por denominaciones, el fondo inicial es lo que suman los billetes y monedas
  let count = null;
  if (openingCount && Object.keys(openingCount).length > 0) {
    const normalized = normalizeBreakdown(openingCount);
    if (!normalized.ok) throw AppError.badRequest(normalized.error);
    count = normalized.breakdown;
    const counted = sumBreakdown(count);
    if (openingBalance && Math.abs(openingBalance - counted) > 0.01) {
      throw AppError.badRequest(`El fondo inicial (${openingBalance}) no coincide con el conteo de billetes y monedas (${counted})`);
    }
    openingBalance = counted;
  }

  const [terminalOpen, userOpen] = await Promise.all([
    prisma.cashierClose.findFirst({ where: { terminalId, status: 'OPEN' } }),
    prisma.cashierClose.findFirst({ where: { userId: requester.userId, status: 'OPEN' } }),
  ]);
  if (terminalOpen) throw AppError.conflict('Esta caja ya tiene un turno abierto');
  if (userOpen) throw AppError.conflict('Ya tiene un turno abierto en otra caja. Ciérrelo primero');

  return prisma.cashierClose.create({
    data: { terminalId, userId: requester.userId, openingBalance, ...(count ? { openingCount: count } : {}) },
    include: closeInclude,
  });
}

/**
 * Billetes y monedas que debería haber en la caja del turno: conteo de apertura + efectivo recibido − devueltas entregadas.
 * `complete` es falso si no hubo conteo de apertura o si alguna denominación quedó en negativo (el cajero movió efectivo sin registrarlo):
 * las sugerencias de devuelta siguen funcionando con lo que se sabe.
 */
async function drawerState(close) {
  const sales = await prisma.sale.findMany({
    where: { cashierCloseId: close.id, paymentMethod: 'EFECTIVO' },
    select: { cashReceived: true, cashChange: true },
  });
  const opening = close.openingCount || {};
  let received = {};
  let given = {};
  for (const sale of sales) {
    received = addBreakdowns(received, sale.cashReceived);
    given = addBreakdowns(given, sale.cashChange);
  }
  const exact = addBreakdowns(opening, received, given, { allowNegative: true });
  const counts = addBreakdowns(opening, received, given);
  const complete = Boolean(close.openingCount) && Object.values(exact).every(value => value >= 0);
  return { counts, exact, total: sumBreakdown(counts), complete, hasOpeningCount: Boolean(close.openingCount) };
}

export async function getDrawer(requester, id) {
  const close = await prisma.cashierClose.findUnique({ where: { id } });
  if (!close) throw AppError.notFound('Turno no encontrado');
  if (close.userId !== requester.userId && requester.role !== 'ADMINISTRADOR') throw AppError.forbidden('No tiene permisos para ver esta caja');
  const { counts, total, complete, hasOpeningCount } = await drawerState(close);
  return { counts, total, complete, hasOpeningCount };
}

export async function closeShift(requester, id, { declaredCash, closingCount, notes }) {
  const close = await prisma.cashierClose.findUnique({ where: { id } });
  if (!close) throw AppError.notFound('Turno no encontrado');
  if (close.status !== 'OPEN') throw AppError.conflict('Este turno ya está cerrado');
  if (close.userId !== requester.userId && requester.role !== 'ADMINISTRADOR') {
    throw AppError.forbidden('Solo el cajero del turno o un administrador pueden cerrarlo');
  }

  // Con el conteo por denominaciones, el efectivo contado es lo que suman los billetes y monedas
  let count = null;
  if (closingCount && Object.keys(closingCount).length > 0) {
    const normalized = normalizeBreakdown(closingCount);
    if (!normalized.ok) throw AppError.badRequest(normalized.error);
    count = normalized.breakdown;
    const counted = sumBreakdown(count);
    if (declaredCash && Math.abs(declaredCash - counted) > 0.01) {
      throw AppError.badRequest(`El efectivo contado (${declaredCash}) no coincide con el conteo de billetes y monedas (${counted})`);
    }
    declaredCash = counted;
  }

  const summary = await buildSummary(id);
  const expectedCash = round2(close.openingBalance + summary.cashSales);

  // Comparación por denominación: solo si se contó la apertura (si no, no hay base confiable)
  if (count) {
    const drawer = await drawerState(close);
    if (drawer.hasOpeningCount) {
      const denominations = {};
      for (const denom of new Set([...Object.keys(drawer.exact), ...Object.keys(count)])) {
        const expected = drawer.exact[denom] || 0;
        const counted = count[denom] || 0;
        if (expected !== counted) denominations[denom] = { expected, counted, difference: counted - expected };
      }
      summary.denominationDifferences = denominations;
    }
  }

  return prisma.cashierClose.update({
    where: { id },
    data: {
      status: 'CLOSED',
      closedAt: new Date(),
      expectedCash,
      declaredCash,
      ...(count ? { closingCount: count } : {}),
      difference: round2(declaredCash - expectedCash),
      notes: notes || null,
      summary,
    },
    include: closeInclude,
  });
}

export async function listShifts({ page = 1, limit = 20, terminalId, userId, status }) {
  const where = {
    ...(terminalId && { terminalId }),
    ...(userId && { userId }),
    ...(status && { status }),
  };
  const [data, total] = await Promise.all([
    prisma.cashierClose.findMany({
      where,
      include: closeInclude,
      orderBy: { openedAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.cashierClose.count({ where }),
  ]);
  return { data, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
}

export async function getShift(requester, id) {
  const close = await prisma.cashierClose.findUnique({ where: { id }, include: closeInclude });
  if (!close) throw AppError.notFound('Turno no encontrado');
  if (close.userId !== requester.userId && requester.role !== 'ADMINISTRADOR') {
    throw AppError.forbidden('No tiene permisos para ver este turno');
  }
  return withLiveSummary(close);
}

/**
 * Valida la caja usada en una venta y devuelve el turno al que debe asociarse (o null).
 * - Con terminalId: exige acceso a la caja; si hay turno abierto, debe ser del propio cajero.
 * - Con `requireOpenShift` activo: exige caja y turno abierto.
 */
export async function resolveShiftForSale(requester, terminalId, { requireOpenShift }) {
  if (!terminalId) {
    if (requireOpenShift) throw AppError.badRequest('Seleccione una caja y abra su turno para vender');
    return { terminalId: null, cashierCloseId: null };
  }

  await assertTerminalAccess(requester, terminalId);
  const open = await prisma.cashierClose.findFirst({ where: { terminalId, status: 'OPEN' } });

  if (open && open.userId !== requester.userId) {
    throw AppError.conflict('Esta caja tiene un turno abierto por otro cajero');
  }
  if (!open && requireOpenShift) {
    throw AppError.badRequest('Debe abrir el turno de la caja antes de vender');
  }
  return { terminalId, cashierCloseId: open?.id || null };
}
