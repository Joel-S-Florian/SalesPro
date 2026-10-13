/** Solo dígitos del teléfono. Los números dominicanos de 10 dígitos (809/829/849) llevan el prefijo del país (1). */
export function phoneDigits(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.length === 10) return `1${digits}`;
  return digits.length >= 11 ? digits : '';
}

/** Enlace para llamar (`tel:`); null si no hay un número válido. */
export const telUrl = phone => (phoneDigits(phone) ? `tel:+${phoneDigits(phone)}` : null);

/** Enlace de WhatsApp (`wa.me`) con un mensaje opcional; null si no hay un número válido. */
export function whatsappUrl(phone, message = '') {
  const digits = phoneDigits(phone);
  if (!digits) return null;
  return `https://wa.me/${digits}${message ? `?text=${encodeURIComponent(message)}` : ''}`;
}
