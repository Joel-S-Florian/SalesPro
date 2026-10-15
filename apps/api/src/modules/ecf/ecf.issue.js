import { basePrisma, prisma } from '../../config/db.js';
import { getTenantId } from '../../config/tenant.js';
import { AppError } from '../../shared/exceptions/AppError.js';
import { determineNCFType } from '../../shared/utils/dgii.js';
import { EcfBuildError, buildEcfXml, buildRfceXml } from './ecf.builder.js';
import { RFCE_THRESHOLD } from './ecf.constants.js';
import { allocateENcf } from './ecf.sequence.service.js';
import { securityCodeOf, signXml } from './ecf.signer.js';
import { buildStampUrl } from './ecf.stamp.js';
import { loadCredentialsFromDb } from './ecf.token.service.js';
import { validateAgainstXsd } from './ecf.xsd.js';

/**
 * Emisión de comprobantes electrónicos al registrar una venta o una devolución.
 *
 * `loadIssuingContext()` dice si la empresa factura electrónicamente. `issueEcf()` se llama DENTRO de la transacción
 * de la venta: asigna el e-NCF, arma el XML, lo firma y lo valida contra el XSD de la DGII. Si algo falla se lanza
 * un error y la transacción se revierte (la venta no se registra y el número no se consume); el envío a la DGII
 * ocurre después, desde la cola (`ecf.outbox.js`), así una caída de la DGII nunca bloquea una venta.
 */

/** Contexto de emisión de la empresa actual, o null si la facturación electrónica está apagada. */
export async function loadIssuingContext({ purpose = 'sign-ecf', documentId = null, userId = null } = {}) {
  const companyId = getTenantId();
  const config = await prisma.ecfConfig.findFirst();
  if (!config || config.mode === 'OFF') return null;

  const company = await basePrisma.company.findUnique({ where: { id: companyId }, select: { id: true, name: true, rnc: true, address: true } });
  let creds;
  try {
    creds = await loadCredentialsFromDb(companyId, { purpose, documentId, userId });
  } catch (error) {
    throw AppError.badRequest(`No se puede emitir el comprobante electrónico: ${error.message}`);
  }
  if (config.certNotAfter && config.certNotAfter < new Date()) {
    throw AppError.badRequest('No se puede emitir el comprobante electrónico: el certificado digital está vencido');
  }
  return {
    mode: config.mode,
    creds,
    issuer: {
      rnc: company.rnc,
      legalName: config.legalName || company.name,
      tradeName: config.tradeName,
      address: config.address || company.address,
      municipalityCode: config.municipalityCode,
      provinceCode: config.provinceCode,
    },
  };
}

/** RNC o cédula con que se identifica al comprador en el comprobante (si el cliente tiene uno válido). */
const buyerTaxId = customer => {
  const candidate = String(customer.rnc || customer.documentId || '').replace(/\D/g, '');
  return /^(\d{9}|\d{11})$/.test(candidate) && candidate !== '000000000' ? candidate : '';
};

/** E31 si el cliente tiene RNC (crédito fiscal); E32 si es consumidor final. */
export const ecfTypeForCustomer = customer => (determineNCFType(customer) === 'B01' ? 'E31' : 'E32');

/**
 * Asigna el e-NCF, arma, firma y valida el comprobante.
 *
 * @param {Object} tx - transacción de Prisma
 * @param {Object} context - resultado de `loadIssuingContext()`
 * @param {Object} data
 * @param {'E31'|'E32'|'E34'} data.ecfType
 * @param {Object} data.customer - { rnc, name }
 * @param {Array}  data.lines - [{ name, quantity, unitPrice }] (positivos)
 * @param {number} data.discount - descuento global (positivo)
 * @param {number} data.tax - ITBIS registrado (positivo)
 * @param {number} data.total - total registrado (positivo)
 * @param {string} data.paymentMethod
 * @param {number} data.taxRate
 * @param {Object} [data.reference] - E34: { eNcf, issuedAt, modificationCode, afterThirtyDays }
 */
export async function issueEcf(tx, context, data) {
  const issuedAt = new Date();
  const signedAt = new Date();
  try {
    const { eNcf, sequence } = await allocateENcf(tx, data.ecfType, issuedAt);
    const common = {
      issuer: context.issuer,
      buyer: { rnc: buyerTaxId(data.customer), name: data.customer.name },
      lines: data.lines,
      discount: data.discount,
      taxRate: data.taxRate,
      expectedTax: data.tax,
      expectedTotal: data.total,
      paymentMethod: data.paymentMethod,
      issuedAt,
      signedAt,
    };

    const built = buildEcfXml({ ...common, ecfType: data.ecfType, eNcf, sequenceValidUntil: sequence.validUntil, reference: data.reference });
    const signed = signXml(built.xml, context.creds);
    const check = await validateAgainstXsd(data.ecfType, signed);
    if (!check.valid) throw new EcfBuildError(`el comprobante no cumple el esquema de la DGII (${check.errors.slice(0, 2).join(' | ')})`);

    const securityCode = securityCodeOf(signed);
    // Facturas de consumo menores de RD$250,000: la DGII recibe un resumen (RFCE); el e-CF completo se conserva aquí
    const summary = data.ecfType === 'E32' && built.amounts.total < RFCE_THRESHOLD;
    const documents = [{ kind: 'ECF', xml: signed, status: summary ? 'STORED' : 'PENDING' }];

    if (summary) {
      const rfce = signXml(buildRfceXml({ ...common, eNcf, securityCode }), context.creds);
      const rfceCheck = await validateAgainstXsd('RFCE', rfce);
      if (!rfceCheck.valid) throw new EcfBuildError(`el resumen de factura de consumo no cumple el esquema (${rfceCheck.errors.slice(0, 2).join(' | ')})`);
      documents.push({ kind: 'RFCE', xml: rfce, status: 'PENDING' });
    }

    const stampUrl = buildStampUrl({
      mode: context.mode,
      rncEmisor: context.issuer.rnc,
      rncComprador: buyerTaxId(data.customer),
      eNcf,
      issuedAt,
      total: built.amounts.total,
      signedAt,
      securityCode,
      summary,
    });

    return { eNcf, ecfType: data.ecfType, securityCode, signedAt, stampUrl, documents, issuedAt };
  } catch (error) {
    if (error instanceof EcfBuildError) throw AppError.badRequest(`No se puede emitir el comprobante electrónico: ${error.message}`);
    throw error;
  }
}

/** Campos de la venta que describen su comprobante electrónico. */
export const saleEcfFields = ecf => ({
  invoiceNumber: ecf.eNcf,
  eNcf: ecf.eNcf,
  ecfType: ecf.ecfType,
  ecfStatus: 'PENDING',
  ecfSecurityCode: ecf.securityCode,
  ecfSignedAt: ecf.signedAt,
  ecfStampUrl: ecf.stampUrl,
});

/** Guarda en la cola los documentos firmados de una venta (dentro de su transacción). */
export async function saveEcfDocuments(tx, saleId, ecf) {
  for (const doc of ecf.documents) {
    await tx.ecfDocument.create({ data: { saleId, kind: doc.kind, eNcf: ecf.eNcf, xml: doc.xml, status: doc.status } });
  }
}
