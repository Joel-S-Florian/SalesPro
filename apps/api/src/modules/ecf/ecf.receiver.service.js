import { basePrisma } from '../../config/db.js';
import { runInTenant } from '../../config/tenant.js';
import { logger } from '../../shared/utils/logger.js';
import { buildArecfXml } from './ecf.builder.js';
import { certificateMatchesRnc } from './ecf.certificate.js';
import { NOT_RECEIVED_REASON, readAcecf, readEcfHeader } from './ecf.xml.js';
import { extractCertificatePem, signXml, verifySignedXml } from './ecf.signer.js';
import { loadCredentialsFromDb } from './ecf.token.service.js';
import { validateAgainstXsd } from './ecf.xsd.js';

/**
 * La empresa como RECEPTORA: recibe e-CF que le emiten otros contribuyentes y aprobaciones comerciales de
 * sus clientes. Son servicios PÚBLICOS (sin sesión): la seguridad descansa en validar el esquema, la firma digital,
 * que el certificado pertenezca al emisor declarado y que el comprobante sea para esta empresa.
 *
 * Estado del servicio (según la DGII): el acuse de recibo debe ser SÍNCRONO y firmado.
 */

export class ReceiverError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = 'ReceiverError';
    this.status = status;
  }
}

const digits = value => String(value ?? '').replace(/\D/g, '');

/* Empresas por RNC (poca cantidad): se refresca cada minuto para no consultar en cada recepción. */
let rncIndex = { loadedAt: 0, map: new Map() };
async function companyByRnc(rnc) {
  if (Date.now() - rncIndex.loadedAt > 60 * 1000) {
    const companies = await basePrisma.company.findMany({ where: { rnc: { not: null }, active: true }, select: { id: true, rnc: true, name: true } });
    rncIndex = { loadedAt: Date.now(), map: new Map(companies.map(c => [digits(c.rnc), c])) };
  }
  return rncIndex.map.get(digits(rnc)) || null;
}

/** Fuerza recargar el índice (p. ej. tras cambiar un RNC). */
export const resetReceiverIndex = () => {
  rncIndex = { loadedAt: 0, map: new Map() };
};

async function receiverContext(rncParam) {
  const company = await companyByRnc(rncParam);
  if (!company) throw new ReceiverError('El contribuyente no es un receptor electrónico en este servicio', 404);
  const config = await basePrisma.ecfConfig.findUnique({ where: { companyId: company.id }, select: { mode: true } });
  if (!config || config.mode === 'OFF') throw new ReceiverError('El contribuyente no tiene activada la facturación electrónica', 404);
  return { company, mode: config.mode };
}

async function signedArecf(company, header, received, reasonCode) {
  const creds = await loadCredentialsFromDb(company.id, { purpose: 'sign-arecf', documentId: header.eNcf });
  return signXml(buildArecfXml({ rncEmisor: header.rncEmisor, rncComprador: company.rnc, eNcf: header.eNcf, received, reasonCode }), creds);
}

/**
 * Recibe un e-CF emitido por otro contribuyente.
 * @returns {{ arecfXml: string, received: boolean, reasonCode?: number }}
 */
export async function receiveEcf(rncParam, xml) {
  const { company } = await receiverContext(rncParam);
  if (!xml) throw new ReceiverError('Archivo no válido');

  const header = readEcfHeader(xml);
  const refuse = async (reasonCode, why) => {
    logger.info('e-CF recibido y no aceptado', { companyId: company.id, eNcf: header.eNcf, why });
    return { received: false, reasonCode, arecfXml: await signedArecf(company, header, false, reasonCode) };
  };

  if (header.root !== 'ECF' || !/^(31|32|33|34|41|43|44|45|46|47)$/.test(header.typeNumber)) return refuse(NOT_RECEIVED_REASON.SPECIFICATION_ERROR, 'tipo desconocido');
  const schema = await validateAgainstXsd(`E${header.typeNumber}`, xml);
  if (!schema.valid) return refuse(NOT_RECEIVED_REASON.SPECIFICATION_ERROR, schema.errors[0]);

  const signature = verifySignedXml(xml);
  const certPem = signature.certPem || extractCertificatePem(xml);
  if (!signature.valid || !certPem || !certificateMatchesRnc(certPem, header.rncEmisor)) {
    return refuse(NOT_RECEIVED_REASON.SIGNATURE_ERROR, signature.error || 'el certificado no corresponde al emisor');
  }
  if (digits(header.rncComprador) !== digits(company.rnc)) return refuse(NOT_RECEIVED_REASON.BUYER_MISMATCH, 'el comprador no es esta empresa');

  const duplicate = await basePrisma.ecfInbox.findFirst({ where: { companyId: company.id, rncEmisor: digits(header.rncEmisor), eNcf: header.eNcf } });
  if (duplicate) return refuse(NOT_RECEIVED_REASON.DUPLICATE, 'duplicado');

  const arecfXml = await signedArecf(company, header, true);
  await runInTenant(company.id, () =>
    basePrisma.ecfInbox.create({
      data: { companyId: company.id, rncEmisor: digits(header.rncEmisor), eNcf: header.eNcf, total: header.total, xml, arecfXml, status: 'RECIBIDO' },
    })
  );
  return { received: true, arecfXml };
}

/**
 * Recibe la aprobación o rechazo comercial que un cliente emite sobre un e-CF NUESTRO.
 * @returns {{ approved: boolean, eNcf: string }}
 */
export async function receiveCommercialApproval(rncParam, xml) {
  const { company } = await receiverContext(rncParam);
  if (!xml) throw new ReceiverError('Archivo no válido');

  const schema = await validateAgainstXsd('ACECF', xml);
  if (!schema.valid) throw new ReceiverError('La estructura del archivo XML no es válida, favor verificar el XSD correspondiente');

  const approval = readAcecf(xml);
  const signature = verifySignedXml(xml);
  if (!signature.valid || !signature.certPem || !certificateMatchesRnc(signature.certPem, approval.rncComprador)) {
    throw new ReceiverError('La firma del XML no es válida');
  }
  if (digits(approval.rncEmisor) !== digits(company.rnc)) throw new ReceiverError('El RNC emisor no corresponde a esta empresa');

  const sale = await basePrisma.sale.findFirst({ where: { companyId: company.id, eNcf: approval.eNcf }, select: { id: true } });
  if (!sale) throw new ReceiverError('Factura no encontrada para esta aprobación comercial');

  const approved = approval.status === 1;
  await basePrisma.ecfDocument.upsert({
    where: { saleId_kind: { saleId: sale.id, kind: 'ACECF' } },
    update: { xml, status: approved ? 'ACCEPTED' : 'REJECTED', lastError: approved ? null : approval.reason || 'Rechazada por el cliente', resolvedAt: new Date() },
    create: { companyId: company.id, saleId: sale.id, kind: 'ACECF', eNcf: approval.eNcf, xml, status: approved ? 'ACCEPTED' : 'REJECTED', lastError: approved ? null : approval.reason || 'Rechazada por el cliente', resolvedAt: new Date() },
  });
  return { approved, eNcf: approval.eNcf };
}
