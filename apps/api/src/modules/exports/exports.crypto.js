import crypto from 'node:crypto';
import fs from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { deriveKey } from '../../shared/utils/secretBox.js';

/**
 * Cifrado en reposo de los respaldos automáticos (AES-256-GCM en streaming, sin cargar el archivo en memoria).
 * Formato del archivo: "FXB1" (4) + iv (12) + datos cifrados + etiqueta de autenticación (16).
 * La llave se deriva de ECF_MASTER_KEY con un propósito propio, así que no es la misma que cifra los certificados.
 */
const MAGIC = Buffer.from('FXB1');
const IV_LEN = 12;
const TAG_LEN = 16;
export const ENCRYPTION_OVERHEAD = MAGIC.length + IV_LEN + TAG_LEN;

const backupKey = () => deriveKey('factos-backup-v1');

/** Cifra el archivo en su sitio (escribe `.enc` y reemplaza el original). Devuelve el tamaño nuevo. */
export async function encryptFileInPlace(filePath) {
  const key = backupKey(); // si falta la llave falla aquí, antes de tocar nada
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const tmp = `${filePath}.enc`;
  const out = fs.createWriteStream(tmp);
  out.write(Buffer.concat([MAGIC, iv]));
  try {
    await pipeline(fs.createReadStream(filePath), cipher, out, { end: false });
    await new Promise((resolve, reject) => out.end(cipher.getAuthTag(), err => (err ? reject(err) : resolve())));
    fs.renameSync(tmp, filePath);
  } catch (err) {
    out.destroy();
    fs.rmSync(tmp, { force: true });
    throw err;
  }
  return fs.statSync(filePath).size;
}

/** Flujo con el contenido descifrado (el ZIP original). Si el archivo fue alterado, el flujo termina con error. */
export function createDecryptStream(filePath) {
  const size = fs.statSync(filePath).size;
  if (size < ENCRYPTION_OVERHEAD) throw new Error('Archivo cifrado no válido');
  const fd = fs.openSync(filePath, 'r');
  const head = Buffer.alloc(MAGIC.length + IV_LEN);
  const tag = Buffer.alloc(TAG_LEN);
  try {
    fs.readSync(fd, head, 0, head.length, 0);
    fs.readSync(fd, tag, 0, TAG_LEN, size - TAG_LEN);
  } finally {
    fs.closeSync(fd);
  }
  if (!head.subarray(0, MAGIC.length).equals(MAGIC)) throw new Error('Archivo cifrado no válido');
  const decipher = crypto.createDecipheriv('aes-256-gcm', backupKey(), head.subarray(MAGIC.length));
  decipher.setAuthTag(tag);
  const source = fs.createReadStream(filePath, { start: head.length, end: size - TAG_LEN - 1 });
  source.on('error', err => decipher.destroy(err));
  return source.pipe(decipher);
}

/** Tamaño del ZIP descifrado a partir del archivo cifrado. */
export const plainSizeOf = encryptedSize => Math.max(0, encryptedSize - ENCRYPTION_OVERHEAD);
