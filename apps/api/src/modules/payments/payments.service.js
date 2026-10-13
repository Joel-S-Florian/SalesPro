import { prisma } from '../../config/db.js';
import { getTenantId } from '../../config/tenant.js';
import { AppError } from '../../shared/exceptions/AppError.js';
import { encryptSecret } from '../../shared/utils/secretBox.js';
import { round2 } from '../../shared/utils/helpers.js';
import { getProvider, providerList } from './providers/index.js';

const AMOUNT_TOLERANCE = 0.011;

async function loadConfig() {
  const row = await prisma.cardProviderConfig.findFirst();
  return row || { provider: 'NONE', mode: 'TEST', merchantId: null, terminalCode: null, secretEnc: null };
}

/** Configuración sin secretos. El administrador ve los datos del comercio; el cajero solo lo que necesita para cobrar. */
export async function getCardConfig(requester) {
  const config = await loadConfig();
  const provider = getProvider(config.provider);
  const base = { provider: config.provider, mode: config.mode, interactive: provider?.interactive ?? false };
  if (requester?.role !== 'ADMINISTRADOR') return base;
  return { ...base, merchantId: config.merchantId, terminalCode: config.terminalCode, hasSecret: Boolean(config.secretEnc), providers: providerList() };
}

export async function saveCardConfig({ provider, mode, merchantId, terminalCode, secret }) {
  const target = getProvider(provider);
  if (provider !== 'NONE' && !target) throw AppError.badRequest('Proveedor de tarjetas desconocido');
  if (target && !target.available) throw AppError.badRequest(`${target.label}: todavía no se puede activar`);
  const data = {
    provider,
    mode: mode === 'PROD' ? 'PROD' : 'TEST',
    merchantId: merchantId?.trim() || null,
    terminalCode: terminalCode?.trim() || null,
    // undefined = conservar la clave actual; cadena vacía = borrarla
    ...(secret === undefined ? {} : { secretEnc: secret ? encryptSecret(secret) : null }),
  };
  const existing = await prisma.cardProviderConfig.findFirst();
  if (existing) await prisma.cardProviderConfig.update({ where: { id: existing.id }, data });
  else await prisma.cardProviderConfig.create({ data: { ...data, companyId: getTenantId() } });
  return getCardConfig({ role: 'ADMINISTRADOR' });
}

/**
 * Cobra con la tarjeta ANTES de registrar la venta. Devuelve el cobro (aprobado o rechazado); la venta lo reclama con su id.
 * Un rechazo no es una excepción: la caja puede reintentar o cambiar a efectivo.
 */
export async function chargeCard({ amount, terminalId, manual }, requester) {
  const value = round2(Number(amount));
  if (!(value > 0)) throw AppError.badRequest('El monto a cobrar debe ser mayor que cero');
  const config = await loadConfig();
  const provider = getProvider(config.provider);
  if (!provider) throw AppError.badRequest('El cobro con terminal no está configurado (Configuración → Pagos con tarjeta)');

  let result;
  try {
    result = await provider.charge({ amount: value, manual, config: { ...config, hasSecret: Boolean(config.secretEnc) } });
  } catch (err) {
    if (err instanceof AppError) throw err;
    result = { status: 'ERROR', message: 'No se pudo comunicar con el terminal de pago' };
  }

  const payment = await prisma.cardPayment.create({
    data: {
      provider: config.provider,
      status: result.status,
      amount: value,
      authCode: result.authCode || null,
      last4: result.last4 || null,
      brand: result.brand || null,
      reference: result.reference || null,
      message: result.message || null,
      terminalId: terminalId || null,
      userId: requester.userId,
    },
  });
  return payment;
}

/** Anula un cobro que todavía no se usó en una venta (el cajero lo cancela o falló el registro de la venta). */
export async function voidCardPayment(id, requester) {
  const payment = await prisma.cardPayment.findUnique({ where: { id } });
  if (!payment) throw AppError.notFound('Cobro no encontrado');
  if (requester.role !== 'ADMINISTRADOR' && payment.userId !== requester.userId) throw AppError.forbidden('Solo puede anular sus propios cobros');
  if (payment.saleId) throw AppError.conflict('Este cobro ya pertenece a una venta: anúlelo con una nota de crédito');
  if (payment.status !== 'APPROVED') return payment;
  const provider = getProvider(payment.provider);
  const config = await loadConfig();
  const outcome = provider ? await provider.void({ payment, config }).catch(err => ({ ok: false, message: err.message })) : { ok: true };
  if (!outcome.ok) throw AppError.badRequest(outcome.message || 'No se pudo anular el cobro en el procesador');
  return prisma.cardPayment.update({ where: { id }, data: { status: 'VOIDED', message: outcome.message || payment.message } });
}

/**
 * Antes de registrar una venta con tarjeta: si hay terminal configurado, exige un cobro aprobado, libre y por el monto exacto.
 * Con `NONE` no exige nada (la tarjeta se marca como siempre). Devuelve el cobro a reclamar, o null.
 */
export async function requireForSale(paymentMethod, cardPaymentId, total) {
  const config = await loadConfig();
  if (paymentMethod !== 'TARJETA') {
    if (cardPaymentId) throw AppError.badRequest('Hay un cobro con tarjeta adjunto pero el método de pago no es tarjeta');
    return null;
  }
  if (config.provider === 'NONE') return null;
  if (!cardPaymentId) throw AppError.badRequest('Cobre con la tarjeta antes de registrar la venta');
  const payment = await prisma.cardPayment.findUnique({ where: { id: cardPaymentId } });
  if (!payment || payment.status !== 'APPROVED') throw AppError.badRequest('El cobro con tarjeta no está aprobado');
  if (payment.saleId) throw AppError.conflict('Este cobro con tarjeta ya se usó en otra venta');
  if (Math.abs(payment.amount - total) > AMOUNT_TOLERANCE) {
    // El total cambió después de cobrar: se anula para no dejar un cargo huérfano
    await voidCardPayment(payment.id, { role: 'ADMINISTRADOR', userId: payment.userId }).catch(() => {});
    throw AppError.conflict(`El monto cobrado (${payment.amount.toFixed(2)}) no coincide con el total de la venta (${total.toFixed(2)}). Se anuló el cobro; cobre de nuevo.`);
  }
  return payment;
}

/** Dentro de la transacción de la venta: reclama el cobro (solo si sigue aprobado y libre). */
export async function claimForSale(tx, payment, saleId) {
  if (!payment) return;
  const { count } = await tx.cardPayment.updateMany({ where: { id: payment.id, saleId: null, status: 'APPROVED' }, data: { saleId } });
  if (count !== 1) throw AppError.conflict('El cobro con tarjeta ya fue usado por otra venta');
}
