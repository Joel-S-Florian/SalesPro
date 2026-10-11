import { formatDate, formatDateTime } from './ecf.builder.js';
import { ENVIRONMENT_PATH } from './ecf.constants.js';

/**
 * Enlace del timbre electrónico (el que lleva el código QR de la representación impresa).
 * Formato según las «Preguntas Técnicas e-CF» de la DGII:
 * - e-CF:                      https://ecf.dgii.gov.do/{amb}/ConsultaTimbre?RncEmisor&RncComprador&ENCF&FechaEmision&MontoTotal&FechaFirma&CodigoSeguridad
 * - E32 menor de RD$250,000:   https://fc.dgii.gov.do/{amb}/ConsultaTimbreFC?RNCEmisor&ENCF&MontoTotal&CodigoSeguridad
 * Los valores se codifican para URL (el espacio de la fecha/hora de firma va como %20).
 */
const q = (name, value) => `${name}=${encodeURIComponent(String(value))}`;
const amount = value => (Math.round(Number(value) * 100) / 100).toFixed(2);

/**
 * @param {Object} input
 * @param {'PRECERT'|'CERT'|'PROD'} input.mode
 * @param {boolean} input.summary  true para E32 menor de RD$250,000 (consulta de factura de consumo)
 */
export function buildStampUrl({ mode, rncEmisor, rncComprador, eNcf, issuedAt, total, signedAt, securityCode, summary = false }) {
  const environment = ENVIRONMENT_PATH[mode];
  if (!environment) throw new Error(`Modo sin ambiente DGII: ${mode}`);
  const digits = value => String(value ?? '').replace(/\D/g, '');

  if (summary) {
    const params = [q('RncEmisor', digits(rncEmisor)), q('ENCF', eNcf), q('MontoTotal', amount(total)), q('CodigoSeguridad', securityCode)];
    return `https://fc.dgii.gov.do/${environment}/ConsultaTimbreFC?${params.join('&')}`;
  }
  const params = [
    q('RncEmisor', digits(rncEmisor)),
    ...(digits(rncComprador) ? [q('RncComprador', digits(rncComprador))] : []),
    q('ENCF', eNcf),
    q('FechaEmision', formatDate(issuedAt)),
    q('MontoTotal', amount(total)),
    q('FechaFirma', formatDateTime(signedAt)),
    q('CodigoSeguridad', securityCode),
  ];
  return `https://ecf.dgii.gov.do/${environment}/ConsultaTimbre?${params.join('&')}`;
}
