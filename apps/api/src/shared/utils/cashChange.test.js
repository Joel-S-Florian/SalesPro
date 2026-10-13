import { describe, it, expect } from 'vitest';
import { addBreakdowns, changeDue, countPieces, greedyBreakdown, makeChange, normalizeBreakdown, sumBreakdown } from './cashChange.js';

const full = { 2000: 5, 1000: 10, 500: 10, 200: 10, 100: 20, 50: 20, 25: 20, 10: 30, 5: 30, 1: 50 };

describe('makeChange (devuelta eficiente)', () => {
  it('monto cero no devuelve nada', () => {
    expect(makeChange(0, full)).toMatchObject({ exact: true, pieces: {}, pieceCount: 0 });
  });

  it('sin conocer la caja usa pocas piezas (como el método simple)', () => {
    const result = makeChange(1850, null);
    expect(result.exact).toBe(true);
    expect(sumBreakdown(result.pieces)).toBe(1850);
    expect(result.pieceCount).toBeLessThanOrEqual(countPieces(greedyBreakdown(1850)));
  });

  it('con caja abundante da el monto exacto con pocas piezas', () => {
    const result = makeChange(76, full);
    expect(result.exact).toBe(true);
    expect(sumBreakdown(result.pieces)).toBe(76);
    expect(result.pieceCount).toBeLessThanOrEqual(4); // 50 + 25 + 1
  });

  it('nunca usa más piezas de las que hay', () => {
    const drawer = { 50: 1, 25: 1, 10: 2, 5: 1, 1: 3 };
    const result = makeChange(61, drawer);
    expect(result.exact).toBe(true);
    for (const [denom, count] of Object.entries(result.pieces)) expect(count).toBeLessThanOrEqual(drawer[denom] || 0);
    expect(sumBreakdown(result.pieces)).toBe(61);
  });

  it('devuelve de lo que más hay cuando lo escaso se acabaría', () => {
    // Para 100: dos de 50 agotarían los billetes de 50; hay muchas monedas de 25
    const drawer = { 100: 0, 50: 2, 25: 40, 10: 0, 5: 0, 1: 0 };
    const withScarce = makeChange(100, { ...drawer, 50: 2 });
    const plenty = makeChange(100, { ...drawer, 50: 60 });
    expect(sumBreakdown(withScarce.pieces)).toBe(100);
    expect(plenty.pieces[50]).toBe(2); // si sobran de 50, usa 2 piezas
    expect((withScarce.pieces[50] || 0)).toBeLessThanOrEqual(2);
  });

  it('prefiere la denominación abundante a la escasa con el mismo número de piezas', () => {
    // 30 = 25+5 = 10+10+10; hay un solo billete... aquí monedas: 1 de 25 y 1 de 5 frente a 30 de 10
    const result = makeChange(30, { 25: 1, 5: 1, 10: 30 });
    expect(sumBreakdown(result.pieces)).toBe(30);
    expect(result.pieces[25] === 1 && result.pieces[5] === 1).toBe(false);
    expect(result.pieces[10]).toBe(3);
  });

  it('si no hay con qué dar el monto exacto, da lo más cercano y avisa lo que falta', () => {
    const result = makeChange(7, { 5: 1, 1: 1 });
    expect(result.exact).toBe(false);
    expect(result.given).toBe(6);
    expect(result.shortfall).toBe(1);
    expect(sumBreakdown(result.pieces)).toBe(6);
  });

  it('caja vacía: no puede dar nada', () => {
    expect(makeChange(10, {})).toMatchObject({ exact: false, given: 0, shortfall: 10 });
  });

  it('montos grandes siempre se resuelven', () => {
    const result = makeChange(4975, full);
    expect(result.exact).toBe(true);
    expect(sumBreakdown(result.pieces)).toBe(4975);
  });

  it('más allá del límite usa el método simple sin colgarse', () => {
    const result = makeChange(50000, null);
    expect(sumBreakdown(result.pieces)).toBe(50000);
  });
});

describe('changeDue', () => {
  it('calcula la devuelta y el redondeo a pesos enteros', () => {
    expect(changeDue(200, 118)).toMatchObject({ due: 82, rounding: 0, insufficient: false });
    expect(changeDue(200, 123.45)).toMatchObject({ due: 77, insufficient: false });
    expect(changeDue(200, 123.45).rounding).toBeCloseTo(-0.45, 2);
    expect(changeDue(100, 100.4).insufficient).toBe(true);
  });
});

describe('desgloses', () => {
  it('normalizeBreakdown valida denominaciones y cantidades', () => {
    expect(normalizeBreakdown({ 1000: 2, 25: 1 })).toEqual({ ok: true, breakdown: { 1000: 2, 25: 1 } });
    expect(normalizeBreakdown({ 300: 1 }).ok).toBe(false);
    expect(normalizeBreakdown({ 100: 1.5 }).ok).toBe(false);
    expect(normalizeBreakdown({ 100: -1 }).ok).toBe(false);
    expect(normalizeBreakdown(null)).toEqual({ ok: true, breakdown: {} });
  });

  it('addBreakdowns suma, resta y no deja negativos por defecto', () => {
    expect(addBreakdowns({ 100: 2 }, { 50: 1 }, { 100: 1 })).toEqual({ 100: 1, 50: 1 });
    expect(addBreakdowns({ 100: 1 }, {}, { 100: 3 })).toEqual({});
    expect(addBreakdowns({ 100: 1 }, {}, { 100: 3 }, { allowNegative: true })).toEqual({ 100: -2 });
  });
});
