/**
 * Funciones puras de limpieza y normalización para la ingestión de inventario.
 */

// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001F\u007F-\u009F\u200B-\u200D\uFEFF]/g;

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

const UNIT_ALIASES = {
  UND: 'UND', UNIDAD: 'UND', UNIDADES: 'UND', U: 'UND', UN: 'UND',
  LB: 'LB', LBS: 'LB', LIBRA: 'LB', LIBRAS: 'LB',
  KG: 'KG', KGS: 'KG', KILO: 'KG', KILOS: 'KG', KILOGRAMO: 'KG', KILOGRAMOS: 'KG',
  OZ: 'OZ', ONZA: 'OZ', ONZAS: 'OZ',
  GR: 'GR', G: 'GR', GRAMO: 'GR', GRAMOS: 'GR',
  LT: 'LT', L: 'LT', LTS: 'LT', LITRO: 'LT', LITROS: 'LT',
  GAL: 'GAL', GALON: 'GAL', GALONES: 'GAL', 'GALÓN': 'GAL',
  ML: 'ML', MILILITRO: 'ML', MILILITROS: 'ML',
};
const FRACTIONAL_UNITS = new Set(['LB', 'KG', 'OZ', 'GR', 'LT', 'GAL', 'ML']);
const YES = new Set(['SI', 'SÍ', 'S', 'YES', 'Y', 'TRUE', '1', 'X', 'VERDADERO']);
const NO = new Set(['NO', 'N', 'FALSE', '0', 'FALSO']);
export const RESERVED_LOT = 'SIN-LOTE';

/** Fecha en AAAA-MM-DD (también DD/MM/AAAA y DD-MM-AAAA). Devuelve null si no es una fecha real. */
export function parseDateText(value) {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString().slice(0, 10);
  const text = cleanText(value);
  let y;
  let m;
  let d;
  let match = text.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (match) [, y, m, d] = match;
  else if ((match = text.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/))) [, d, m, y] = match;
  else return null;
  const iso = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const date = new Date(`${iso}T12:00:00Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== iso ? null : iso;
}

/**
 * Campos opcionales de alimentos: unidad, mínimo, perecedero, lote, vencimiento y hasta 2 presentaciones.
 * Devuelve { data, errors, unitGiven }.
 */
function sanitizeExtras(mapped) {
  const errors = [];
  const given = key => mapped[key] !== undefined && mapped[key] !== null && cleanText(mapped[key]) !== '';

  let unit = 'UND';
  const unitGiven = given('unit');
  if (unitGiven) {
    const key = cleanText(mapped.unit).toUpperCase().replace(/\./g, '');
    unit = UNIT_ALIASES[key];
    if (!unit) {
      errors.push(`Unidad desconocida: ${cleanText(mapped.unit)} (use UND, LB, KG, OZ, GR, LT, GAL o ML)`);
      unit = 'UND';
    }
  }

  let minStock = null;
  if (given('minStock')) {
    const parsed = parseNumber(mapped.minStock);
    if (parsed === null || parsed < 0) errors.push('Stock mínimo inválido');
    else minStock = round2(parsed);
  }

  let isPerishable = false;
  if (given('perishable')) {
    const key = cleanText(mapped.perishable).toUpperCase();
    if (YES.has(key)) isPerishable = true;
    else if (!NO.has(key)) errors.push('«Perecedero» debe ser SI o NO');
  }

  let lot = null;
  if (given('lot')) {
    lot = cleanText(mapped.lot).substring(0, 40);
    if (lot.toUpperCase() === RESERVED_LOT) errors.push(`«${RESERVED_LOT}» es un nombre de lote reservado`);
  }

  let expiration = null;
  if (given('expiration')) {
    expiration = parseDateText(mapped.expiration);
    if (!expiration) errors.push('Fecha de vencimiento inválida (use AAAA-MM-DD)');
  }

  const presentations = [];
  [1, 2].forEach(n => {
    const keys = ['Name', 'Qty', 'Price', 'Barcode'].map(k => `pres${n}${k}`);
    if (!keys.some(given)) return;
    const name = cleanText(mapped[keys[0]]).substring(0, 40);
    const factor = parseNumber(mapped[keys[1]]);
    const price = parseNumber(mapped[keys[2]]);
    const barcode = cleanText(mapped[keys[3]]).toUpperCase() || null;
    if (!name) errors.push(`Presentación ${n}: falta el nombre`);
    else if (factor === null || !(factor > 0) || Math.abs(factor * 100 - Math.round(factor * 100)) > 1e-6) errors.push(`Presentación ${n}: las unidades que contiene deben ser mayores que 0 (máx. 2 decimales)`);
    else if (price === null || price < 0) errors.push(`Presentación ${n}: precio inválido`);
    else if (barcode && barcode.length > 50) errors.push(`Presentación ${n}: código demasiado largo`);
    else presentations.push({ name, factor, salePrice: round2(price), barcode });
  });
  if (presentations.length === 2 && presentations[0].name.toLowerCase() === presentations[1].name.toLowerCase()) errors.push('Las dos presentaciones tienen el mismo nombre');

  return { data: { unit, minStock, isPerishable, lot, expiration, presentations }, errors, unitGiven };
}

/**
 * Sanitiza una fila cruda ya mapeada ({ code, name, cost, stock, price, category }).
 * Devuelve { data, errors } con los valores normalizados.
 */
export function sanitizeRow(mapped, { marginPercent = 0 } = {}) {
  const extras = sanitizeExtras(mapped);
  const errors = [...extras.errors];

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
    else stock = FRACTIONAL_UNITS.has(extras.data.unit) ? round2(parsed) : Math.round(parsed);
  }

  // Precio de venta: el del archivo si viene; si no, costo + margen
  // Un perecedero con existencia necesita lote y vencimiento (las filas sin existencia no)
  if (extras.data.isPerishable && stock > 0 && (!extras.data.lot || !extras.data.expiration)) {
    errors.push('Perecedero con existencia: falta el lote o el vencimiento');
  }

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
      ...extras.data,
      unitGiven: extras.unitGiven,
    },
    errors,
  };
}
