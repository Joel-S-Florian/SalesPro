import crypto from 'node:crypto';

/**
 * Cifrado de secretos en reposo (certificados digitales y sus contraseñas) con AES-256-GCM.
 *
 * - La llave maestra viene de `ECF_MASTER_KEY` (32 bytes en base64). Genere una con `generateMasterKey()`
 *   o `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`.
 * - El texto cifrado lleva la versión de la llave (`v1.iv.tag.datos`) para poder rotarla más adelante.
 * - Se lee `process.env` en cada llamada (no al importar) para que sea fácil de probar.
 */
const CURRENT_VERSION = 1;

function masterKey(override) {
  const raw = override ?? process.env.ECF_MASTER_KEY;
  if (!raw) {
    throw new Error('Falta ECF_MASTER_KEY: es necesaria para guardar certificados digitales de forma segura');
  }
  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32) throw new Error('ECF_MASTER_KEY debe ser de 32 bytes en base64');
  return key;
}

export function generateMasterKey() {
  return crypto.randomBytes(32).toString('base64');
}

export function isSecretBoxConfigured() {
  try {
    masterKey();
    return true;
  } catch {
    return false;
  }
}

/** Cifra un texto o Buffer. Devuelve `v1.<iv>.<tag>.<datos>` en base64. */
export function encryptSecret(plain, keyOverride) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', masterKey(keyOverride), iv);
  const data = Buffer.concat([cipher.update(Buffer.isBuffer(plain) ? plain : Buffer.from(String(plain), 'utf8')), cipher.final()]);
  return [`v${CURRENT_VERSION}`, iv.toString('base64'), cipher.getAuthTag().toString('base64'), data.toString('base64')].join('.');
}

/** Descifra lo producido por `encryptSecret`. Devuelve un Buffer. Falla si la llave no es la correcta o el dato fue alterado. */
export function decryptSecret(token, keyOverride) {
  const [version, iv, tag, data] = String(token || '').split('.');
  if (version !== `v${CURRENT_VERSION}` || !iv || !tag || !data) throw new Error('Secreto cifrado con formato desconocido');
  const decipher = crypto.createDecipheriv('aes-256-gcm', masterKey(keyOverride), Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  try {
    return Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]);
  } catch {
    throw new Error('No se pudo descifrar el secreto (llave incorrecta o dato alterado)');
  }
}

export const decryptSecretToString = (token, keyOverride) => decryptSecret(token, keyOverride).toString('utf8');
