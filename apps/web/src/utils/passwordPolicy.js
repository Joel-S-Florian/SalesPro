/**
 * La política de contraseñas vive en `packages/shared/passwordPolicy.js` (misma copia para el API y el navegador).
 * Aquí solo se reexporta y se agrega el generador de claves aleatorias para quien quiera una sugerida.
 */
export { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH_PRIVILEGED, minLengthFor, passwordProblem, passwordStrength } from '@factos/shared/passwordPolicy.js';

/** Clave aleatoria legible (sin caracteres que se confunden): tres grupos de cuatro, p. ej. «Hk7m-Qw3p-Zr9t» (14 caracteres). */
export function generatePassword() {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz';
  const digits = '23456789';
  const pick = set => set[crypto.getRandomValues(new Uint32Array(1))[0] % set.length];
  for (;;) {
    const chars = Array.from({ length: 12 }, () => pick(letters + digits));
    const text = chars.join('');
    if (/\d/.test(text) && /[a-z]/.test(text) && /[A-Z]/.test(text)) return `${text.slice(0, 4)}-${text.slice(4, 8)}-${text.slice(8)}`;
  }
}
