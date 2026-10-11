import { basePrisma, prisma } from '../../config/db.js';
import { getTenantId } from '../../config/tenant.js';
import { AppError } from '../../shared/exceptions/AppError.js';
import { RECEIVER_PATHS, dgiiServiceUrl } from './ecf.constants.js';
import { DgiiHttpError, dgiiClient } from './ecf.dgii.client.js';
import { tokenManager } from './ecf.token.service.js';

/**
 * Directorio de contribuyentes electrónicos de la DGII: permite saber si un cliente (por su RNC) es emisor
 * electrónico y a qué direcciones enviarle su e-CF y las aprobaciones comerciales.
 *
 * Solo existe en pre-certificación (devuelve direcciones de prueba) y producción; en certificación no está publicado.
 */

const STALE_MS = 24 * 60 * 60 * 1000;
const digits = value => String(value ?? '').replace(/\D/g, '');

/** El directorio entrega el host del servicio; si no trae la ruta estándar, se agrega. */
export function normalizeServiceUrl(value, standardPath) {
  const url = String(value ?? '').trim();
  if (!url) return null;
  return url.toLowerCase().includes(standardPath.toLowerCase()) ? url : `${url.replace(/\/+$/, '')}${standardPath}`;
}

/**
 * Consulta el directorio por RNC.
 * @returns {Promise<{ supported: boolean, isIssuer: boolean, name?: string, receptionUrl?: string, approvalUrl?: string, authUrl?: string|null }>}
 */
export async function lookupDirectory(companyId, rnc) {
  const config = await basePrisma.ecfConfig.findUnique({ where: { companyId }, select: { mode: true } });
  if (!config || config.mode === 'OFF') throw AppError.badRequest('La facturación electrónica no está activada');
  if (config.mode === 'CERT') return { supported: false, isIssuer: false };

  const url = `${dgiiServiceUrl(config.mode, 'directory')}/api/consultas/obtenerdirectorioporrnc?RNC=${encodeURIComponent(digits(rnc))}`;
  let json;
  try {
    ({ json } = await tokenManager.withToken(companyId, token => dgiiClient.authed(token, url)));
  } catch (error) {
    if (error instanceof DgiiHttpError && error.status === 404) return { supported: true, isIssuer: false };
    throw error;
  }
  const entry = Array.isArray(json) ? json[0] : json;
  if (!entry?.rnc) return { supported: true, isIssuer: false };
  return {
    supported: true,
    isIssuer: true,
    name: entry.nombre,
    receptionUrl: normalizeServiceUrl(entry.urlRecepcion, RECEIVER_PATHS.reception),
    approvalUrl: normalizeServiceUrl(entry.urlAceptacion, RECEIVER_PATHS.commercialApproval),
    authUrl: entry.urlOpcional || null,
  };
}

/** Datos del emisor/receptor electrónico de un cliente, ya guardados. */
export const presentCustomerEcf = customer => ({
  customerId: customer.id,
  ecfIssuer: customer.ecfIssuer,
  ecfReceptionUrl: customer.ecfReceptionUrl,
  ecfApprovalUrl: customer.ecfApprovalUrl,
  ecfDirectoryCheckedAt: customer.ecfDirectoryCheckedAt,
});

/**
 * Consulta el directorio para un cliente y guarda el resultado en su ficha.
 * Dentro de las 24 horas reutiliza lo ya consultado, salvo `force`.
 */
export async function checkCustomer(customerId, { force = false } = {}) {
  const companyId = getTenantId();
  const customer = await prisma.customer.findUnique({ where: { id: customerId } });
  if (!customer) throw AppError.notFound('Cliente no encontrado');
  const rnc = digits(customer.rnc || customer.documentId);
  if (!/^(\d{9}|\d{11})$/.test(rnc) || rnc === '000000000') {
    throw AppError.badRequest('El cliente no tiene un RNC o cédula válido para consultar en la DGII');
  }
  if (!force && customer.ecfDirectoryCheckedAt && Date.now() - customer.ecfDirectoryCheckedAt.getTime() < STALE_MS) {
    return { ...presentCustomerEcf(customer), cached: true };
  }

  let result;
  try {
    result = await lookupDirectory(companyId, rnc);
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw AppError.badRequest(`No se pudo consultar el directorio de la DGII: ${error.message}`);
  }
  if (!result.supported) throw AppError.badRequest('El directorio de la DGII no está disponible en el ambiente de certificación');

  const updated = await prisma.customer.update({
    where: { id: customerId },
    data: {
      ecfIssuer: result.isIssuer,
      ecfReceptionUrl: result.isIssuer ? result.receptionUrl : null,
      ecfApprovalUrl: result.isIssuer ? result.approvalUrl : null,
      ecfDirectoryCheckedAt: new Date(),
    },
  });
  return { ...presentCustomerEcf(updated), cached: false, name: result.name };
}
