/**
 * Contacto por WhatsApp (enlaces wa.me, sin API oficial ni costo). Lo usan el API, el panel y la landing.
 * El número se guarda en formato internacional, solo dígitos (p. ej. 18095550000); el mensaje de bienvenida es editable.
 */

export const DEFAULT_WELCOME_MESSAGE = 'Hola, quiero información sobre FACTOS.';

/**
 * Normaliza un número a dígitos con código de país. Acepta "+1 (809) 555-0000", "809-555-0000" (10 dígitos de RD → antepone 1)
 * o "18095550000". Devuelve '' si no parece un número válido (8 a 15 dígitos, regla E.164).
 */
export function normalizeWhatsappNumber(raw) {
  let digits = String(raw ?? '').replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.length === 10 && /^8[024]9/.test(digits)) digits = `1${digits}`; // 809 / 829 / 849
  return digits.length >= 8 && digits.length <= 15 ? digits : '';
}

/** Enlace wa.me con el mensaje ya codificado; '' si no hay un número válido. */
export function whatsappLink(number, message = DEFAULT_WELCOME_MESSAGE) {
  const n = normalizeWhatsappNumber(number);
  if (!n) return '';
  const text = String(message || '').trim();
  return `https://wa.me/${n}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
}
