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

describe('alimentos: unidad, perecedero, lote y presentaciones', () => {
  const base = { code: 'x1', name: 'Leche', cost: '60', price: '80' };

  it('reconoce alias de unidad y admite decimales a granel', () => {
    const { data, errors } = sanitizeRow({ ...base, unit: 'libras', stock: '6,5' });
    expect(errors).toEqual([]);
    expect(data.unit).toBe('LB');
    expect(data.stock).toBe(6.5);
  });

  it('en unidades enteras redondea la existencia', () => {
    expect(sanitizeRow({ ...base, stock: '6.6' }).data.stock).toBe(7);
  });

  it('unidad desconocida es error', () => {
    expect(sanitizeRow({ ...base, unit: 'caja' }).errors.join()).toMatch(/Unidad desconocida/);
  });

  it('perecedero con existencia exige lote y vencimiento', () => {
    expect(sanitizeRow({ ...base, stock: '5', perishable: 'SI' }).errors.join()).toMatch(/lote o el vencimiento/);
    const ok = sanitizeRow({ ...base, stock: '5', perishable: 'sí', lot: 'L1', expiration: '20/10/2030' });
    expect(ok.errors).toEqual([]);
    expect(ok.data.isPerishable).toBe(true);
    expect(ok.data.expiration).toBe('2030-10-20');
  });

  it('perecedero sin existencia no exige lote', () => {
    expect(sanitizeRow({ ...base, stock: '0', perishable: 'SI' }).errors).toEqual([]);
  });

  it('rechaza fechas imposibles y el lote reservado', () => {
    expect(sanitizeRow({ ...base, expiration: '2030-02-31' }).errors.join()).toMatch(/vencimiento inválida/);
    expect(sanitizeRow({ ...base, lot: 'sin-lote' }).errors.join()).toMatch(/reservado/);
  });

  it('lee presentaciones completas y valida las incompletas', () => {
    const ok = sanitizeRow({ ...base, pres1Name: 'Caja x12', pres1Qty: '12', pres1Price: '900', pres1Barcode: '7461' });
    expect(ok.errors).toEqual([]);
    expect(ok.data.presentations).toEqual([{ name: 'Caja x12', factor: 12, salePrice: 900, barcode: '7461' }]);
    expect(sanitizeRow({ ...base, pres1Name: 'Caja', pres1Qty: '0', pres1Price: '5' }).errors.join()).toMatch(/Presentación 1/);
    expect(sanitizeRow({ ...base, pres1Qty: '12' }).errors.join()).toMatch(/falta el nombre/);
  });

  it('«perecedero» solo acepta SI o NO', () => {
    expect(sanitizeRow({ ...base, perishable: 'quizás' }).errors.join()).toMatch(/SI o NO/);
    expect(sanitizeRow({ ...base, perishable: 'no' }).data.isPerishable).toBe(false);
  });
});
