/**
 * Unidades de medida de los productos. `ecf` es el código de la tabla UnidadMedida de la DGII (e-CF).
 * `fractional`: se puede vender en fracciones (a granel: 1.25 lb). Las unidades contables (UND) son enteras.
 * Hay una copia para el navegador en apps/web/src/utils/units.js: mantenga ambas iguales.
 */
export const UNITS = {
  UND: { label: 'Unidad', short: 'und', ecf: 43, fractional: false },
  LB: { label: 'Libra', short: 'lb', ecf: 23, fractional: true },
  KG: { label: 'Kilogramo', short: 'kg', ecf: 21, fractional: true },
  OZ: { label: 'Onza', short: 'oz', ecf: 61, fractional: true },
  GR: { label: 'Gramo', short: 'g', ecf: 17, fractional: true },
  LT: { label: 'Litro', short: 'L', ecf: 24, fractional: true },
  GAL: { label: 'Galón', short: 'gal', ecf: 15, fractional: true },
  ML: { label: 'Mililitro', short: 'ml', ecf: 59, fractional: true },
};

export const DEFAULT_UNIT = 'UND';

export const isValidUnit = code => Object.prototype.hasOwnProperty.call(UNITS, code);
export const unitInfo = code => UNITS[code] || UNITS[DEFAULT_UNIT];
export const isFractional = code => unitInfo(code).fractional;

/** Las cantidades se guardan con 2 decimales; diferencias menores a esto son ruido de coma flotante. */
export const QTY_EPS = 0.004;

export const roundQty = n => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

/**
 * Valida una cantidad (> 0) para la unidad del producto: entera en UND, con hasta 2 decimales a granel.
 * Devuelve null si es válida, o el mensaje de error.
 */
export function quantityError(quantity, unit) {
  const q = Number(quantity);
  if (!Number.isFinite(q) || q <= 0) return 'La cantidad debe ser mayor que cero';
  if (!isFractional(unit)) return Number.isInteger(q) ? null : `Este producto se vende por ${unitInfo(unit).label.toLowerCase()} entera`;
  return Math.abs(q * 100 - Math.round(q * 100)) < 1e-6 ? null : 'La cantidad admite hasta 2 decimales';
}
