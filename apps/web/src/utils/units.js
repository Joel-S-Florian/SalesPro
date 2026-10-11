/**
 * Unidades de medida y formato de cantidades. Copia de apps/api/src/shared/utils/units.js: mantenga ambas iguales.
 * Las cantidades llevan hasta 2 decimales; en unidades enteras (UND) siempre son enteras.
 */
export const UNITS = {
  UND: { label: 'Unidad', short: 'und', fractional: false },
  LB: { label: 'Libra', short: 'lb', fractional: true },
  KG: { label: 'Kilogramo', short: 'kg', fractional: true },
  OZ: { label: 'Onza', short: 'oz', fractional: true },
  GR: { label: 'Gramo', short: 'g', fractional: true },
  LT: { label: 'Litro', short: 'L', fractional: true },
  GAL: { label: 'Galón', short: 'gal', fractional: true },
  ML: { label: 'Mililitro', short: 'ml', fractional: true },
};

export const unitInfo = code => UNITS[code] || UNITS.UND;
export const isFractional = code => unitInfo(code).fractional;

/** Cantidad sin ceros sobrantes: 1.25, 3, 0.5. */
export const trimQty = value => String(Math.round((Number(value) + Number.EPSILON) * 100) / 100);

/** "1.25 lb"; en unidades (UND) solo el número: "3". */
export function formatQty(value, unit = 'UND') {
  const text = trimQty(value);
  return unit === 'UND' ? text : `${text} ${unitInfo(unit).short}`;
}

/** Paso de los botones +/− del carrito: 1 en unidades enteras, 0.25 a granel. */
export const stepFor = unit => (isFractional(unit) ? 0.25 : 1);

/**
 * Cómo mostrar una línea de venta ya guardada: cantidad y precio unitario "de cara al cliente".
 * Si se vendió en presentación: "2 Paquete x12" a precio de paquete; si no, "1.25 lb" a precio por unidad.
 */
export function lineDisplay(detail) {
  const quantity = Number(detail.quantity) || 0;
  const unitPrice = Number(detail.unitPrice) || 0;
  if (detail.presentationName && detail.presentationQty) {
    const presentationQty = Number(detail.presentationQty);
    const gross = unitPrice * Math.abs(quantity);
    return {
      qtyText: `${trimQty(quantity < 0 ? -presentationQty : presentationQty)} ${detail.presentationName}`,
      priceEach: presentationQty ? Math.round((gross / presentationQty) * 100) / 100 : unitPrice,
    };
  }
  const unit = detail.unit || 'UND';
  return { qtyText: unit === 'UND' ? trimQty(quantity) : `${trimQty(quantity)} ${unitInfo(unit).short}`, priceEach: unitPrice };
}
