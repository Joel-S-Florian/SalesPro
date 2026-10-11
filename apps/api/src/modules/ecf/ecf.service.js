import { prisma } from '../../config/db.js';
import { AppError } from '../../shared/exceptions/AppError.js';
import { daysUntil } from './ecf.certificate.js';
import { kickEcfWorker } from './ecf.outbox.js';

/** Consultas y acciones sobre los comprobantes electrónicos ya emitidos (la emisión vive en ecf.issue.js). */

const saleSelect = {
  id: true,
  invoiceNumber: true,
  eNcf: true,
  ecfType: true,
  ecfStatus: true,
  ecfTrackId: true,
  ecfSecurityCode: true,
  ecfSignedAt: true,
  ecfStampUrl: true,
  customerName: true,
  total: true,
  createdAt: true,
};

const presentDocument = d => ({
  id: d.id,
  kind: d.kind,
  status: d.status,
  trackId: d.trackId,
  dgiiCode: d.dgiiCode,
  messages: Array.isArray(d.dgiiMessages) ? d.dgiiMessages : [],
  attempts: d.attempts,
  nextAttemptAt: d.nextAttemptAt,
  lastError: d.lastError,
  sentAt: d.sentAt,
  resolvedAt: d.resolvedAt,
  createdAt: d.createdAt,
});

/** Estado del comprobante electrónico de una venta y de sus documentos (sin el XML). */
export async function getSaleEcf(saleId) {
  const sale = await prisma.sale.findUnique({ where: { id: saleId }, select: saleSelect });
  if (!sale) throw AppError.notFound('Venta no encontrada');
  const documents = await prisma.ecfDocument.findMany({ where: { saleId }, orderBy: { createdAt: 'asc' } });
  return { sale, documents: documents.map(presentDocument) };
}

/** Estado resumido para el cajero tras cobrar: sin XML ni datos internos. Un vendedor solo ve sus propias ventas. */
export async function getSaleStatus(saleId, requester) {
  const sale = await prisma.sale.findUnique({ where: { id: saleId }, select: { ...saleSelect, userId: true } });
  if (!sale) throw AppError.notFound('Venta no encontrada');
  if (requester?.role === 'VENDEDOR' && sale.userId !== requester.userId) throw AppError.forbidden('No tiene permisos para ver esta venta');
  const docs = await prisma.ecfDocument.findMany({ where: { saleId, kind: { in: ['ECF', 'RFCE'] }, status: { not: 'STORED' } } });
  const doc = docs.find(d => d.kind === 'RFCE') || docs[0];
  return {
    eNcf: sale.eNcf,
    ecfType: sale.ecfType,
    status: sale.ecfStatus,
    final: ['ACCEPTED', 'CONDITIONAL', 'REJECTED'].includes(sale.ecfStatus),
    message: doc && ['REJECTED', 'ERROR', 'CONTINGENCY'].includes(doc.status) ? doc.lastError : null,
  };
}

/** XML firmado (para conservarlo o entregarlo en una auditoría). */
export async function getDocumentXml(saleId, kind = 'ECF') {
  const doc = await prisma.ecfDocument.findFirst({ where: { saleId, kind } });
  if (!doc) throw AppError.notFound('Documento no encontrado');
  return { fileName: `${doc.eNcf || saleId}.xml`, xml: doc.xml };
}

/**
 * Vuelve a intentar el envío de los documentos con error o en contingencia.
 * Un comprobante RECHAZADO por la DGII no se reenvía: el XML firmado no puede alterarse y el e-NCF debe corregirse
 * emitiendo uno nuevo.
 */
export async function retrySale(saleId) {
  const docs = await prisma.ecfDocument.findMany({ where: { saleId, kind: { in: ['ECF', 'RFCE'] } } });
  if (!docs.length) throw AppError.notFound('La venta no tiene comprobante electrónico');
  const retryable = docs.filter(d => ['ERROR', 'CONTINGENCY', 'PENDING'].includes(d.status));
  if (!retryable.length) {
    const rejected = docs.find(d => d.status === 'REJECTED');
    throw AppError.badRequest(
      rejected ? 'La DGII rechazó este comprobante; no se puede reenviar. Revise el motivo y emita uno nuevo.' : 'El comprobante no tiene envíos pendientes'
    );
  }
  await prisma.ecfDocument.updateMany({ where: { id: { in: retryable.map(d => d.id) } }, data: { nextAttemptAt: null } });
  kickEcfWorker();
  return { retried: retryable.length };
}

/** Lista paginada de comprobantes con su estado (para el tablero). */
export async function listDocuments({ status, page = 1, limit = 20 } = {}) {
  const where = { kind: { in: ['ECF', 'RFCE'] }, status: status ? status : { not: 'STORED' } };
  const [rows, total] = await Promise.all([
    prisma.ecfDocument.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      include: { sale: { select: saleSelect } },
    }),
    prisma.ecfDocument.count({ where }),
  ]);
  return { data: rows.map(r => ({ ...presentDocument(r), eNcf: r.eNcf, sale: r.sale })), pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
}

/** Resumen para el tablero: estados, certificado por vencer y rangos por agotarse. */
export async function getSummary() {
  const since = new Date(Date.now() - 30 * 86400000);
  const [groups, config, sequences, lastRejected] = await Promise.all([
    prisma.ecfDocument.groupBy({ by: ['status'], where: { kind: { in: ['ECF', 'RFCE'] }, createdAt: { gte: since } }, _count: { _all: true } }),
    prisma.ecfConfig.findFirst({ select: { mode: true, certNotAfter: true, lastConnectionOk: true, lastConnectionAt: true } }),
    prisma.ecfSequence.findMany({ where: { active: true } }),
    prisma.ecfDocument.findMany({ where: { status: 'REJECTED', kind: { in: ['ECF', 'RFCE'] } }, orderBy: { createdAt: 'desc' }, take: 5, select: { id: true, eNcf: true, lastError: true, createdAt: true, saleId: true } }),
  ]);
  const count = status => groups.find(g => g.status === status)?._count._all || 0;
  const now = new Date();

  const alerts = [];
  if (config?.certNotAfter) {
    const days = daysUntil(config.certNotAfter);
    if (days < 0) alerts.push({ level: 'error', code: 'CERT_EXPIRED', message: 'El certificado digital está vencido' });
    else if (days < 30) alerts.push({ level: 'warning', code: 'CERT_EXPIRING', message: `El certificado digital vence en ${days} ${days === 1 ? 'día' : 'días'}` });
  }
  sequences.forEach(seq => {
    const remaining = seq.rangeTo - Math.max(seq.current, seq.rangeFrom - 1);
    if (seq.validUntil && seq.validUntil < now) alerts.push({ level: 'error', code: 'SEQUENCE_EXPIRED', message: `El rango de ${seq.ecfType} está vencido` });
    else if (remaining <= 0) alerts.push({ level: 'error', code: 'SEQUENCE_EXHAUSTED', message: `El rango de ${seq.ecfType} se agotó` });
    else if (remaining <= Math.max(50, Math.floor((seq.rangeTo - seq.rangeFrom + 1) * 0.05))) alerts.push({ level: 'warning', code: 'SEQUENCE_LOW', message: `Quedan ${remaining} números de ${seq.ecfType}` });
  });

  return {
    mode: config?.mode || 'OFF',
    last30Days: {
      accepted: count('ACCEPTED') + count('CONDITIONAL'),
      pending: count('PENDING') + count('SENT'),
      error: count('ERROR') + count('CONTINGENCY'),
      rejected: count('REJECTED'),
    },
    connection: { ok: config?.lastConnectionOk ?? null, checkedAt: config?.lastConnectionAt ?? null },
    alerts,
    recentRejections: lastRejected,
  };
}
