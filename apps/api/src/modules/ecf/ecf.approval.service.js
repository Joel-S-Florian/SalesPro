import { prisma } from '../../config/db.js';
import { getTenantId } from '../../config/tenant.js';
import { AppError } from '../../shared/exceptions/AppError.js';
import { logger } from '../../shared/utils/logger.js';
import { EcfBuildError, buildAcecfXml } from './ecf.builder.js';
import { dgiiServiceUrl } from './ecf.constants.js';
import { lookupDirectory } from './ecf.directory.service.js';
import { dgiiClient } from './ecf.dgii.client.js';
import { loadIssuingContext } from './ecf.issue.js';
import { assertSafeTarget } from './ecf.safety.js';
import { signXml } from './ecf.signer.js';
import { tokenManager } from './ecf.token.service.js';
import { readEcfHeader } from './ecf.xml.js';
import { validateAgainstXsd } from './ecf.xsd.js';

/** e-CF recibidos de otros emisores y la respuesta (aprobación o rechazo comercial) que les da la empresa. */

const present = row => ({
  id: row.id,
  rncEmisor: row.rncEmisor,
  eNcf: row.eNcf,
  total: row.total,
  status: row.status,
  receivedAt: row.receivedAt,
  ...(row.supplierName ? { supplierName: row.supplierName } : {}),
});

export async function listInbox({ status, page = 1, limit = 20 } = {}) {
  const where = status ? { status } : {};
  const [rows, total] = await Promise.all([
    prisma.ecfInbox.findMany({ where, orderBy: { receivedAt: 'desc' }, skip: (page - 1) * limit, take: limit }),
    prisma.ecfInbox.count({ where }),
  ]);
  const suppliers = await prisma.supplier.findMany({ where: { rnc: { in: rows.map(r => r.rncEmisor) } }, select: { rnc: true, name: true } });
  const names = new Map(suppliers.map(s => [String(s.rnc).replace(/\D/g, ''), s.name]));
  return {
    data: rows.map(row => present({ ...row, supplierName: names.get(row.rncEmisor) })),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}

export async function getInboxXml(id) {
  const row = await prisma.ecfInbox.findUnique({ where: { id } });
  if (!row) throw AppError.notFound('Comprobante recibido no encontrado');
  return { fileName: `${row.rncEmisor}${row.eNcf}.xml`, xml: row.xml };
}

/**
 * Aprueba o rechaza comercialmente un e-CF recibido: firma un ACECF y lo envía a la DGII y al emisor.
 * Si la DGII no lo recibe, no se cambia el estado (se puede reintentar). Si solo falla el envío al emisor,
 * se informa pero se considera respondido.
 */
export async function respondToInbox(id, { approved, reason }) {
  const companyId = getTenantId();
  const inbox = await prisma.ecfInbox.findUnique({ where: { id } });
  if (!inbox) throw AppError.notFound('Comprobante recibido no encontrado');
  if (inbox.status !== 'RECIBIDO') throw AppError.conflict('Este comprobante ya fue respondido');

  const context = await loadIssuingContext();
  if (!context) throw AppError.badRequest('La facturación electrónica no está activada');

  const header = readEcfHeader(inbox.xml);
  let signed;
  try {
    signed = signXml(
      buildAcecfXml({ rncEmisor: inbox.rncEmisor, rncComprador: context.issuer.rnc, eNcf: inbox.eNcf, issueDate: header.issueDate, total: inbox.total ?? header.total, approved, rejectionReason: reason }),
      context.creds
    );
  } catch (error) {
    if (error instanceof EcfBuildError) throw AppError.badRequest(error.message);
    throw error;
  }
  const check = await validateAgainstXsd('ACECF', signed);
  if (!check.valid) throw AppError.internal(`La aprobación comercial no cumple el esquema: ${check.errors[0]}`);

  const fileName = `${String(context.issuer.rnc).replace(/\D/g, '')}${inbox.eNcf}.xml`;

  // 1) DGII (obligatorio)
  try {
    await tokenManager.withToken(companyId, token =>
      dgiiClient.authed(token, `${dgiiServiceUrl(context.mode, 'commercialApproval')}/api/aprobacioncomercial`, { method: 'POST', body: formOf(signed, fileName) })
    );
  } catch (error) {
    throw AppError.badRequest(`No se pudo informar la aprobación comercial a la DGII: ${error.message}`);
  }

  // 2) Emisor (mejor esfuerzo)
  let issuerNote = 'enviada';
  try {
    const directory = await lookupDirectory(companyId, inbox.rncEmisor);
    if (!directory.isIssuer || !directory.approvalUrl) issuerNote = 'el emisor no está en el directorio de la DGII';
    else {
      assertSafeTarget(directory.approvalUrl);
      await dgiiClient.postXml(directory.approvalUrl, signed, fileName);
    }
  } catch (error) {
    issuerNote = `no se pudo enviar al emisor: ${error.message}`;
    logger.warn('Aprobación comercial no entregada al emisor', { inboxId: id, reason: error.message });
  }

  await prisma.ecfDocument.create({ data: { kind: 'ACECF', eNcf: inbox.eNcf, xml: signed, status: 'STORED', resolvedAt: new Date(), lastError: approved ? null : reason } });
  const updated = await prisma.ecfInbox.update({ where: { id }, data: { status: approved ? 'APROBADO' : 'RECHAZADO' } });
  return { ...present(updated), dgii: 'recibida', issuer: issuerNote };
}

function formOf(xml, fileName) {
  const form = new FormData();
  form.append('xml', new Blob([xml], { type: 'text/xml' }), fileName);
  return form;
}
