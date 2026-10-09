/**
 * Funciones puras de limpieza y normalización para la ingestión de inventario.
 */

// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001F\u007F-\u009F​-‍﻿]/g;

/** Quita caracteres de control/invisibles y colapsa espacios. */
export function cleanText(value) {
  if (value === null || value === undefined) return '';
  return String(value).replace(CONTROL_CHARS, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Convierte texto con formato de moneda a número.
 * Soporta "$1,234.50", "1.234,50", "RD$ 12", "12,5" y números ya numéricos.
 * Devuelve null si no se puede interpretar.
 */
export function parseNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;

  let text = cleanText(value).replace(/[^\d.,-]/g, '');
  if (!text || !/\d/.test(text)) return null;

  const lastDot = text.lastIndexOf('.');
  const lastComma = text.lastIndexOf(',');

  if (lastDot !== -1 && lastComma !== -1) {
    // El último separador es el decimal; el otro es de miles
    const decimal = lastDot > lastComma ? '.' : ',';
    const thousands = decimal === '.' ? ',' : '.';
    text = text.split(thousands).join('').replace(decimal, '.');
  } else if (lastComma !== -1) {
    // Una coma: decimal si le siguen 1-2 dígitos ("12,5"), miles si son 3 ("1,234")
    const decimals = text.length - lastComma - 1;
    text = decimals === 3 && text.split(',').length === 2 ? text.replace(',', '') : text.replace(/,/g, '.');
  } else if (lastDot !== -1 && text.split('.').length > 2) {
    text = text.replace(/\./g, '');
  }

  const number = Number(text);
  return Number.isFinite(number) ? number : null;
}

const round2 = n => Math.round(n * 100) / 100;

/**
 * Sanitiza una fila cruda ya mapeada ({ code, name, cost, stock, price, category }).
 * Devuelve { data, errors } con los valores normalizados.
 */
export function sanitizeRow(mapped, { marginPercent = 0 } = {}) {
  const errors = [];

  const code = cleanText(mapped.code).toUpperCase();
  const name = cleanText(mapped.name);
  if (!code) errors.push('Código de barras/SKU vacío');
  if (code.length > 50) errors.push('Código demasiado largo (máx. 50)');
  if (!name) errors.push('Descripción vacía');

  const cost = parseNumber(mapped.cost);
  if (cost === null || cost < 0) errors.push('Costo unitario inválido');

  let stock = 0;
  if (mapped.stock !== undefined && mapped.stock !== '' && mapped.stock !== null) {
    const parsed = parseNumber(mapped.stock);
    if (parsed === null || parsed < 0) errors.push('Existencia inválida');
    else stock = Math.round(parsed);
  }

  // Precio de venta: el del archivo si viene; si no, costo + margen
  let price = null;
  if (mapped.price !== undefined && mapped.price !== '' && mapped.price !== null) {
    price = parseNumber(mapped.price);
    if (price === null || price < 0) errors.push('Precio de venta inválido');
  } else if (cost !== null && cost >= 0) {
    price = round2(cost * (1 + marginPercent / 100));
  }

  return {
    data: {
      code,
      name: name.substring(0, 200),
      cost: cost === null ? null : round2(cost),
      stock,
      price,
      category: cleanText(mapped.category) || null,
    },
    errors,
  };
}
