import { dgiiServiceUrl } from './ecf.constants.js';

/**
 * Cliente HTTP de los servicios de la DGII. Solo habla con la DGII (o el simulador): no conoce la base de datos.
 * Usa fetch/FormData nativos de Node. Cada llamada recibe el modo (PRECERT | CERT | PROD) que define el ambiente.
 */

const DEFAULT_TIMEOUT_MS = 20000;

export class DgiiHttpError extends Error {
  constructor(message, { status = 0, body = null, network = false } = {}) {
    super(message);
    this.name = 'DgiiHttpError';
    this.status = status;
    this.body = body;
    this.network = network;
  }
}

async function request(url, { method = 'GET', headers = {}, body, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  try {
    response = await fetch(url, { method, headers, body, signal: controller.signal });
  } catch (error) {
    const reason = error.name === 'AbortError' ? 'la DGII no respondió a tiempo' : 'no se pudo establecer la conexión';
    throw new DgiiHttpError(`No se pudo conectar con la DGII: ${reason}`, { network: true });
  } finally {
    clearTimeout(timer);
  }
  const text = await response.text();
  let parsed = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    // la respuesta puede ser XML o texto
  }
  if (!response.ok) {
    const detail = parsed?.mensaje || parsed?.message || parsed?.error || text.slice(0, 200);
    throw new DgiiHttpError(`La DGII respondió ${response.status}${detail ? `: ${detail}` : ''}`, { status: response.status, body: parsed ?? text });
  }
  return { status: response.status, text, json: parsed };
}

/** Cuerpo multipart con el XML en el campo `xml`, como exige la DGII. */
export function xmlForm(xml, fileName = 'documento.xml') {
  const form = new FormData();
  form.append('xml', new Blob([xml], { type: 'text/xml' }), fileName);
  return form;
}

const bearer = token => ({ Authorization: `Bearer ${token}` });

export const dgiiClient = {
  /** GET semilla: devuelve el XML que hay que firmar. */
  async getSeed(mode) {
    const { text } = await request(`${dgiiServiceUrl(mode, 'auth')}/api/autenticacion/semilla`, { headers: { Accept: '*/*' } });
    return text;
  },

  /** POST validarsemilla: entrega la semilla firmada y recibe el token (1 hora). */
  async validateSeed(mode, signedSeedXml) {
    const { json, text } = await request(`${dgiiServiceUrl(mode, 'auth')}/api/autenticacion/validarsemilla`, {
      method: 'POST',
      headers: { Accept: 'application/json' },
      body: xmlForm(signedSeedXml, 'semilla.xml'),
    });
    if (!json?.token) throw new DgiiHttpError('La DGII no devolvió un token', { body: text });
    return json; // { token, expira, expedido }
  },

  /** POST de un XML a cualquier servicio (p. ej. la recepción de otro contribuyente). */
  postXml(url, xml, fileName, headers = {}) {
    return request(url, { method: 'POST', headers: { Accept: '*/*', ...headers }, body: xmlForm(xml, fileName) });
  },

  /** Petición autenticada genérica (para recepción, consultas, directorio...). */
  authed(token, url, options = {}) {
    return request(url, { ...options, headers: { Accept: 'application/json', ...bearer(token), ...(options.headers || {}) } });
  },
};
