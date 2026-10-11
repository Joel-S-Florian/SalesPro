/**
 * Constantes de la facturación electrónica (e-CF) de la DGII.
 * Fuente: «Descripción Técnica Servicios DGII» y «Descripción Técnica Emisores Electrónicos».
 */

export const ECF_TYPES = [
  { code: 'E31', number: 31, label: 'Factura de crédito fiscal' },
  { code: 'E32', number: 32, label: 'Factura de consumo' },
  { code: 'E33', number: 33, label: 'Nota de débito' },
  { code: 'E34', number: 34, label: 'Nota de crédito' },
  { code: 'E41', number: 41, label: 'Comprobante de compras' },
  { code: 'E43', number: 43, label: 'Gastos menores' },
  { code: 'E44', number: 44, label: 'Regímenes especiales' },
  { code: 'E45', number: 45, label: 'Gubernamental' },
  { code: 'E46', number: 46, label: 'Exportaciones' },
  { code: 'E47', number: 47, label: 'Pagos al exterior' },
];

export const ECF_TYPE_CODES = ECF_TYPES.map(t => t.code);

/** Las facturas de consumo (E32) por debajo de este monto se informan con un resumen (RFCE), no completas. */
export const RFCE_THRESHOLD = 250000;

/** Margen para renovar el token antes de que venza (el token dura 1 hora). */
export const TOKEN_REFRESH_MARGIN_MS = 5 * 60 * 1000;

/** Segmento de ruta del ambiente de la DGII para cada modo. */
export const ENVIRONMENT_PATH = {
  PRECERT: 'testecf',
  CERT: 'certecf',
  PROD: 'ecf',
};

const HOSTS = {
  main: 'https://ecf.dgii.gov.do',
  consumption: 'https://fc.dgii.gov.do', // resumen de factura de consumo
};

/** Servicio -> [host, nombre del servicio en la ruta]. */
const SERVICES = {
  auth: ['main', 'autenticacion'],
  reception: ['main', 'recepcion'],
  result: ['main', 'consultaresultado'],
  status: ['main', 'consultaestado'],
  trackIds: ['main', 'consultatrackids'],
  directory: ['main', 'consultadirectorio'],
  commercialApproval: ['main', 'aprobacioncomercial'],
  voidRanges: ['main', 'anulacionrangos'],
  stamp: ['main', 'consultatimbre'],
  rfceReception: ['consumption', 'recepcionfc'],
  rfceQuery: ['consumption', 'consultarfce'],
  rfceStamp: ['consumption', 'consultatimbrefc'],
};

/**
 * URL base de un servicio de la DGII.
 * Con `ECF_BASE_URL_OVERRIDE` (por ejemplo el simulador local) todos los servicios salen de ese host.
 * @param {'PRECERT'|'CERT'|'PROD'} mode
 * @param {keyof typeof SERVICES} service
 */
export function dgiiServiceUrl(mode, service, { overrideBaseUrl = process.env.ECF_BASE_URL_OVERRIDE } = {}) {
  const environment = ENVIRONMENT_PATH[mode];
  const entry = SERVICES[service];
  if (!environment) throw new Error(`Modo de facturación electrónica sin ambiente DGII: ${mode}`);
  if (!entry) throw new Error(`Servicio DGII desconocido: ${service}`);
  const host = overrideBaseUrl ? overrideBaseUrl.replace(/\/+$/, '') : HOSTS[entry[0]];
  return `${host}/${environment}/${entry[1]}`;
}

/** Códigos de estado que devuelve la DGII al consultar un e-CF. */
export const DGII_STATUS = {
  NOT_FOUND: 0,
  ACCEPTED: 1,
  REJECTED: 2,
  IN_PROCESS: 3,
  CONDITIONAL: 4,
};

/** Rutas estándar que debe exponer un emisor como receptor (solo cambia el host). */
export const RECEIVER_PATHS = {
  reception: '/fe/recepcion/api/ecf',
  commercialApproval: '/fe/aprobacioncomercial/api/ecf',
  seed: '/fe/autenticacion/api/semilla',
  validateCertificate: '/fe/autenticacion/api/validacioncertificado',
};
