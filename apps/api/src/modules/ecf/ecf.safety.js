/**
 * Defensa contra SSRF: las direcciones de otros contribuyentes (de la DGII o de un tercero) no son de confianza.
 * En producción solo se aceptan HTTPS hacia hosts públicos; con el simulador (ECF_BASE_URL_OVERRIDE) se permite todo.
 * No resuelve DNS: para una protección completa, saque estas peticiones por un proxy de salida.
 */
const PRIVATE_HOST = /^(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.0\.0\.0|172\.(1[6-9]|2\d|3[01])\.|\[?::1\]?$|\[?f[cd][0-9a-f]{2}:)/i;

export function assertSafeTarget(url) {
  if (process.env.ECF_BASE_URL_OVERRIDE) return url; // desarrollo con simulador
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('La dirección del comprador no es válida');
  }
  if (parsed.protocol !== 'https:') throw new Error('La dirección del comprador debe usar HTTPS');
  if (PRIVATE_HOST.test(parsed.hostname)) throw new Error('La dirección del comprador apunta a una red privada');
  return url;
}
