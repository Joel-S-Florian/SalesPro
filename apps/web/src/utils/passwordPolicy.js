/**
 * Política de contraseñas (copia de apps/api/src/shared/utils/passwordPolicy.js: mantenga ambas iguales).
 * El servidor es quien manda; aquí solo se avisa mientras se escribe.
 */
export const MIN_PASSWORD_LENGTH = 10;
export const MAX_PASSWORD_LENGTH = 100;

const COMMON_PASSWORDS = new Set([
  'password', 'contrasena', 'contrasenia', 'clave', 'admin', 'administrador', 'administrator', 'qwerty', 'qwertyuiop', 'asdfghjkl', 'zxcvbnm',
  'abcdefgh', 'abcdefghij', 'letmein', 'welcome', 'bienvenido', 'iloveyou', 'monkey', 'dragon', 'football', 'baseball', 'superman', 'batman',
  'sistema', 'factos', 'ventas', 'vendedor', 'cajero', 'colmado', 'dominicana', 'santiago', 'santodomingo', 'republica', 'princesa', 'princess',
  'master', 'login', 'passw0rd', 'changeme', 'cambiame', 'temporal', 'usuario', 'prueba', 'test', 'testing', 'secreto', 'secret',
]);
const SEQUENCES = ['0123456789', '1234567890', '9876543210', 'abcdefghijklmnopqrstuvwxyz', 'qwertyuiopasdfghjklzxcvbnm'];

const normalize = value => String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');

/** Motivo por el que la contraseña no sirve, o null si es aceptable. `context` = { username, email }. */
export function passwordProblem(password, context = {}) {
  const value = String(password ?? '');
  if (value.length < MIN_PASSWORD_LENGTH) return `Al menos ${MIN_PASSWORD_LENGTH} caracteres`;
  if (value.length > MAX_PASSWORD_LENGTH) return `No puede pasar de ${MAX_PASSWORD_LENGTH} caracteres`;
  if (!/[A-Za-z]/.test(value) || !/\d/.test(value)) return 'Incluye al menos una letra y un número';
  const flat = normalize(value);
  const letters = flat.replace(/\d+$/, '');
  if (/^(.)\1+$/.test(flat) || /^(.)\1{5,}$/.test(letters)) return 'Es demasiado repetitiva';
  if (COMMON_PASSWORDS.has(flat) || COMMON_PASSWORDS.has(letters)) return 'Es demasiado común';
  if (SEQUENCES.some(seq => seq.includes(flat) || (letters.length >= 6 && seq.includes(letters)))) return 'Es una secuencia fácil de adivinar';
  for (const personal of [context.username, String(context.email || '').split('@')[0]]) {
    const part = normalize(personal);
    if (part.length >= 4 && flat.includes(part)) return 'No puede contener tu usuario ni tu correo';
  }
  return null;
}

/** Fuerza de 0 a 4 para el medidor (solo orientativa: la regla real es `passwordProblem`). */
export function passwordStrength(password, context) {
  const value = String(password || '');
  if (!value) return 0;
  if (passwordProblem(value, context)) return value.length >= 6 ? 1 : 0;
  let score = 2;
  if (value.length >= 14) score += 1;
  if (/[A-Z]/.test(value) && /[a-z]/.test(value) && /[^A-Za-z0-9]/.test(value)) score += 1;
  return Math.min(4, score);
}

/** Clave aleatoria legible (sin caracteres que se confunden): tres grupos de cuatro, p. ej. «Hk7m-Qw3p-Zr9t». */
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
