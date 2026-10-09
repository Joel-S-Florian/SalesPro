import { describe, it, expect } from 'vitest';
import { cleanText, parseNumber, sanitizeRow } from './sanitize.js';

describe('cleanText', () => {
  it('colapsa espacios y quita caracteres invisibles', () => {
    expect(cleanText('  Arroz ​  Selecto\t\n 5lb ')).toBe('Arroz Selecto 5lb');
  });
  it('maneja null/undefined', () => {
    expect(cleanText(null)).toBe('');
    expect(cleanText(undefined)).toBe('');
  });
});

describe('parseNumber', () => {
  it.each([
    ['$1,234.50', 1234.5],
    ['1.234,50', 1234.5],
    ['RD$ 12', 12],
    ['12,5', 12.5],
    ['1,234', 1234],
    ['1.234.567', 1234567],
    [42, 42],
    ['-3', -3],
  ])('%s -> %s', (input, expected) => {
    expect(parseNumber(input)).toBe(expected);
  });

  it.each([['abc'], [''], [null], [undefined], ['--']])('%s -> null', input => {
    expect(parseNumber(input)).toBeNull();
  });
});

describe('sanitizeRow', () => {
  it('normaliza y calcula precio con margen', () => {
    const { data, errors } = sanitizeRow(
      { code: ' ab-123 ', name: '  Aceite   1L ', cost: '$100.00', stock: '12.0' },
      { marginPercent: 30 }
    );
    expect(errors).toEqual([]);
    expect(data).toMatchObject({ code: 'AB-123', name: 'Aceite 1L', cost: 100, stock: 12, price: 130 });
  });

  it('respeta el precio del archivo', () => {
    const { data } = sanitizeRow({ code: 'X1', name: 'A', cost: 10, price: '15' }, { marginPercent: 50 });
    expect(data.price).toBe(15);
  });

  it('reporta errores', () => {
    const { errors } = sanitizeRow({ code: '', name: '', cost: 'n/a', stock: '-2' });
    expect(errors).toEqual(
      expect.arrayContaining([
        'Código de barras/SKU vacío',
        'Descripción vacía',
        'Costo unitario inválido',
        'Existencia inválida',
      ])
    );
  });
});
