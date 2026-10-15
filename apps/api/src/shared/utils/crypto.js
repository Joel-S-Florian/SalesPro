import bcryptjs from 'bcryptjs';
import { env } from '../../config/env.js';

// bcrypt NATIVO (corre en hilos aparte: no frena al servidor mientras se calcula) y, si no se pudo instalar en esta máquina,
// bcryptjs (JavaScript puro, bloquea el servidor ~100-400 ms por inicio de sesión). Los hashes de ambos son compatibles.
let bcrypt = bcryptjs;
try {
  bcrypt = (await import('bcrypt')).default;
} catch {
  // sin módulo nativo: se usa bcryptjs
}
export const bcryptEngine = bcrypt === bcryptjs ? 'bcryptjs' : 'bcrypt (nativo)';

/**
 * Hash a password using bcrypt
 * @param {string} password - Plain text password
 * @returns {Promise<string>} Hashed password
 */
export async function hashPassword(password) {
  return bcrypt.hash(password, env.BCRYPT_ROUNDS);
}

/**
 * Compare a plain text password with a hashed password
 * @param {string} password - Plain text password
 * @param {string} hash - Hashed password
 * @returns {Promise<boolean>} True if passwords match
 */
export async function comparePassword(password, hash) {
  return bcrypt.compare(password, hash);
}

/** Costo (rondas) con el que se generó un hash bcrypt. */
export const hashRounds = hash => bcryptjs.getRounds(hash);

// Hash con el costo actual para gastar el mismo tiempo cuando el usuario no existe (evita adivinar usuarios por la demora)
let dummyHash;
export async function comparePasswordDummy(password) {
  dummyHash ??= await bcrypt.hash('factos-dummy-password', env.BCRYPT_ROUNDS);
  await bcrypt.compare(password, dummyHash);
}

/**
 * Generate a random string for tokens, etc.
 * @param {number} length - Length of random string
 * @returns {string} Random string
 */
export function generateRandomString(length = 32) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  const randomValues = new Uint32Array(length);
  crypto.getRandomValues(randomValues);
  for (let i = 0; i < length; i++) {
    result += chars[randomValues[i] % chars.length];
  }
  return result;
}