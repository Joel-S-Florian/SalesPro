import { z } from 'zod';
import { AppError } from '../exceptions/AppError.js';

/**
 * Política de contraseñas: la longitud pesa más que la complejidad.
 * Mantenga `MIN_PASSWORD_LENGTH` y `COMMON_PASSWORDS` iguales en `apps/web/src/utils/passwordPolicy.js`.
 */
export const MIN_PASSWORD_LENGTH = 10;
export const MAX_PASSWORD_LENGTH = 100;

// Las más usadas (en español y en inglés). Se comparan sin mayúsculas ni separadores, y sin números al final.
export const COMMON_PASSWORDS = new Set([
  'password', 'contrasena', 'contrasenia', 'clave', 'admin', 'administrador', 'administrator', 'qwerty', 'qwertyuiop', 'asdfghjkl', 'zxcvbnm',
  'abcdefgh', 'abcdefghij', 'letmein', 'welcome', 'bienvenido', 'iloveyou', 'monkey', 'dragon', 'football', 'baseball', 'superman', 'batman',
  'sistema', 'factos', 'ventas', 'vendedor', 'cajero', 'colmado', 'dominicana', 'santiago', 'santodomingo', 'republica', 'princesa', 'princess',
  'master', 'login', 'passw0rd', 'changeme', 'cambiame', 'temporal', 'usuario', 'prueba', 'test', 'testing', 'secreto', 'secret',
]);

const SEQUENCES = ['0123456789', '1234567890', '9876543210', 'abcdefghijklmnopqrstuvwxyz', 'qwertyuiopasdfghjklzxcvbnm'];

const normalize = value => String(value || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');

/** Motivo por el que la contraseña no sirve, o null si es aceptable. `context` = { username, email } de la persona. */
export function passwordProblem(password, context = {}) {
  const value = String(password ?? '');
  if (value.length < MIN_PASSWORD_LENGTH) return `La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres`;
  if (value.length > MAX_PASSWORD_LENGTH) return `La contraseña no puede pasar de ${MAX_PASSWORD_LENGTH} caracteres`;
  if (!/[A-Za-z]/.test(value) || !/\d/.test(value)) return 'La contraseña debe incluir al menos una letra y un número';
  const flat = normalize(value);
  const letters = flat.replace(/\d+$/, '');
  if (/^(.)\1+$/.test(flat) || /^(.)\1{5,}$/.test(letters)) return 'La contraseña es demasiado repetitiva';
  if (COMMON_PASSWORDS.has(flat) || COMMON_PASSWORDS.has(letters)) return 'Esa contraseña es demasiado común. Elige otra';
  if (SEQUENCES.some(seq => seq.includes(flat) || (letters.length >= 6 && seq.includes(letters)))) return 'La contraseña es una secuencia fácil de adivinar';
  for (const personal of [context.username, String(context.email || '').split('@')[0]]) {
    const part = normalize(personal);
    if (part.length >= 4 && flat.includes(part)) return 'La contraseña no puede contener tu usuario ni tu correo';
  }
  return null;
}

/** Lanza un error 400 si la contraseña no cumple la política. */
export function assertPasswordAllowed(password, context) {
  const problem = passwordProblem(password, context);
  if (problem) throw AppError.badRequest(problem);
}

/** Campo zod con la política (longitud, letra y número, no común); lo personal se revisa en el servicio. */
export const passwordSchema = z
  .string()
  .max(MAX_PASSWORD_LENGTH, `La contraseña no puede pasar de ${MAX_PASSWORD_LENGTH} caracteres`)
  .superRefine((value, ctx) => {
    const problem = passwordProblem(value);
    if (problem) ctx.addIssue({ code: 'custom', message: problem });
  });
