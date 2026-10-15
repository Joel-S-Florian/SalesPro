import { randomInt } from 'node:crypto';
import { passwordProblem } from '@factos/shared/passwordPolicy.js';

/** Horas que dura una clave temporal antes de caducar. */
export const TEMP_PASSWORD_HOURS = 48;

/**
 * Clave temporal aleatoria y legible (sin caracteres que se confunden), 14 caracteres: tres grupos de cuatro, p. ej. «Hk7m-Qw3p-Zr9t».
 * Se muestra UNA sola vez a quien la entrega; el servidor solo guarda su hash.
 */
export function generateTemporaryPassword(context = {}) {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz';
  const digits = '23456789';
  const all = letters + digits;
  for (;;) {
    const text = Array.from({ length: 12 }, () => all[randomInt(all.length)]).join('');
    if (!/\d/.test(text) || !/[a-z]/.test(text) || !/[A-Z]/.test(text)) continue;
    const password = `${text.slice(0, 4)}-${text.slice(4, 8)}-${text.slice(8)}`;
    // Debe cumplir la misma política que cualquier contraseña (por azar casi nunca falla)
    if (!passwordProblem(password, { role: 'ADMINISTRADOR', ...context })) return password;
  }
}
