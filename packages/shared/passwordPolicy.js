import { COMMON_PASSWORDS } from './commonPasswords.js';

/**
 * Política de contraseñas de FACTOS: UNA sola copia para el API y el navegador.
 *
 *  - La longitud pesa más que la complejidad: no se exigen letras y números.
 *  - Mínimo 10 caracteres (12 para ADMINISTRADOR y SUPERADMIN), máximo 128.
 *  - Se rechazan las contraseñas comunes (lista local, también con números o símbolos añadidos y con sustituciones tipo «p4ssw0rd»),
 *    las secuencias, las repetitivas y las que contienen el usuario, el correo, el nombre de la empresa o «factos».
 *  - El servidor es quien manda; el navegador solo avisa mientras se escribe.
 */
export const MIN_PASSWORD_LENGTH = 10;
export const MIN_PASSWORD_LENGTH_PRIVILEGED = 12;
export const MAX_PASSWORD_LENGTH = 128;
export const PRIVILEGED_ROLES = ['ADMINISTRADOR', 'SUPERADMIN'];

export const minLengthFor = role => (PRIVILEGED_ROLES.includes(role) ? MIN_PASSWORD_LENGTH_PRIVILEGED : MIN_PASSWORD_LENGTH);

const SEQUENCES = ['01234567890123456789', '98765432109876543210', 'abcdefghijklmnopqrstuvwxyz', 'zyxwvutsrqponmlkjihgfedcba', 'qwertyuiopasdfghjklzxcvbnm', 'qazwsxedcrfvtgbyhnujmikolp'];
const LEET = { '@': 'a', 4: 'a', 3: 'e', 1: 'i', 0: 'o', $: 's', 5: 's', 7: 't', '!': 'i' };

const plain = value => String(value || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const alnum = value => plain(value).replace(/[^a-z0-9]/g, '');
const unleet = value => plain(value).replace(/[@$!0-9]/g, char => LEET[char] ?? char).replace(/[^a-z]/g, '');
const stripDigits = value => value.replace(/^\d+|\d+$/g, '');

/** Todo el texto es el mismo carácter repetido (aaaaaa, 111111). */
const isRepetitive = text => text.length > 0 && text.split(text[0]).join('') === '';

/**
 * ¿Es una contraseña común disfrazada? Se prueba la contraseña quitando números, años y símbolos del principio y del final
 * y, en cada caso, tal cual, solo con letras y deshaciendo sustituciones como «p4ssw0rd».
 */
function looksCommon(value) {
  const base = plain(value);
  // Solo se recortan caracteres que NO son letras en los bordes (números, años, símbolos): nunca se parte una frase de palabras
  const trailing = base.length - base.replace(/[^a-z]+$/, '').length;
  const leading = base.length - base.replace(/^[^a-z]+/, '').length;
  for (let tail = 0; tail <= Math.min(trailing, 12); tail++) {
    for (let head = 0; head <= Math.min(leading, 8); head++) {
      const part = base.slice(head, base.length - tail);
      if (part.length < 4) continue;
      for (const candidate of [alnum(part), part.replace(/[^a-z]/g, ''), unleet(part)]) {
        if (candidate.length >= 4 && COMMON_PASSWORDS.has(candidate)) return true;
      }
    }
  }
  return false;
}

/** Partes del contexto (usuario, correo, empresa, «factos») que la contraseña no debe contener. */
function contextParts({ username, email, companyName } = {}) {
  const parts = new Set(['factos']);
  const add = value => {
    const flat = alnum(value);
    if (flat.length >= 4) parts.add(flat);
  };
  add(username);
  add(String(email || '').split('@')[0]);
  add(companyName);
  for (const word of plain(companyName).split(/[^a-z0-9]+/)) if (word.length >= 4) parts.add(word);
  return [...parts];
}

/**
 * Motivo por el que la contraseña no sirve, o null si es aceptable.
 * @param {string} password
 * @param {{ role?: string, username?: string, email?: string, companyName?: string }} [context]
 */
export function passwordProblem(password, context = {}) {
  const value = String(password ?? '');
  const min = minLengthFor(context.role);
  if (value.length < min) return `Debe tener al menos ${min} caracteres`;
  if (value.length > MAX_PASSWORD_LENGTH) return `No puede pasar de ${MAX_PASSWORD_LENGTH} caracteres`;

  const flat = alnum(value);
  const letters = unleet(value);
  if (isRepetitive(flat) || (stripDigits(flat).length >= 6 && isRepetitive(stripDigits(flat)))) return 'Es demasiado repetitiva';

  for (const part of contextParts(context)) {
    if (flat.includes(part) || letters.includes(part)) return part === 'factos' ? 'No puede contener «factos»' : 'No puede contener tu usuario, tu correo ni el nombre de tu empresa';
  }
  if (looksCommon(value)) return 'Es una contraseña demasiado común';
  const core = stripDigits(flat);
  if (SEQUENCES.some(seq => seq.includes(flat) || (core.length >= 6 && seq.includes(core)))) return 'Es una secuencia fácil de adivinar';

  return null;
}

/** Fuerza de 0 a 4 para el medidor (orientativa: la regla real es `passwordProblem`). */
export function passwordStrength(password, context) {
  const value = String(password || '');
  if (!value) return 0;
  if (passwordProblem(value, context)) return value.length >= 6 ? 1 : 0;
  let score = 2;
  if (value.length >= 16) score += 1;
  if (/[A-Z]/.test(value) && /[a-z]/.test(value) && /[^A-Za-z0-9]/.test(value)) score += 1;
  return Math.min(4, score);
}
