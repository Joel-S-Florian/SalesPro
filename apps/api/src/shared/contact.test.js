import { describe, expect, it } from 'vitest';
import { DEFAULT_WELCOME_MESSAGE, normalizeWhatsappNumber, whatsappLink } from '@factos/shared/contact.js';

describe('normalizeWhatsappNumber', () => {
  it('deja solo dígitos con código de país', () => {
    expect(normalizeWhatsappNumber('+1 (809) 555-0000')).toBe('18095550000');
    expect(normalizeWhatsappNumber('18095550000')).toBe('18095550000');
    expect(normalizeWhatsappNumber('0018095550000')).toBe('18095550000');
  });

  it('antepone 1 a un número dominicano de 10 dígitos (809, 829, 849)', () => {
    expect(normalizeWhatsappNumber('809-555-0000')).toBe('18095550000');
    expect(normalizeWhatsappNumber('829 555 0000')).toBe('18295550000');
    expect(normalizeWhatsappNumber('849.555.0000')).toBe('18495550000');
  });

  it('rechaza lo que no parece un número', () => {
    expect(normalizeWhatsappNumber('')).toBe('');
    expect(normalizeWhatsappNumber(undefined)).toBe('');
    expect(normalizeWhatsappNumber('abc')).toBe('');
    expect(normalizeWhatsappNumber('12345')).toBe('');
    expect(normalizeWhatsappNumber('1'.repeat(16))).toBe('');
  });
});

describe('whatsappLink', () => {
  it('arma el enlace wa.me con el mensaje codificado', () => {
    expect(whatsappLink('809-555-0000', 'Hola, ¿qué tal?')).toBe(`https://wa.me/18095550000?text=${encodeURIComponent('Hola, ¿qué tal?')}`);
  });

  it('usa el mensaje de bienvenida por defecto y omite el texto si se deja vacío', () => {
    expect(whatsappLink('18095550000')).toBe(`https://wa.me/18095550000?text=${encodeURIComponent(DEFAULT_WELCOME_MESSAGE)}`);
    expect(whatsappLink('18095550000', '  ')).toBe('https://wa.me/18095550000');
  });

  it('sin número válido no hay enlace', () => {
    expect(whatsappLink('')).toBe('');
    expect(whatsappLink('xx')).toBe('');
  });
});
