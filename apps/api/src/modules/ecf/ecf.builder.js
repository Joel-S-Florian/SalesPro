import { toLocal } from '../../shared/utils/tz.js';
import { RFCE_THRESHOLD } from './ecf.constants.js';

/**
 * Construcción de los XML de la DGII (e-CF E31/E32/E34 y resumen de factura de consumo RFCE).
 *
 * Funciones puras: reciben datos ya calculados (no consultan la base de datos) y devuelven el XML SIN firmar.
 * El orden de las etiquetas sigue el esquema oficial (`xsd/`), que usa `xs:sequence`; las etiquetas opcionales sin
 * valor NO se emiten (la DGII rechaza etiquetas vacías). El resultado se firma y se valida contra el XSD en `ecf.issue.js`.
 */

export class EcfBuildError extends Error {
  constructor(message) {
    super(message);
    this.name = 'EcfBuildError';
  }
}

const round2 = value => Math.round((Number(value) + Number.EPSILON) * 100) / 100;
const money = value => round2(value).toFixed(2);
const pad = n => String(n).padStart(2, '0');

/** dd-MM-yyyy en hora dominicana. */
export function formatDate(date) {
  const d = toLocal(date);
  return `${pad(d.getUTCDate())}-${pad(d.getUTCMonth() + 1)}-${d.getUTCFullYear()}`;
}

/** dd-MM-yyyy HH:mm:ss en hora dominicana. */
export function formatDateTime(date) {
  const d = toLocal(date);
  return `${formatDate(date)} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
}

/** Escapa los caracteres que la DGII exige reemplazar y elimina caracteres de control. */
export function escapeXml(value) {
  return String(value ?? '')
    // eslint-disable-next-line no-control-regex -- los caracteres de control no son válidos en XML 1.0
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

const clip = (value, max) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const digits = value => String(value ?? '').replace(/\D/g, '');
const validTaxId = value => /^(\d{9}|\d{11})$/.test(digits(value)) && digits(value) !== '000000000';

/** Etiqueta con texto; devuelve '' si no hay valor (nunca se emiten etiquetas vacías). */
const tag = (name, value) => (value === undefined || value === null || value === '' ? '' : `<${name}>${escapeXml(value)}</${name}>`);

/** Forma de pago según la tabla de la DGII. */
const PAYMENT_CODES = { EFECTIVO: 1, TARJETA: 3 };

/** Indicador de facturación y etiquetas de totales según la tasa de ITBIS. */
const TAX_RATES = {
  0.18: { indicator: 1, taxable: 'MontoGravadoI1', percent: 'ITBIS1', total: 'TotalITBIS1', percentValue: 18 },
  0.16: { indicator: 2, taxable: 'MontoGravadoI2', percent: 'ITBIS2', total: 'TotalITBIS2', percentValue: 16 },
  0: { indicator: 3, taxable: 'MontoGravadoI3', percent: 'ITBIS3', total: 'TotalITBIS3', percentValue: 0 },
};

function taxProfile(rate) {
  const profile = TAX_RATES[Number(rate)];
  if (!profile) {
    throw new EcfBuildError(`La tasa de ITBIS configurada (${Number(rate) * 100}%) no está soportada por la facturación electrónica (18%, 16% o 0%)`);
  }
  return profile;
}

/** Reparte el descuento global entre las líneas, proporcional al monto de cada una (la última absorbe el redondeo). */
function allocateDiscount(grossAmounts, discount) {
  const totalGross = grossAmounts.reduce((sum, v) => sum + v, 0);
  if (!(discount > 0) || totalGross <= 0) return grossAmounts.map(() => 0);
  let remaining = round2(discount);
  return grossAmounts.map((gross, index) => {
    const share = index === grossAmounts.length - 1 ? remaining : Math.min(remaining, round2((discount * gross) / totalGross));
    remaining = round2(remaining - share);
    return share;
  });
}

/** Normaliza líneas y calcula montos y totales a partir de lo que ya está registrado en la venta. */
export function computeAmounts({ lines, discount = 0, taxRate, expectedTax, expectedTotal }) {
  if (!lines?.length) throw new EcfBuildError('El comprobante no tiene productos');
  const profile = taxProfile(taxRate);
  const gross = lines.map(l => round2(Number(l.unitPrice) * Number(l.quantity)));
  const allocated = allocateDiscount(gross, Number(discount) || 0);

  const items = lines.map((line, index) => ({
    number: index + 1,
    name: clip(line.name, 80) || 'Producto',
    quantity: Number(line.quantity),
    unitPrice: Number(line.unitPrice),
    unitCode: line.unitCode || null,
    discount: allocated[index],
    amount: round2(gross[index] - allocated[index]),
  }));

  const taxable = round2(items.reduce((sum, i) => sum + i.amount, 0));
  const tax = round2(taxable * Number(taxRate));
  const total = round2(taxable + tax);

  // La venta ya guardada manda: si no cuadra con lo que se va a declarar, no se emite
  if (expectedTax !== undefined && Math.abs(tax - round2(expectedTax)) > 0.011) {
    throw new EcfBuildError(`El ITBIS calculado (${money(tax)}) no coincide con el de la venta (${money(expectedTax)})`);
  }
  if (expectedTotal !== undefined && Math.abs(total - round2(expectedTotal)) > 0.011) {
    throw new EcfBuildError(`El total calculado (${money(total)}) no coincide con el de la venta (${money(expectedTotal)})`);
  }
  return { items, taxable, tax, total, profile };
}

/** Precio unitario con 2 a 4 decimales. */
function unitPriceText(value) {
  const fixed = Number(value).toFixed(4).replace(/0{1,2}$/, '');
  return fixed.includes('.') ? fixed : `${fixed}.00`;
}

function buyerBlock(ecfType, buyer = {}) {
  const hasId = validTaxId(buyer.rnc);
  const name = clip(buyer.name, 150);
  if (ecfType === 'E31' && !hasId) throw new EcfBuildError('La factura de crédito fiscal requiere el RNC o cédula del comprador');
  if (ecfType === 'E31' && !name) throw new EcfBuildError('La factura de crédito fiscal requiere la razón social del comprador');
  const content = `${hasId ? tag('RNCComprador', digits(buyer.rnc)) : ''}${tag('RazonSocialComprador', name || (hasId ? '' : 'CONSUMIDOR FINAL'))}`;
  return `<Comprador>${content}</Comprador>`;
}

function issuerBlock(issuer, issueDate) {
  if (!validTaxId(issuer.rnc)) throw new EcfBuildError('El RNC de la empresa no es válido');
  if (!clip(issuer.legalName, 150)) throw new EcfBuildError('Falta la razón social de la empresa (Configuración → Facturación electrónica)');
  if (!clip(issuer.address, 100)) throw new EcfBuildError('Falta la dirección fiscal de la empresa (Configuración → Facturación electrónica)');
  return (
    '<Emisor>' +
    tag('RNCEmisor', digits(issuer.rnc)) +
    tag('RazonSocialEmisor', clip(issuer.legalName, 150)) +
    tag('NombreComercial', clip(issuer.tradeName, 150)) +
    tag('Sucursal', clip(issuer.branchCode, 20)) +
    tag('DireccionEmisor', clip(issuer.address, 100)) +
    tag('Municipio', issuer.municipalityCode) +
    tag('Provincia', issuer.provinceCode) +
    tag('FechaEmision', formatDate(issueDate)) +
    '</Emisor>'
  );
}

/**
 * XML (sin firmar) de un e-CF E31, E32 o E34.
 *
 * @param {Object} input
 * @param {'E31'|'E32'|'E34'} input.ecfType
 * @param {string} input.eNcf               e-NCF ya asignado (13 caracteres)
 * @param {Object} input.issuer             { rnc, legalName, tradeName, address, municipalityCode, provinceCode }
 * @param {Object} [input.buyer]            { rnc, name }
 * @param {Array}  input.lines              [{ name, quantity, unitPrice }] con cantidades y precios POSITIVOS
 * @param {number} [input.discount]         descuento global (positivo)
 * @param {number} input.taxRate            0.18, 0.16 o 0
 * @param {number} [input.expectedTax]      ITBIS registrado en la venta (positivo): se verifica
 * @param {number} [input.expectedTotal]    total registrado en la venta (positivo): se verifica
 * @param {string} input.paymentMethod      EFECTIVO | TARJETA
 * @param {Date}   input.issuedAt           fecha de emisión
 * @param {Date}   input.signedAt           fecha y hora de firma
 * @param {Date}   [input.sequenceValidUntil] vencimiento del rango (obligatorio en E31)
 * @param {Object} [input.reference]        E34: { eNcf, issuedAt, modificationCode, afterThirtyDays }
 * @returns {{ xml: string, amounts: Object, issueDate: string, signDate: string }}
 */
export function buildEcfXml(input) {
  const { ecfType, eNcf, issuer, buyer, lines, discount = 0, taxRate, expectedTax, expectedTotal, paymentMethod, issuedAt, signedAt, sequenceValidUntil, reference } = input;
  if (!['E31', 'E32', 'E34'].includes(ecfType)) throw new EcfBuildError(`Tipo de comprobante no soportado todavía: ${ecfType}`);
  if (!new RegExp(`^E${ecfType.slice(1)}[0-9]{10}$`).test(eNcf || '')) {
    throw new EcfBuildError(`El e-NCF no tiene el formato de un ${ecfType} (E${ecfType.slice(1)} + 10 dígitos)`);
  }

  const amounts = computeAmounts({ lines, discount, taxRate, expectedTax, expectedTotal });
  const { profile } = amounts;
  if (ecfType === 'E32' && amounts.total >= RFCE_THRESHOLD && !validTaxId(buyer?.rnc)) {
    throw new EcfBuildError('Una factura de consumo de RD$250,000 o más requiere identificar al comprador (RNC o cédula)');
  }
  if (ecfType === 'E31' && !sequenceValidUntil) throw new EcfBuildError('El rango de E31 necesita fecha de vencimiento (Configuración → Facturación electrónica)');
  if (ecfType === 'E34' && !reference?.eNcf) throw new EcfBuildError('La nota de crédito electrónica debe referenciar el e-NCF original');

  const paymentCode = PAYMENT_CODES[paymentMethod] ?? 1;
  const idDoc =
    '<IdDoc>' +
    tag('TipoeCF', ecfType.slice(1)) +
    tag('eNCF', eNcf) +
    (ecfType === 'E31' ? tag('FechaVencimientoSecuencia', formatDate(sequenceValidUntil)) : '') +
    (ecfType === 'E34' ? tag('IndicadorNotaCredito', reference.afterThirtyDays ? 1 : 0) : '') +
    tag('IndicadorMontoGravado', 0) +
    tag('TipoIngresos', '01') +
    tag('TipoPago', 1) +
    (ecfType === 'E34'
      ? ''
      : `<TablaFormasPago><FormaDePago>${tag('FormaPago', paymentCode)}${tag('MontoPago', money(amounts.total))}</FormaDePago></TablaFormasPago>`) +
    '</IdDoc>';

  const totales =
    '<Totales>' +
    tag('MontoGravadoTotal', money(amounts.taxable)) +
    tag(profile.taxable, money(amounts.taxable)) +
    tag(profile.percent, profile.percentValue) +
    tag('TotalITBIS', money(amounts.tax)) +
    tag(profile.total, money(amounts.tax)) +
    tag('MontoTotal', money(amounts.total)) +
    '</Totales>';

  const items =
    '<DetallesItems>' +
    amounts.items
      .map(
        item =>
          '<Item>' +
          tag('NumeroLinea', item.number) +
          tag('IndicadorFacturacion', profile.indicator) +
          tag('NombreItem', item.name) +
          tag('IndicadorBienoServicio', 1) +
          tag('CantidadItem', item.quantity.toFixed(2)) +
          (item.unitCode ? tag('UnidadMedida', item.unitCode) : '') +
          tag('PrecioUnitarioItem', unitPriceText(item.unitPrice)) +
          (item.discount > 0 ? tag('DescuentoMonto', money(item.discount)) : '') +
          tag('MontoItem', money(item.amount)) +
          '</Item>'
      )
      .join('') +
    '</DetallesItems>';

  const referenceBlock =
    ecfType === 'E34'
      ? `<InformacionReferencia>${tag('NCFModificado', reference.eNcf)}${tag('FechaNCFModificado', formatDate(reference.issuedAt))}${tag('CodigoModificacion', reference.modificationCode ?? 3)}</InformacionReferencia>`
      : '';

  const xml =
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<ECF>' +
    `<Encabezado><Version>1.0</Version>${idDoc}${issuerBlock(issuer, issuedAt)}${buyerBlock(ecfType, buyer)}${totales}</Encabezado>` +
    items +
    referenceBlock +
    tag('FechaHoraFirma', formatDateTime(signedAt)) +
    '</ECF>';

  return { xml, amounts, issueDate: formatDate(issuedAt), signDate: formatDateTime(signedAt) };
}

/**
 * XML (sin firmar) del resumen de factura de consumo (RFCE) de un E32 menor de RD$250,000.
 * Lleva los mismos datos del e-CF más su código de seguridad.
 * @param {Object} input los mismos datos que `buildEcfXml` (E32) y `securityCode` (6 caracteres)
 */
export function buildRfceXml(input) {
  const { eNcf, issuer, buyer, lines, discount = 0, taxRate, expectedTax, expectedTotal, paymentMethod, issuedAt, securityCode } = input;
  if (!/^E32\d{10}$/.test(eNcf || '')) throw new EcfBuildError('El resumen de factura de consumo solo aplica a e-CF E32');
  if (!securityCode || securityCode.length !== 6) throw new EcfBuildError('Falta el código de seguridad del e-CF');
  const amounts = computeAmounts({ lines, discount, taxRate, expectedTax, expectedTotal });
  if (amounts.total >= RFCE_THRESHOLD) throw new EcfBuildError('Las facturas de consumo de RD$250,000 o más se envían completas, no como resumen');
  const { profile } = amounts;

  const hasId = validTaxId(buyer?.rnc);
  const comprador = `<Comprador>${hasId ? tag('RNCComprador', digits(buyer.rnc)) : ''}${tag('RazonSocialComprador', clip(buyer?.name, 150) || (hasId ? '' : 'CONSUMIDOR FINAL'))}</Comprador>`;

  return (
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<RFCE><Encabezado>' +
    '<Version>1.0</Version>' +
    `<IdDoc>${tag('TipoeCF', 32)}${tag('eNCF', eNcf)}${tag('TipoIngresos', '01')}${tag('TipoPago', 1)}` +
    `<TablaFormasPago><FormaDePago>${tag('FormaPago', PAYMENT_CODES[paymentMethod] ?? 1)}${tag('MontoPago', money(amounts.total))}</FormaDePago></TablaFormasPago></IdDoc>` +
    `<Emisor>${tag('RNCEmisor', digits(issuer.rnc))}${tag('RazonSocialEmisor', clip(issuer.legalName, 150))}${tag('FechaEmision', formatDate(issuedAt))}</Emisor>` +
    comprador +
    `<Totales>${tag('MontoGravadoTotal', money(amounts.taxable))}${tag(profile.taxable, money(amounts.taxable))}${tag('TotalITBIS', money(amounts.tax))}${tag(profile.total, money(amounts.tax))}${tag('MontoTotal', money(amounts.total))}</Totales>` +
    tag('CodigoSeguridadeCF', securityCode) +
    '</Encabezado></RFCE>'
  );
}

/* -------------------------------------------------------------------------------------------------------- */
/* Acuse de recibo, aprobación comercial y anulación de rangos                                               */
/* -------------------------------------------------------------------------------------------------------- */

/**
 * Acuse de recibo (ARECF) que la empresa, como RECEPTORA, devuelve de inmediato al emisor de un e-CF.
 * @param {Object} input
 * @param {boolean} input.received - true: e-CF recibido (Estado 0); false: no recibido (Estado 1)
 * @param {number} [input.reasonCode] - 1 especificación, 2 firma, 3 duplicado, 4 comprador no corresponde
 */
export function buildArecfXml({ rncEmisor, rncComprador, eNcf, received, reasonCode, at = new Date() }) {
  return (
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<ARECF><DetalleAcusedeRecibo>' +
    tag('Version', '1.0') +
    tag('RNCEmisor', digits(rncEmisor)) +
    tag('RNCComprador', digits(rncComprador)) +
    tag('eNCF', eNcf) +
    tag('Estado', received ? 0 : 1) +
    (received ? '' : tag('CodigoMotivoNoRecibido', reasonCode ?? 1)) +
    tag('FechaHoraAcuseRecibo', formatDateTime(at)) +
    '</DetalleAcusedeRecibo></ARECF>'
  );
}

/**
 * Aprobación comercial (ACECF): el comprador acepta o rechaza un e-CF que le emitieron.
 * @param {boolean} input.approved - true: aprobada (Estado 1); false: rechazada (Estado 2)
 */
export function buildAcecfXml({ rncEmisor, rncComprador, eNcf, issueDate, total, approved, rejectionReason, at = new Date() }) {
  if (!approved && !clip(rejectionReason, 250)) throw new EcfBuildError('Indique el motivo del rechazo');
  return (
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<ACECF><DetalleAprobacionComercial>' +
    tag('Version', '1.0') +
    tag('RNCEmisor', digits(rncEmisor)) +
    tag('eNCF', eNcf) +
    tag('FechaEmision', issueDate) +
    tag('MontoTotal', money(total)) +
    tag('RNCComprador', digits(rncComprador)) +
    tag('Estado', approved ? 1 : 2) +
    (approved ? '' : tag('DetalleMotivoRechazo', clip(rejectionReason, 250))) +
    tag('FechaHoraAprobacionComercial', formatDateTime(at)) +
    '</DetalleAprobacionComercial></ACECF>'
  );
}

/**
 * Anulación de rangos de e-NCF no utilizados (ANECF).
 * @param {Array<{ type: string, from: number, to: number }>} ranges - hasta 10 rangos, de tipos distintos o repetidos
 */
export function buildAnecfXml({ rncEmisor, ranges, at = new Date() }) {
  if (!ranges?.length) throw new EcfBuildError('Indique al menos un rango a anular');
  if (ranges.length > 10) throw new EcfBuildError('Se pueden anular hasta 10 rangos por solicitud');
  const total = ranges.reduce((sum, r) => sum + (r.to - r.from + 1), 0);
  const line = (r, index) => {
    if (!/^E\d{2}$/.test(r.type) || !(r.from >= 1) || r.to < r.from) throw new EcfBuildError(`El rango ${index + 1} no es válido`);
    const number = n => `${r.type}${String(n).padStart(10, '0')}`;
    return (
      '<Anulacion>' +
      tag('NoLinea', index + 1) +
      tag('TipoeCF', r.type.slice(1)) +
      `<TablaRangoSecuenciasAnuladaseNCF><Secuencias>${tag('SecuenciaeNCFDesde', number(r.from))}${tag('SecuenciaeNCFHasta', number(r.to))}</Secuencias></TablaRangoSecuenciasAnuladaseNCF>` +
      tag('CantidadeNCFAnulados', r.to - r.from + 1) +
      '</Anulacion>'
    );
  };
  return (
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<ANECF><Encabezado>' +
    tag('Version', '1.0') +
    tag('RncEmisor', digits(rncEmisor)) +
    tag('CantidadeNCFAnulados', total) +
    tag('FechaHoraAnulacioneNCF', formatDateTime(at)) +
    '</Encabezado>' +
    `<DetalleAnulacion>${ranges.map(line).join('')}</DetalleAnulacion>` +
    '</ANECF>'
  );
}
