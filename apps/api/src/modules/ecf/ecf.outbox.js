import { basePrisma } from '../../config/db.js';
import { logger } from '../../shared/utils/logger.js';
import { DGII_STATUS, dgiiServiceUrl } from './ecf.constants.js';
import { DgiiHttpError, dgiiClient, xmlForm } from './ecf.dgii.client.js';
import { scheduleDelivery } from './ecf.delivery.js';
import { assertSafeTarget } from './ecf.safety.js';
import { tokenManager } from './ecf.token.service.js';
import { readArecf } from './ecf.xml.js';

/**
 * Cola de envío a la DGII (outbox en la base de datos).
 *
 * Cada `EcfDocument` pendiente se envía con el token de la empresa. Los errores de red o del servidor se reintentan
 * con espera creciente; los rechazos de la DGII (400) no se reintentan. Varios procesos pueden correr a la vez:
 * cada documento se "reclama" con una actualización condicional antes de procesarlo.
 */

const SENDABLE = ['PENDING', 'SENT', 'ERROR', 'CONTINGENCY'];
const CLAIM_MS = 60 * 1000;
const BACKOFF_MS = [30, 60, 120, 300, 900, 1800, 3600].map(s => s * 1000);
const CONTINGENCY_AFTER_ATTEMPTS = 8;

export const backoffMs = attempts => BACKOFF_MS[Math.min(Math.max(attempts, 1) - 1, BACKOFF_MS.length - 1)];

/** Segundos de espera entre consultas de resultado de un e-CF «En proceso» (2, 4, 8… hasta 60). */
export const pollDelayMs = polls => Math.min(60, 2 ** Math.max(polls, 1)) * 1000;

function mapDgiiState(value) {
  const text = String(value ?? '').toLowerCase();
  if (text.includes('condicional')) return 'CONDITIONAL';
  if (text.includes('rechaz')) return 'REJECTED';
  if (text.includes('acept')) return 'ACCEPTED';
  return null;
}

const messagesOf = body => {
  const list = body?.mensajes;
  if (Array.isArray(list)) return list.map(m => (typeof m === 'string' ? m : `${m.codigo ?? ''} ${m.valor ?? ''}`.trim())).filter(Boolean);
  return [body?.mensaje, body?.error].filter(Boolean);
};

/** Actualiza el documento y refleja el estado en la venta (el resumen RFCE manda sobre el e-CF completo). */
async function save(doc, patch) {
  const updated = await basePrisma.ecfDocument.update({ where: { id: doc.id, companyId: doc.companyId }, data: patch });
  // El estado fiscal de la venta lo da el e-CF o su resumen; la entrega al comprador no lo cambia
  if (doc.saleId && (doc.kind === 'ECF' || doc.kind === 'RFCE')) {
    await basePrisma.sale.updateMany({
      where: { id: doc.saleId, companyId: doc.companyId },
      data: { ecfStatus: updated.status === 'STORED' ? undefined : updated.status, ecfTrackId: updated.trackId ?? undefined },
    });
  }
  return updated;
}

async function sendEcf(doc, ctx) {
  const url = `${dgiiServiceUrl(ctx.mode, 'reception')}/api/facturaselectronicas`;
  const { json } = await tokenManager.withToken(doc.companyId, token =>
    dgiiClient.authed(token, url, { method: 'POST', body: xmlForm(doc.xml, `${ctx.rnc}${doc.eNcf}.xml`) })
  );
  if (!json?.trackId) {
    return save(doc, { status: 'REJECTED', dgiiMessages: messagesOf(json), lastError: json?.mensaje || json?.error || 'La DGII no entregó un trackId', resolvedAt: new Date(), attempts: doc.attempts + 1 });
  }
  return save(doc, { status: 'SENT', trackId: json.trackId, sentAt: new Date(), attempts: doc.attempts + 1, nextAttemptAt: new Date(Date.now() + pollDelayMs(1)), lastError: null });
}

async function pollResult(doc, ctx) {
  const url = `${dgiiServiceUrl(ctx.mode, 'result')}/api/consultas/estado?trackid=${encodeURIComponent(doc.trackId)}`;
  const { json } = await tokenManager.withToken(doc.companyId, token => dgiiClient.authed(token, url));
  const code = Number(json?.codigo);
  const base = { dgiiCode: Number.isFinite(code) ? code : null, dgiiMessages: messagesOf(json), attempts: doc.attempts + 1, lastError: null };

  if (code === DGII_STATUS.ACCEPTED || code === DGII_STATUS.CONDITIONAL) {
    const accepted = await save(doc, { ...base, status: code === DGII_STATUS.ACCEPTED ? 'ACCEPTED' : 'CONDITIONAL', resolvedAt: new Date(), nextAttemptAt: null });
    await scheduleDelivery(accepted); // si el comprador es emisor electrónico, se le entrega su copia
    return accepted;
  }
  if (code === DGII_STATUS.REJECTED) return save(doc, { ...base, status: 'REJECTED', resolvedAt: new Date(), nextAttemptAt: null, lastError: base.dgiiMessages.join(' | ') || 'Rechazado por la DGII' });
  // En proceso (3) o aún no registrado (0): se vuelve a consultar
  return save(doc, { ...base, status: 'SENT', nextAttemptAt: new Date(Date.now() + pollDelayMs(doc.attempts + 1)) });
}

const NOT_RECEIVED_TEXT = { 1: 'error de especificación', 2: 'error de firma digital', 3: 'envío duplicado', 4: 'el RNC comprador no corresponde' };

/** Entrega el e-CF aceptado al comprador y guarda su acuse de recibo (ARECF). */
async function sendDelivery(doc) {
  assertSafeTarget(doc.target);
  const { text } = await dgiiClient.postXml(doc.target, doc.xml, `${doc.eNcf}.xml`);
  const arecf = readArecf(text);
  const received = arecf.status === 0;
  await basePrisma.ecfDocument.upsert({
    where: { saleId_kind: { saleId: doc.saleId, kind: 'ARECF' } },
    update: { xml: text, status: 'STORED' },
    create: { companyId: doc.companyId, saleId: doc.saleId, kind: 'ARECF', eNcf: doc.eNcf, xml: text, status: 'STORED' },
  });
  return save(doc, {
    status: received ? 'ACCEPTED' : 'REJECTED',
    attempts: doc.attempts + 1,
    sentAt: new Date(),
    resolvedAt: new Date(),
    nextAttemptAt: null,
    lastError: received ? null : `El comprador no recibió el comprobante: ${NOT_RECEIVED_TEXT[arecf.reasonCode] || 'sin motivo'}`,
  });
}

async function sendRfce(doc, ctx) {
  const url = `${dgiiServiceUrl(ctx.mode, 'rfceReception')}/api/recepcion/ecf`;
  const { json } = await tokenManager.withToken(doc.companyId, token =>
    dgiiClient.authed(token, url, { method: 'POST', body: xmlForm(doc.xml, `${ctx.rnc}${doc.eNcf}.xml`) })
  );
  const state = mapDgiiState(json?.estado);
  const base = { dgiiCode: Number.isFinite(Number(json?.codigo)) ? Number(json.codigo) : null, dgiiMessages: messagesOf(json), attempts: doc.attempts + 1, sentAt: new Date(), resolvedAt: new Date(), nextAttemptAt: null, lastError: null };
  if (state === 'REJECTED') return save(doc, { ...base, status: 'REJECTED', lastError: base.dgiiMessages.join(' | ') || 'Rechazado por la DGII' });
  if (state) return save(doc, { ...base, status: state });
  return save(doc, { ...base, status: 'ERROR', resolvedAt: null, lastError: 'Respuesta desconocida de la DGII', nextAttemptAt: new Date(Date.now() + backoffMs(doc.attempts + 1)) });
}

/** Procesa un documento de la cola. Nunca lanza: registra el error y programa el reintento. */
export async function processDocument(doc) {
  try {
    const [config, company] = await Promise.all([
      basePrisma.ecfConfig.findUnique({ where: { companyId: doc.companyId }, select: { mode: true } }),
      basePrisma.company.findUnique({ where: { id: doc.companyId }, select: { rnc: true } }),
    ]);
    if (!config || config.mode === 'OFF') {
      // Apagada la facturación electrónica: se deja el documento para cuando se reactive
      return await basePrisma.ecfDocument.update({ where: { id: doc.id }, data: { nextAttemptAt: new Date(Date.now() + 10 * 60 * 1000) } });
    }
    const ctx = { mode: config.mode, rnc: String(company?.rnc || '').replace(/\D/g, '') };

    if (doc.kind === 'ECF') return await (doc.status === 'SENT' && doc.trackId ? pollResult(doc, ctx) : sendEcf(doc, ctx));
    if (doc.kind === 'RFCE') return await sendRfce(doc, ctx);
    if (doc.kind === 'DELIVERY') return await sendDelivery(doc);
    return doc;
  } catch (error) {
    const attempts = doc.attempts + 1;
    // La DGII rechazó el formato (4xx distinto de 401/429): reintentar no sirve
    if (error instanceof DgiiHttpError && error.status >= 400 && error.status < 500 && ![401, 408, 429].includes(error.status)) {
      return save(doc, { status: 'REJECTED', attempts, lastError: error.message, dgiiMessages: messagesOf(error.body), resolvedAt: new Date(), nextAttemptAt: null });
    }
    logger.warn('Envío a la DGII fallido; se reintentará', { documentId: doc.id, attempts, reason: error.message });
    return save(doc, {
      status: attempts >= CONTINGENCY_AFTER_ATTEMPTS ? 'CONTINGENCY' : 'ERROR',
      attempts,
      lastError: error.message,
      nextAttemptAt: new Date(Date.now() + backoffMs(attempts)),
    });
  }
}

let running = false;

/** Toma los documentos vencidos de la cola y los procesa. Seguro de llamar varias veces a la vez. */
export async function processDueDocuments({ limit = 25 } = {}) {
  if (running) return 0;
  running = true;
  let processed = 0;
  try {
    const now = new Date();
    const due = await basePrisma.ecfDocument.findMany({
      where: { kind: { in: ['ECF', 'RFCE', 'DELIVERY'] }, status: { in: SENDABLE }, OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }] },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });
    for (const doc of due) {
      // Reclamo condicional: si otro proceso ya lo tomó (updatedAt cambió), se omite
      const claim = await basePrisma.ecfDocument.updateMany({ where: { id: doc.id, updatedAt: doc.updatedAt }, data: { nextAttemptAt: new Date(Date.now() + CLAIM_MS) } });
      if (claim.count !== 1) continue;
      await processDocument({ ...doc, nextAttemptAt: new Date(Date.now() + CLAIM_MS) });
      processed += 1;
    }
  } catch (error) {
    logger.error('Error procesando la cola de e-CF', { reason: error.message });
  } finally {
    running = false;
  }
  return processed;
}

/** Procesa la cola enseguida (después de registrar una venta) sin bloquear la respuesta. */
export function kickEcfWorker() {
  setImmediate(() => processDueDocuments().catch(() => {}));
}

let timer = null;

export function startEcfWorker({ intervalMs = 5000 } = {}) {
  if (timer) return;
  timer = setInterval(() => processDueDocuments().catch(() => {}), intervalMs);
  timer.unref?.();
}

export function stopEcfWorker() {
  if (timer) clearInterval(timer);
  timer = null;
}
