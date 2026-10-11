import { basePrisma } from '../../config/db.js';
import { decryptSecret, decryptSecretToString } from '../../shared/utils/secretBox.js';
import { logger } from '../../shared/utils/logger.js';
import { TOKEN_REFRESH_MARGIN_MS } from './ecf.constants.js';
import { parsePkcs12 } from './ecf.certificate.js';
import { DgiiHttpError, dgiiClient } from './ecf.dgii.client.js';
import { signXml } from './ecf.signer.js';

/**
 * Token de la DGII por empresa.
 *
 * Flujo: GET semilla -> firmarla con el certificado de la empresa -> POST validarsemilla -> token JWT de 1 hora.
 * El token es una credencial de la EMPRESA (no del usuario): vive en el servidor, se comparte entre todos sus
 * usuarios y cajas, y nunca viaja al navegador. Se renueva solo antes de vencer y, si la DGII responde 401 a mitad
 * de una operación, se pide otro y se reintenta una vez.
 */

/**
 * @param {Object} deps
 * @param {(companyId: string) => Promise<{ mode: string, privateKeyPem: string, certPem: string }>} deps.loadCredentials
 * @param {typeof dgiiClient} [deps.client]
 * @param {() => number} [deps.now]
 * @param {number} [deps.refreshMarginMs]
 */
export function createTokenManager({ loadCredentials, client = dgiiClient, now = Date.now, refreshMarginMs = TOKEN_REFRESH_MARGIN_MS }) {
  const cache = new Map(); // companyId -> { token, mode, expiresAt, issuedAt }
  const inflight = new Map(); // companyId -> Promise<string>

  async function requestNewToken(companyId, creds) {
    const seed = await client.getSeed(creds.mode);
    const signedSeed = signXml(seed, creds);
    const result = await client.validateSeed(creds.mode, signedSeed);
    const expiresAt = Date.parse(result.expira);
    const entry = {
      token: result.token,
      mode: creds.mode,
      issuedAt: now(),
      // Si la DGII no manda una fecha legible, se asume la duración documentada (1 hora) con un poco de holgura
      expiresAt: Number.isFinite(expiresAt) ? expiresAt : now() + 55 * 60 * 1000,
    };
    cache.set(companyId, entry);
    return entry;
  }

  /** Token vigente de la empresa (usa el guardado mientras falte más que el margen para vencer). */
  async function getToken(companyId, { force = false } = {}) {
    const creds = await loadCredentials(companyId);
    const cached = cache.get(companyId);
    if (!force && cached && cached.mode === creds.mode && cached.expiresAt - now() > refreshMarginMs) return cached.token;

    // Una sola petición a la vez por empresa: las demás esperan el mismo resultado
    if (!inflight.has(companyId)) {
      inflight.set(
        companyId,
        requestNewToken(companyId, creds)
          .then(entry => entry.token)
          .finally(() => inflight.delete(companyId))
      );
    }
    return inflight.get(companyId);
  }

  /** Ejecuta `fn(token)`; si la DGII contesta 401, renueva el token y reintenta una vez. */
  async function withToken(companyId, fn) {
    const token = await getToken(companyId);
    try {
      return await fn(token);
    } catch (error) {
      if (error instanceof DgiiHttpError && error.status === 401) {
        logger.warn('Token de la DGII rechazado (401); se renueva y se reintenta', { companyId });
        return fn(await getToken(companyId, { force: true }));
      }
      throw error;
    }
  }

  const invalidate = companyId => cache.delete(companyId);

  /** Estado del token en memoria (no pide uno nuevo). */
  function status(companyId) {
    const cached = cache.get(companyId);
    if (!cached) return { connected: false };
    return { connected: cached.expiresAt > now(), mode: cached.mode, issuedAt: new Date(cached.issuedAt), expiresAt: new Date(cached.expiresAt) };
  }

  return { getToken, withToken, invalidate, status };
}

/* ---------------------------------------------------------------------------------------------- */
/* Credenciales desde la base de datos                                                              */
/* ---------------------------------------------------------------------------------------------- */

const CREDENTIALS_TTL_MS = 10 * 60 * 1000;
const credentialsCache = new Map(); // companyId -> { updatedAt, loadedAt, creds }

/** Invalida las credenciales abiertas en memoria (al cambiar certificado o modo). */
export function forgetCredentials(companyId) {
  credentialsCache.delete(companyId);
}

/** Abre el certificado de la empresa (descifrado + .p12) y devuelve lo necesario para firmar. */
export async function loadCredentialsFromDb(companyId) {
  const config = await basePrisma.ecfConfig.findUnique({ where: { companyId } });
  if (!config || config.mode === 'OFF') throw new Error('La facturación electrónica no está activada para esta empresa');
  if (!config.certificateEnc || !config.certificatePassEnc) throw new Error('Falta cargar el certificado digital de la empresa');

  const cached = credentialsCache.get(companyId);
  if (cached && cached.updatedAt === config.updatedAt.getTime() && Date.now() - cached.loadedAt < CREDENTIALS_TTL_MS) {
    return { ...cached.creds, mode: config.mode };
  }

  const { privateKeyPem, certPem } = parsePkcs12(decryptSecret(config.certificateEnc), decryptSecretToString(config.certificatePassEnc));
  const creds = { privateKeyPem, certPem };
  credentialsCache.set(companyId, { updatedAt: config.updatedAt.getTime(), loadedAt: Date.now(), creds });
  return { ...creds, mode: config.mode };
}

/** Gestor de token de la aplicación (credenciales desde la base de datos). */
export const tokenManager = createTokenManager({ loadCredentials: loadCredentialsFromDb });

/**
 * Pide el token en segundo plano para que la primera venta no espere (p. ej. al iniciar sesión).
 * Nunca lanza: si falla, se reintentará cuando haga falta.
 */
export function prewarmToken(companyId) {
  if (!companyId) return;
  tokenManager.getToken(companyId).catch(error => logger.debug('Precalentamiento del token e-CF omitido', { companyId, reason: error.message }));
}
