/**
 * Perecederos en el POS. El servidor decide el descuento al vender; aquí se calcula igual (mismos lotes, FEFO)
 * para que el carrito muestre el mismo total que tendrá la factura.
 * `product.lots` llega ya ordenado por FEFO con los lotes vendibles: [{ currentStock, daysLeft, discountPercent }].
 */
const round2 = n => Math.round(n * 100) / 100;

/** Unidades que se pueden vender ahora (en perecederos: lotes vigentes; el resto de productos: el stock). */
export function sellableStock(product) {
  return product.isPerishable && product.sellableStock !== undefined ? product.sellableStock : product.stock;
}

/** Reparte `quantity` (unidades base) por los lotes en orden FEFO: [{ quantity, percent }]. */
export function expiryAllocation(product, quantity) {
  if (!product.isPerishable || !Array.isArray(product.lots)) return [];
  let remaining = quantity;
  const parts = [];
  for (const lot of product.lots) {
    if (remaining <= 0) break;
    const take = Math.min(lot.currentStock, remaining);
    if (take > 0) parts.push({ quantity: take, percent: lot.discountPercent || 0, daysLeft: lot.daysLeft });
    remaining -= take;
  }
  return parts;
}

/** Descuento total (en dinero) por vencimiento de una línea. `quantity` en unidades base; `unitPrice` es el precio por unidad base. */
export function expiryDiscountFor(product, quantity, unitPrice) {
  const price = Number(unitPrice ?? product.salePrice ?? 0);
  return round2(expiryAllocation(product, quantity).reduce((acc, part) => acc + (price * part.quantity * part.percent) / 100, 0));
}

/** Porcentaje mayor aplicado en la línea (para el aviso "−30% por vencimiento"). */
export function expiryPercentFor(product, quantity) {
  return expiryAllocation(product, quantity).reduce((max, part) => Math.max(max, part.percent), 0);
}
