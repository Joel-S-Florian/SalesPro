import { describe, it, expect } from 'vitest';
import { allocateFefo, batchStatus, daysLeft, discountPercentFor, parseExpiration } from './batches.logic.js';
import { perishableSchema } from '../config/config.service.js';

const NOW = new Date('2026-10-12T15:00:00Z'); // 11:00 en RD
const exp = day => parseExpiration(day);
const cfg = { redThresholdDays: 7, yellowThresholdDays: 30, autoDiscountEnabled: true, discountRules: [{ daysRemaining: 7, discountPercent: 15 }, { daysRemaining: 3, discountPercent: 30 }] };

describe('fechas de vencimiento', () => {
  it('parseExpiration valida el formato y fija el mediodía UTC', () => {
    expect(parseExpiration('2026-10-20').toISOString()).toBe('2026-10-20T12:00:00.000Z');
    expect(parseExpiration('2026-02-30')).toBeNull();
    expect(parseExpiration('20/10/2026')).toBeNull();
    expect(parseExpiration(undefined)).toBeNull();
  });

  it('daysLeft cuenta días calendario en hora dominicana', () => {
    expect(daysLeft(exp('2026-10-12'), NOW)).toBe(0);
    expect(daysLeft(exp('2026-10-15'), NOW)).toBe(3);
    expect(daysLeft(exp('2026-10-11'), NOW)).toBe(-1);
    expect(daysLeft(null, NOW)).toBeNull();
    // a las 23:30 en RD (03:30 UTC del día siguiente) sigue siendo el mismo día
    expect(daysLeft(exp('2026-10-12'), new Date('2026-10-13T03:30:00Z'))).toBe(0);
  });
});

describe('estado por umbrales', () => {
  it.each([
    ['2026-10-11', 'EXPIRED'],
    ['2026-10-12', 'RED'],
    ['2026-10-19', 'RED'],
    ['2026-10-20', 'YELLOW'],
    ['2026-11-11', 'YELLOW'],
    ['2026-11-12', 'OK'],
  ])('%s -> %s', (day, expected) => expect(batchStatus(exp(day), cfg, NOW)).toBe(expected));

  it('un lote sin fecha no genera alertas', () => expect(batchStatus(null, cfg, NOW)).toBe('NO_EXPIRY'));
});

describe('descuento por vencimiento', () => {
  it('aplica la regla más estricta que cubre los días restantes', () => {
    expect(discountPercentFor(2, cfg)).toBe(30);
    expect(discountPercentFor(3, cfg)).toBe(30);
    expect(discountPercentFor(4, cfg)).toBe(15);
    expect(discountPercentFor(7, cfg)).toBe(15);
    expect(discountPercentFor(8, cfg)).toBe(0);
  });
  it('no descuenta lo vencido, lo sin fecha ni con la función apagada', () => {
    expect(discountPercentFor(-1, cfg)).toBe(0);
    expect(discountPercentFor(null, cfg)).toBe(0);
    expect(discountPercentFor(2, { ...cfg, autoDiscountEnabled: false })).toBe(0);
  });
});

describe('FEFO', () => {
  const batch = (id, day, currentStock, createdAt = '2026-10-01') => ({ id, expirationDate: day ? exp(day) : null, currentStock, createdAt });
  const batches = [batch('tarde', '2026-12-01', 10), batch('sin', null, 5), batch('pronto', '2026-10-20', 4), batch('vencido', '2026-10-01', 3)];

  it('consume primero el que vence antes y deja los sin fecha al final', () => {
    const { allocations, missing } = allocateFefo(batches, 12, { now: NOW });
    expect(allocations.map(a => [a.batchId, a.quantity])).toEqual([['pronto', 4], ['tarde', 8]]);
    expect(missing).toBe(0);
  });

  it('sin permitir vencidos no los usa; permitiéndolos salen primero', () => {
    expect(allocateFefo(batches, 100, { now: NOW }).missing).toBe(100 - 19);
    expect(allocateFefo(batches, 3, { now: NOW, allowExpired: true }).allocations[0].batchId).toBe('vencido');
  });

  it('informa lo que falta cuando no alcanza', () => {
    expect(allocateFefo([batch('a', '2026-11-01', 2)], 5, { now: NOW })).toMatchObject({ missing: 3 });
  });

  it('a igual vencimiento sale primero el más antiguo', () => {
    const { allocations } = allocateFefo([batch('nuevo', '2026-11-01', 5, '2026-10-05'), batch('viejo', '2026-11-01', 5, '2026-10-01')], 3, { now: NOW });
    expect(allocations[0].batchId).toBe('viejo');
  });
});

describe('configuración perishable', () => {
  it('trae valores por defecto y acepta un objeto parcial', () => {
    const parsed = perishableSchema.parse({});
    expect(parsed).toMatchObject({ enabled: false, yellowThresholdDays: 30, redThresholdDays: 7, autoDiscountEnabled: false });
    expect(parsed.discountRules).toHaveLength(2);
  });
  it('rojo debe ser menor que amarillo', () => {
    expect(() => perishableSchema.parse({ yellowThresholdDays: 5, redThresholdDays: 5 })).toThrow();
  });
  it('rechaza reglas con los mismos días o porcentajes fuera de rango', () => {
    expect(() => perishableSchema.parse({ discountRules: [{ daysRemaining: 3, discountPercent: 10 }, { daysRemaining: 3, discountPercent: 20 }] })).toThrow();
    expect(() => perishableSchema.parse({ discountRules: [{ daysRemaining: 3, discountPercent: 120 }] })).toThrow();
  });
});
