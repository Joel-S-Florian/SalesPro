import JsBarcode from 'jsbarcode';
import { jsPDF } from 'jspdf';
import { cellOrigin } from './labelLayouts';

/** EAN-13 válido: 13 dígitos con dígito verificador correcto. */
export function isValidEan13(value) {
  if (!/^\d{13}$/.test(value)) return false;
  const digits = value.split('').map(Number);
  const sum = digits.slice(0, 12).reduce((acc, d, i) => acc + d * (i % 2 === 0 ? 1 : 3), 0);
  return (10 - (sum % 10)) % 10 === digits[12];
}

const cache = new Map();

/**
 * Codifica el valor como barras: EAN-13 si es válido y Code 128 en los demás casos.
 * Devuelve { bits: '1010…', format } (cada carácter es un módulo, 1 = barra) o null si no se puede codificar.
 * No necesita pantalla: sirve dentro de un Worker.
 */
export function encodeBarcode(value) {
  const text = String(value ?? '');
  if (cache.has(text)) return cache.get(text);
  let result = null;
  if (text) {
    const format = isValidEan13(text) ? 'EAN13' : 'CODE128';
    try {
      const target = {};
      JsBarcode(target, text, { format, valid: () => {} });
      const bits = (target.encodings || []).map(e => e.data).join('');
      if (bits.includes('1')) result = { bits, format };
    } catch {
      result = null;
    }
  }
  if (cache.size > 5000) cache.clear();
  cache.set(text, result);
  return result;
}

const PT = 0.3528; // 1 punto en mm
const money = value => `RD$ ${Number(value || 0).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function drawBars(doc, bits, x, y, width, height) {
  const moduleW = width / bits.length;
  doc.setFillColor(0, 0, 0);
  let start = -1;
  for (let i = 0; i <= bits.length; i++) {
    const on = i < bits.length && bits[i] === '1';
    if (on && start < 0) start = i;
    if (!on && start >= 0) {
      doc.rect(x + start * moduleW, y, (i - start) * moduleW, height, 'F');
      start = -1;
    }
  }
}

function drawLabel(doc, x, y, w, h, item, { showName, showPrice }) {
  const pad = Math.min(1.5, w * 0.04);
  const innerW = w - pad * 2;
  const centerX = x + w / 2;
  let cursor = y + pad;

  doc.setTextColor(0, 0, 0);
  if (showName) {
    const size = h >= 25 ? 7 : 6;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(size);
    const lines = doc.splitTextToSize(String(item.name || ''), innerW).slice(0, h >= 25 ? 2 : 1);
    const lineH = size * PT * 1.15;
    for (const line of lines) {
      doc.text(line, centerX, cursor + size * PT * 0.85, { align: 'center' });
      cursor += lineH;
    }
  }

  const priceH = showPrice ? (h >= 25 ? 4.2 : 3.6) : 0;
  const codeH = 3;
  const barsH = Math.max(5, y + h - pad - priceH - codeH - cursor);
  const encoded = encodeBarcode(item.code);
  if (encoded) {
    drawBars(doc, encoded.bits, x + pad, cursor, innerW, barsH);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.text(String(item.code), centerX, cursor + barsH + 2.4, { align: 'center' });
  } else {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(6);
    doc.text('Código no válido para barras', centerX, cursor + barsH / 2, { align: 'center' });
  }
  if (showPrice) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(h >= 25 ? 9 : 8);
    doc.text(money(item.price), centerX, y + h - pad - 0.4, { align: 'center' });
  }
}

function drawCalibration(doc, grid, index, x, y) {
  doc.setDrawColor(120, 120, 120);
  doc.setLineWidth(0.15);
  doc.rect(x, y, grid.cellW, grid.cellH);
  doc.setTextColor(90, 90, 90);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6);
  doc.text(`${index + 1}  ·  ${grid.cellW.toFixed(1)} × ${grid.cellH.toFixed(1)} mm`, x + grid.cellW / 2, y + grid.cellH / 2, { align: 'center' });
}

const tick = () => new Promise(resolve => setTimeout(resolve, 0));

/**
 * Genera los PDF. `files` = [{ name, items: [{ code, name, price, copies }] }] (ver `planFiles`), `grid` = `computeGrid(...)`.
 * `options`: showName, showPrice, calibration (hoja de prueba con los bordes), maxLabels (corta la generación; para la vista previa).
 * Devuelve [{ name, bytes: Uint8Array, labels }]. Cede el control cada ~150 etiquetas para poder mostrar progreso y cancelar.
 */
export async function buildLabelPdfs({ files, grid, options = {} }, { onProgress, shouldCancel } = {}) {
  const total = options.calibration
    ? grid.perPage
    : Math.min(options.maxLabels ?? Infinity, files.reduce((sum, file) => sum + file.items.reduce((s, item) => s + item.copies, 0), 0));
  let done = 0;
  const output = [];

  for (const file of options.calibration ? [{ name: 'hoja-de-prueba', items: [] }] : files) {
    const doc = new jsPDF({ unit: 'mm', format: [grid.pageW, grid.pageH], orientation: grid.pageW > grid.pageH ? 'landscape' : 'portrait', compress: true });
    let indexInPage = 0;
    let labels = 0;

    const place = draw => {
      if (indexInPage >= grid.perPage) {
        doc.addPage([grid.pageW, grid.pageH], grid.pageW > grid.pageH ? 'landscape' : 'portrait');
        indexInPage = 0;
      }
      const { x, y } = cellOrigin(grid, indexInPage);
      draw(x, y);
      indexInPage += 1;
      labels += 1;
      done += 1;
    };

    if (options.calibration) {
      for (let i = 0; i < grid.perPage; i++) place((x, y) => drawCalibration(doc, grid, i, x, y));
    } else {
      outer: for (const item of file.items) {
        for (let copy = 0; copy < item.copies; copy++) {
          if (done >= total) break outer;
          place((x, y) => drawLabel(doc, x, y, grid.cellW, grid.cellH, item, options));
          if (done % 150 === 0) {
            onProgress?.(done, total);
            await tick();
            if (shouldCancel?.()) return [];
          }
        }
      }
    }
    output.push({ name: file.name, bytes: new Uint8Array(doc.output('arraybuffer')), labels });
    onProgress?.(done, total);
    await tick();
    if (shouldCancel?.()) return [];
  }
  return output;
}
