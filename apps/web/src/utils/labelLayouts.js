/**
 * Formatos de papel para etiquetas. Todas las medidas en milímetros.
 * - `sheet`: hoja con cuadrícula de etiquetas adhesivas (se imprime la hoja completa).
 * - `roll`: rollo térmico, una etiqueta por página (la página mide lo mismo que la etiqueta).
 */
export const LAYOUT_PRESETS = [
  { id: 'A4_3x10', name: 'Hoja A4, 3 × 10 (70 × 29.7 mm)', kind: 'sheet', pageW: 210, pageH: 297, cols: 3, rows: 10, marginTop: 0, marginLeft: 0, gapX: 0, gapY: 0 },
  { id: 'A4_3x8', name: 'Hoja A4, 3 × 8 (63.5 × 33.9 mm)', kind: 'sheet', pageW: 210, pageH: 297, cols: 3, rows: 8, marginTop: 13, marginLeft: 7.2, gapX: 2.5, gapY: 0 },
  { id: 'LETTER_3x10', name: 'Hoja Carta, 3 × 10 (tipo Avery 5160)', kind: 'sheet', pageW: 215.9, pageH: 279.4, cols: 3, rows: 10, marginTop: 12.7, marginLeft: 4.8, gapX: 3.2, gapY: 0 },
  { id: 'A4_5x13', name: 'Hoja A4, 5 × 13 (38 × 21.2 mm, pequeña)', kind: 'sheet', pageW: 210, pageH: 297, cols: 5, rows: 13, marginTop: 10.7, marginLeft: 4.7, gapX: 2.5, gapY: 0 },
  { id: 'ROLL_50x25', name: 'Rollo térmico 50 × 25 mm', kind: 'roll', pageW: 50, pageH: 25, cols: 1, rows: 1, marginTop: 0, marginLeft: 0, gapX: 0, gapY: 0 },
  { id: 'ROLL_40x30', name: 'Rollo térmico 40 × 30 mm', kind: 'roll', pageW: 40, pageH: 30, cols: 1, rows: 1, marginTop: 0, marginLeft: 0, gapX: 0, gapY: 0 },
  { id: 'ROLL_58x40', name: 'Rollo térmico 58 × 40 mm', kind: 'roll', pageW: 58, pageH: 40, cols: 1, rows: 1, marginTop: 0, marginLeft: 0, gapX: 0, gapY: 0 },
  { id: 'CUSTOM', name: 'Personalizado', kind: 'sheet', pageW: 210, pageH: 297, cols: 3, rows: 8, marginTop: 10, marginLeft: 10, gapX: 2, gapY: 2 },
];

export const DEFAULT_PRESET_ID = 'A4_3x10';
export const getPreset = id => LAYOUT_PRESETS.find(p => p.id === id) || LAYOUT_PRESETS[0];

const num = (value, fallback = 0) => (Number.isFinite(Number(value)) ? Number(value) : fallback);

/**
 * Calcula la cuadrícula: tamaño de cada etiqueta y cuántas caben por página.
 * Para un rollo, la etiqueta ocupa toda la página. Devuelve `error` si las medidas no tienen sentido.
 */
export function computeGrid(layout) {
  const pageW = num(layout.pageW);
  const pageH = num(layout.pageH);
  const cols = Math.max(1, Math.floor(num(layout.cols, 1)));
  const rows = Math.max(1, Math.floor(num(layout.rows, 1)));
  const marginTop = num(layout.marginTop);
  const marginLeft = num(layout.marginLeft);
  const gapX = num(layout.gapX);
  const gapY = num(layout.gapY);

  if (pageW <= 0 || pageH <= 0) return { error: 'El tamaño de la página debe ser mayor que cero' };
  const cellW = (pageW - marginLeft * 2 - gapX * (cols - 1)) / cols;
  const cellH = (pageH - marginTop * 2 - gapY * (rows - 1)) / rows;
  if (cellW < 15 || cellH < 10) return { error: `Cada etiqueta quedaría de ${cellW.toFixed(1)} × ${cellH.toFixed(1)} mm: es demasiado pequeña (mínimo 15 × 10 mm). Revise columnas, filas y márgenes` };
  return { pageW, pageH, cols, rows, marginTop, marginLeft, gapX, gapY, cellW, cellH, perPage: cols * rows };
}

/** Posición (mm) de la esquina superior izquierda de la etiqueta número `index` (0 = primera) dentro de su página. */
export function cellOrigin(grid, indexInPage) {
  const col = indexInPage % grid.cols;
  const row = Math.floor(indexInPage / grid.cols);
  return {
    x: grid.marginLeft + col * (grid.cellW + grid.gapX),
    y: grid.marginTop + row * (grid.cellH + grid.gapY),
  };
}

/** Cuántas etiquetas hay en total y cuántas páginas hacen falta. */
export function summarize(items, grid) {
  const labels = items.reduce((sum, item) => sum + Math.max(0, Math.floor(num(item.copies))), 0);
  return { labels, pages: grid && !grid.error ? Math.ceil(labels / grid.perPage) : 0 };
}

/**
 * Reparte las etiquetas en archivos. `split`: 'single' (uno solo), 'perProduct' (un archivo por producto)
 * o 'chunk' (máximo `maxPerFile` etiquetas por archivo). Devuelve [{ name, items }].
 */
export function planFiles(items, { split = 'single', maxPerFile = 500 } = {}) {
  const active = items.filter(item => Math.floor(num(item.copies)) > 0);
  if (split === 'perProduct') {
    return active.map((item, i) => ({ name: `${String(i + 1).padStart(3, '0')}-${slug(item.code)}`, items: [item] }));
  }
  if (split === 'chunk') {
    const limit = Math.max(1, Math.floor(num(maxPerFile, 500)));
    const files = [];
    let current = [];
    let count = 0;
    const flush = () => {
      if (current.length) files.push({ name: `etiquetas-${String(files.length + 1).padStart(3, '0')}`, items: current });
      current = [];
      count = 0;
    };
    for (const item of active) {
      let remaining = Math.floor(num(item.copies));
      while (remaining > 0) {
        const take = Math.min(remaining, limit - count);
        current.push({ ...item, copies: take });
        count += take;
        remaining -= take;
        if (count >= limit) flush();
      }
    }
    flush();
    return files;
  }
  return active.length ? [{ name: 'etiquetas', items: active }] : [];
}

const slug = value => String(value || 'producto').replace(/[^A-Za-z0-9_-]+/g, '-').slice(0, 40);
