import { basePrisma, prisma } from '../../config/db.js';
import { AppError } from '../../shared/exceptions/AppError.js';
import { getEffectivePlan, planName, PLANS } from '@factos/shared/plans.js';
import { getProvider } from './billing.providers.js';

/**
 * Cobros de la suscripción. Los registra el SUPERADMIN (cobro manual) y cada pago extiende `Company.paidUntil` y fija el plan.
 * Las operaciones de plataforma usan `basePrisma` con `companyId` explícito; las del administrador de la empresa usan `prisma` (con contexto).
 */

const PAID_PLANS = ['STARTER', 'BUSINESS'];
const MAX_MONTHS = 24;

export const receiptCode = number => `R-${String(number).padStart(6, '0')}`;

/** Suma meses de calendario conservando el día cuando se puede (31 de enero + 1 mes = 28/29 de febrero). */
export function addMonths(date, months) {
  const d = new Date(date);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, lastDay));
  return d;
}

const publicPayment = p => ({
  id: p.id,
  receiptNumber: p.receiptNumber,
  receiptCode: receiptCode(p.receiptNumber),
  provider: p.provider,
  method: p.method,
  status: p.status,
  amount: p.amount,
  currency: p.currency,
  plan: p.plan,
  planName: planName(p.plan),
  reference: p.reference,
  periodStart: p.periodStart,
  periodEnd: p.periodEnd,
  note: p.note,
  recordedByName: p.recordedByName,
  createdAt: p.createdAt,
});

async function companyOrThrow(companyId) {
  const company = await basePrisma.company.findUnique({ where: { id: companyId }, select: { id: true, name: true, rnc: true, plan: true, trialEndsAt: true, paidUntil: true } });
  if (!company) throw AppError.notFound('Empresa no encontrada');
  return company;
}

/**
 * Registra un pago manual: crea el pago (con número de recibo correlativo), fija el plan y mueve `paidUntil`, todo en una transacción.
 * El período empieza donde termina lo ya pagado (o la prueba); si ya venció, empieza hoy. Se puede indicar `periodStart` para un pago atrasado.
 */
export async function recordManualPayment(requester, companyId, input, now = new Date()) {
  if (!PAID_PLANS.includes(input.plan)) throw AppError.badRequest('Elige el plan que se está pagando (Starter o Business)');
  const company = await companyOrThrow(companyId);
  const provider = getProvider(input.provider || 'MANUAL');
  if (!provider.methods.includes(input.method)) throw AppError.badRequest('Método de pago no válido para este proveedor');
  const result = await provider.collect({ companyId, plan: input.plan, amount: input.amount, currency: 'DOP', method: input.method, reference: input.reference });
  if (result.status !== 'PAID') throw AppError.badRequest(result.failureReason || 'El cobro no quedó pagado');

  const months = input.months ?? 1;
  if (!Number.isInteger(months) || months < 1 || months > MAX_MONTHS) throw AppError.badRequest(`Los meses deben estar entre 1 y ${MAX_MONTHS}`);

  const state = getEffectivePlan(company, now);
  const currentEnd = [company.paidUntil, company.trialEndsAt].filter(Boolean).map(d => new Date(d)).sort((a, b) => b - a)[0];
  const periodStart = input.periodStart ? new Date(input.periodStart) : currentEnd && currentEnd > now ? currentEnd : now;
  const periodEnd = input.periodEnd ? new Date(input.periodEnd) : addMonths(periodStart, months);
  if (!(periodEnd > periodStart)) throw AppError.badRequest('El fin del período debe ser posterior al inicio');

  if (result.reference) {
    const duplicate = await basePrisma.subscriptionPayment.findFirst({ where: { companyId, reference: result.reference, status: 'PAID' } });
    if (duplicate) throw AppError.conflict(`Ya existe un pago de esta empresa con la referencia ${result.reference} (${receiptCode(duplicate.receiptNumber)})`);
  }

  const payment = await basePrisma.$transaction(async tx => {
    const created = await tx.subscriptionPayment.create({
      data: {
        companyId,
        provider: provider.id,
        method: result.method,
        status: 'PAID',
        amount: input.amount,
        currency: 'DOP',
        plan: input.plan,
        reference: result.reference,
        periodStart,
        periodEnd,
        note: input.note || null,
        recordedById: requester.userId,
        recordedByName: requester.fullName || requester.username || 'Plataforma',
      },
    });
    const paidUntil = company.paidUntil && company.paidUntil > periodEnd ? company.paidUntil : periodEnd;
    await tx.company.update({ where: { id: companyId }, data: { plan: input.plan, paidUntil } });
    await tx.auditLog.create({
      data: {
        companyId,
        userId: requester.userId,
        action: 'SUBSCRIPTION_PAYMENT',
        entity: 'subscription_payment',
        entityId: created.id,
        newData: { receipt: receiptCode(created.receiptNumber), plan: input.plan, amount: input.amount, method: result.method, periodEnd, previousPlan: company.plan, previousStatus: state.status },
      },
    });
    return created;
  });
  return publicPayment(payment);
}

/** Anula un pago registrado por error: ya no cuenta y `paidUntil` vuelve al fin del último pago vigente (o a nada). */
export async function voidPayment(requester, companyId, paymentId, reason) {
  const payment = await basePrisma.subscriptionPayment.findFirst({ where: { id: paymentId, companyId } });
  if (!payment) throw AppError.notFound('Pago no encontrado en esa empresa');
  if (payment.status === 'VOIDED') throw AppError.conflict('Ese pago ya está anulado');
  await basePrisma.$transaction(async tx => {
    await tx.subscriptionPayment.update({ where: { id: paymentId }, data: { status: 'VOIDED', note: [payment.note, `Anulado: ${reason}`].filter(Boolean).join(' · ') } });
    const last = await tx.subscriptionPayment.findFirst({ where: { companyId, status: 'PAID' }, orderBy: { periodEnd: 'desc' } });
    await tx.company.update({ where: { id: companyId }, data: { paidUntil: last ? last.periodEnd : null } });
    await tx.auditLog.create({
      data: { companyId, userId: requester.userId, action: 'SUBSCRIPTION_PAYMENT_VOID', entity: 'subscription_payment', entityId: paymentId, newData: { receipt: receiptCode(payment.receiptNumber), reason } },
    });
  });
  return { ok: true };
}

/** Historial de pagos de una empresa (vista de plataforma). */
export async function listPaymentsForCompany(companyId) {
  await companyOrThrow(companyId);
  const rows = await basePrisma.subscriptionPayment.findMany({ where: { companyId }, orderBy: { createdAt: 'desc' }, take: 200 });
  return rows.map(publicPayment);
}

/** Historial de pagos de la empresa en sesión (vista del administrador): el aislamiento lo pone el contexto de la petición. */
export async function listOwnPayments() {
  const rows = await prisma.subscriptionPayment.findMany({ orderBy: { createdAt: 'desc' }, take: 200 });
  return rows.map(publicPayment);
}

/** Datos del recibo para imprimir. `scoped = true` usa el contexto de empresa (administrador); si no, la plataforma indica la empresa. */
export async function getReceipt(paymentId, { companyId, scoped }) {
  const payment = scoped ? await prisma.subscriptionPayment.findFirst({ where: { id: paymentId } }) : await basePrisma.subscriptionPayment.findFirst({ where: { id: paymentId, companyId } });
  if (!payment) throw AppError.notFound('Recibo no encontrado');
  const company = await companyOrThrow(payment.companyId);
  return {
    ...publicPayment(payment),
    company: { name: company.name, rnc: company.rnc },
    notFiscal: 'Recibo de suscripción de FACTOS. No es un comprobante fiscal (NCF / e-CF).',
  };
}

/** Resumen de suscripción para la pantalla de Plan y uso del administrador. */
export async function getSubscriptionSummary() {
  const payments = await listOwnPayments();
  return { payments, monthlyPrices: Object.fromEntries(PAID_PLANS.map(id => [id, PLANS[id].priceMonthlyDop])) };
}
