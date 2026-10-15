import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, configSchema, labelsSchema } from './config.service.js';

describe('configuración de etiquetas por empresa', () => {
  it('el rollo térmico 50 × 25 es el formato por defecto', () => {
    expect(DEFAULT_CONFIG.labels.presetId).toBe('ROLL_50x25');
    expect(labelsSchema.parse({}).presetId).toBe('ROLL_50x25');
    expect(configSchema.parse(DEFAULT_CONFIG).labels.layout).toBeNull();
  });

  it('acepta medidas editadas de una hoja', () => {
    const labels = labelsSchema.parse({ presetId: 'CUSTOM', layout: { pageW: 210, pageH: 297, cols: 3, rows: 8, marginTop: 0.5, marginLeft: 0, gapX: 0, gapY: 0 }, split: 'chunk', maxPerFile: 100 });
    expect(labels.layout.rows).toBe(8);
    expect(labels.split).toBe('chunk');
  });

  it('rechaza medidas imposibles o valores fuera de rango', () => {
    const base = { pageW: 210, pageH: 297, cols: 3, rows: 8, marginTop: 0, marginLeft: 0, gapX: 0, gapY: 0 };
    expect(() => labelsSchema.parse({ layout: { ...base, pageW: -5 } })).toThrow();
    expect(() => labelsSchema.parse({ layout: { ...base, cols: 0 } })).toThrow();
    expect(() => labelsSchema.parse({ layout: { ...base, cols: 2.5 } })).toThrow();
    expect(() => labelsSchema.parse({ split: 'zip' })).toThrow();
    expect(() => labelsSchema.parse({ defaultCopies: 0 })).toThrow();
    expect(() => labelsSchema.parse({ presetId: '' })).toThrow();
  });
});
