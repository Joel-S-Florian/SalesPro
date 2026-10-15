import { prisma } from '../../config/db.js';
import { getTenantId } from '../../config/tenant.js';
import { AppError } from '../../shared/exceptions/AppError.js';
import { EcfBuildError, buildAnecfXml } from './ecf.builder.js';
import { dgiiServiceUrl } from './ecf.constants.js';
import { DgiiHttpError, dgiiClient, xmlForm } from './ecf.dgii.client.js';
import { loadIssuingContext } from './ecf.issue.js';
import { signXml } from './ecf.signer.js';
import { tokenManager } from './ecf.token.service.js';
import { validateAgainstXsd } from './ecf.xsd.js';

/**
 * Anulación de rangos de e-NCF NO utilizados (ANECF). Sirve para dar de baja números que no se van a usar
 * (por ejemplo antes de que venza un rango). Solo se pueden anular los números que siguen inmediatamente al
 * último usado de un rango autorizado; al confirmarlo la DGII, el sistema los salta en la secuencia local.
 */
export async function voidRanges(ranges) {
  const companyId = getTenantId();
  const context = await loadIssuingContext({ purpose: 'sign-anecf' });
  if (!context) throw AppError.badRequest('La facturación electrónica no está activada');

  // Cada rango debe estar dentro de un rango autorizado y empezar justo después del último número usado
  const sequences = await prisma.ecfSequence.findMany({ where: { active: true } });
  const plan = ranges.map((range, index) => {
    const sequence = sequences.find(s => s.ecfType === range.ecfType && range.from >= s.rangeFrom && range.to <= s.rangeTo);
    if (!sequence) throw AppError.badRequest(`El rango ${index + 1} no está dentro de un rango autorizado de ${range.ecfType}`);
    if (range.from !== sequence.current + 1) {
      throw AppError.badRequest(`El rango ${index + 1} debe empezar en ${sequence.current + 1}, el siguiente número sin usar de ${range.ecfType}`);
    }
    return { sequence, range };
  });
  const sameSequence = new Set(plan.map(p => p.sequence.id));
  if (sameSequence.size !== plan.length) throw AppError.badRequest('Cada solicitud admite un solo rango por secuencia');

  let signed;
  try {
    signed = signXml(buildAnecfXml({ rncEmisor: context.issuer.rnc, ranges: ranges.map(r => ({ type: r.ecfType, from: r.from, to: r.to })) }), context.creds);
  } catch (error) {
    if (error instanceof EcfBuildError) throw AppError.badRequest(error.message);
    throw error;
  }
  const check = await validateAgainstXsd('ANECF', signed);
  if (!check.valid) throw AppError.internal(`La anulación no cumple el esquema: ${check.errors[0]}`);

  let response;
  try {
    ({ json: response } = await tokenManager.withToken(companyId, token =>
      dgiiClient.authed(token, `${dgiiServiceUrl(context.mode, 'voidRanges')}/api/operaciones/anularrango`, {
        method: 'POST',
        body: xmlForm(signed, `${String(context.issuer.rnc).replace(/\D/g, '')}ANECF.xml`),
      })
    ));
  } catch (error) {
    const message = error instanceof DgiiHttpError ? error.message : error.message;
    throw AppError.badRequest(`La DGII no anuló los rangos: ${message}`);
  }

  // Confirmado: se saltan esos números en la secuencia local y queda constancia
  for (const { sequence, range } of plan) {
    await prisma.ecfSequence.update({ where: { id: sequence.id }, data: { current: range.to } });
  }
  await prisma.ecfDocument.create({
    data: { kind: 'ANULACION', xml: signed, status: 'STORED', resolvedAt: new Date(), dgiiMessages: response?.mensajes ?? [], lastError: null },
  });
  return { voided: ranges.reduce((sum, r) => sum + (r.to - r.from + 1), 0), messages: response?.mensajes ?? [] };
}
