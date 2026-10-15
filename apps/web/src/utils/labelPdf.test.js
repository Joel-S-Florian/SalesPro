import { describe, expect, it } from 'vitest';
import { DEFAULT_PRESET_ID, LAYOUT_PRESETS, cellOrigin, computeGrid, getPreset, planFiles, summarize } from './labelLayouts';
import { buildLabelPdfs, encodeBarcode, isValidEan13 } from './labelPdf';

const pdfPages = bytes => (new TextDecoder('latin1').decode(bytes).match(/\/Type\s*\/Page[^s]/g) || []).length;
const items = [
  { id: 'a', code: '7460001000875', name: 'Producto con un nombre bastante largo para probar el corte', price: 199.5, copies: 50 },
  { id: 'b', code: 'PROD-003', name: 'Audífonos', price: 20, copies: 30 },
  { id: 'c', code: 'X1', name: 'Uno solo', price: 5, copies: 1 },
];

describe('formatos de papel', () => {
  it('calcula la cuadrícula de cada preset sin errores', () => {
    for (const preset of LAYOUT_PRESETS) {
      const grid = computeGrid(preset);
      expect(grid.error, preset.id).toBeUndefined();
      expect(grid.cellW).toBeGreaterThan(15);
    }
    const a4 = computeGrid(getPreset('A4_3x10'));
    expect(a4.perPage).toBe(30);
    expect(a4.cellW).toBeCloseTo(70, 5);
    expect(a4.cellH).toBeCloseTo(29.7, 5);
  });

  it('el formato por defecto es el rollo térmico 50 × 25 y no se quitó ninguna opción anterior', () => {
    expect(DEFAULT_PRESET_ID).toBe('ROLL_50x25');
    const ids = LAYOUT_PRESETS.map(p => p.id);
    for (const id of ['ROLL_50x25', 'ROLL_40x30', 'ROLL_58x40', 'A4_3x10', 'A4_3x8', 'LETTER_3x10', 'A4_5x13', 'CUSTOM']) expect(ids).toContain(id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('la hoja A4 de 3 columnas × 8 filas mide 70 × 37 mm por etiqueta y caben 24 por página', () => {
    const sheet = computeGrid(getPreset('A4_3x8_70x37'));
    expect(sheet.error).toBeUndefined();
    expect(sheet.cols).toBe(3);
    expect(sheet.rows).toBe(8);
    expect(sheet.perPage).toBe(24);
    expect(sheet.cellW).toBeCloseTo(70, 5);
    expect(sheet.cellH).toBeCloseTo(37, 5);
    // la última etiqueta termina dentro de la hoja
    const last = cellOrigin(sheet, 23);
    expect(last.x + sheet.cellW).toBeLessThanOrEqual(210 + 1e-6);
    expect(last.y + sheet.cellH).toBeLessThanOrEqual(297 + 1e-6);
  });

  it('un rollo es una etiqueta por página y ocupa toda la página', () => {
    const roll = computeGrid(getPreset('ROLL_50x25'));
    expect(roll.perPage).toBe(1);
    expect(roll.cellW).toBe(50);
    expect(roll.cellH).toBe(25);
  });

  it('rechaza medidas imposibles', () => {
    expect(computeGrid({ ...getPreset('CUSTOM'), cols: 20 }).error).toMatch(/pequeña/);
    expect(computeGrid({ ...getPreset('CUSTOM'), pageW: 0 }).error).toMatch(/mayor que cero/);
  });

  it('coloca cada etiqueta en su celda', () => {
    const grid = computeGrid(getPreset('LETTER_3x10'));
    expect(cellOrigin(grid, 0)).toEqual({ x: grid.marginLeft, y: grid.marginTop });
    expect(cellOrigin(grid, 4).x).toBeCloseTo(grid.marginLeft + (grid.cellW + grid.gapX), 5);
    expect(cellOrigin(grid, 4).y).toBeCloseTo(grid.marginTop + grid.cellH, 5);
  });
});

describe('reparto en archivos', () => {
  it('un solo archivo, uno por producto o por bloques', () => {
    expect(planFiles(items, { split: 'single' })).toHaveLength(1);
    expect(planFiles(items, { split: 'perProduct' }).map(f => f.items[0].id)).toEqual(['a', 'b', 'c']);
    const chunks = planFiles(items, { split: 'chunk', maxPerFile: 40 });
    expect(chunks.map(f => f.items.reduce((sum, i) => sum + i.copies, 0))).toEqual([40, 40, 1]);
    expect(chunks.flatMap(f => f.items).reduce((s, i) => s + i.copies, 0)).toBe(81);
    expect(chunks.every(f => f.items.reduce((s, i) => s + i.copies, 0) <= 40)).toBe(true);
  });

  it('ignora los productos sin copias y cuenta etiquetas y páginas', () => {
    expect(planFiles([{ ...items[0], copies: 0 }], { split: 'single' })).toHaveLength(0);
    expect(summarize(items, computeGrid(getPreset('A4_3x10')))).toEqual({ labels: 81, pages: 3 });
  });
});

describe('códigos de barras', () => {
  it('usa EAN-13 si es válido y Code 128 si no', () => {
    expect(isValidEan13('7460001000875')).toBe(true);
    expect(encodeBarcode('7460001000875').format).toBe('EAN13');
    expect(encodeBarcode('PROD-003').format).toBe('CODE128');
    expect(encodeBarcode('7460001000870').format).toBe('CODE128'); // dígito verificador malo
    expect(encodeBarcode('')).toBeNull();
  });
});

describe('generación del PDF', () => {
  it('genera 3000 etiquetas en hoja A4 con las páginas correctas y avisa el progreso', async () => {
    const grid = computeGrid(getPreset('A4_3x10'));
    const progress = [];
    const started = Date.now();
    const out = await buildLabelPdfs({ files: planFiles([{ ...items[0], copies: 3000 }]), grid, options: { showName: true, showPrice: true } }, { onProgress: (d, t) => progress.push([d, t]) });
    expect(out).toHaveLength(1);
    expect(out[0].labels).toBe(3000);
    expect(pdfPages(out[0].bytes)).toBe(100);
    expect(new TextDecoder().decode(out[0].bytes.slice(0, 5))).toBe('%PDF-');
    expect(progress.length).toBeGreaterThan(10);
    expect(progress.at(-1)).toEqual([3000, 3000]);
    expect(Date.now() - started).toBeLessThan(20000);
  }, 30000);

  it('un rollo genera una página por etiqueta', async () => {
    const grid = computeGrid(getPreset('ROLL_50x25'));
    const out = await buildLabelPdfs({ files: planFiles(items.slice(1)), grid, options: { showName: true, showPrice: false } });
    expect(out[0].labels).toBe(31);
    expect(pdfPages(out[0].bytes)).toBe(31);
  });

  it('separa en varios archivos y se puede cancelar', async () => {
    const grid = computeGrid(getPreset('A4_3x10'));
    const out = await buildLabelPdfs({ files: planFiles(items, { split: 'perProduct' }), grid, options: {} });
    expect(out.map(f => f.labels)).toEqual([50, 30, 1]);
    const cancelled = await buildLabelPdfs({ files: planFiles([{ ...items[0], copies: 1000 }]), grid, options: {} }, { shouldCancel: () => true });
    expect(cancelled).toEqual([]);
  });

  it('la hoja de prueba y la vista previa limitada generan una sola página', async () => {
    const grid = computeGrid(getPreset('A4_3x10'));
    const calibration = await buildLabelPdfs({ files: [], grid, options: { calibration: true } });
    expect(pdfPages(calibration[0].bytes)).toBe(1);
    const preview = await buildLabelPdfs({ files: planFiles(items), grid, options: { maxLabels: grid.perPage, showName: true } });
    expect(preview[0].labels).toBe(30);
    expect(pdfPages(preview[0].bytes)).toBe(1);
  });
});
