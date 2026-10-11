import { useCallback, useMemo, useRef, useState } from 'react';
import { notify } from '../utils/notify';
import { expiryDiscountFor, sellableStock } from '../utils/expiry';
import { trimQty, unitInfo } from '../utils/units';

const round2 = n => Math.round((n + Number.EPSILON) * 100) / 100;

/** Una línea del ticket: producto + (opcional) presentación vendida + cantidad en esa unidad de venta. */
export const lineIdOf = (product, presentation) => (presentation ? `${product.id}:${presentation.id}` : product.id);

/** Unidades base que descuenta la línea (2 paquetes x12 = 24). */
export const baseQuantityOf = item => round2(item.quantity * (item.presentation ? Number(item.presentation.factor) : 1));

/** Importe bruto de la línea (antes de descuentos). */
export const grossOf = item =>
  round2(item.quantity * Number(item.presentation ? item.presentation.salePrice : item.product.salePrice || 0));

/** Descuento por vencimiento de la línea: lo fija el servidor; aquí se replica para mostrar el mismo total. */
export const expiryOf = item => {
  const base = baseQuantityOf(item);
  return base > 0 ? expiryDiscountFor(item.product, base, grossOf(item) / base) : 0;
};

/** Total de la línea ya con descuentos. */
export const lineTotalOf = item => round2(grossOf(item) - Number(item.discount || 0) - expiryOf(item));

/**
 * Estado y cálculos del carrito del POS.
 * Cada línea es { lineId, product, presentation, quantity, discount }; los importes usan la tasa de ITBIS vigente.
 * A granel la cantidad lleva hasta 2 decimales (1.25 lb); con presentación, la cantidad es de presentaciones.
 */
export function usePosCart(taxRate) {
  const [items, setItems] = useState([]);
  const [globalDiscount, setGlobalDiscountState] = useState(0);

  // Espejo síncrono: varias lecturas de escáner pueden llegar antes de que React vuelva a renderizar
  const itemsRef = useRef(items);
  const commit = useCallback(next => {
    itemsRef.current = next;
    setItems(next);
  }, []);

  /** Unidades base de un producto que ya hay en el ticket, sin contar la línea `exceptLineId`. */
  const baseInCart = (productId, exceptLineId) =>
    itemsRef.current.filter(i => i.product.id === productId && i.lineId !== exceptLineId).reduce((acc, i) => acc + baseQuantityOf(i), 0);

  /**
   * Agrega al ticket. `quantity` está en la unidad de venta (presentaciones o unidad base); por defecto 1.
   * Devuelve false (y avisa) si no hay existencia suficiente.
   */
  const add = useCallback(
    (product, { presentation = null, quantity = 1 } = {}) => {
      const lineId = lineIdOf(product, presentation);
      const current = itemsRef.current;
      const existing = current.find(item => item.lineId === lineId);
      const nextQuantity = round2((existing?.quantity || 0) + quantity);
      const candidate = { product, presentation, quantity: nextQuantity };
      const available = sellableStock(product) - baseInCart(product.id, lineId);
      if (baseQuantityOf(candidate) > available + 0.004) {
        const unit = unitInfo(product.unit).short;
        notify.warning(available > 0 ? `Solo hay ${trimQty(Math.max(0, available))} ${unit} de ${product.name}.` : `${product.name} está agotado.`);
        return false;
      }
      commit(
        existing
          ? current.map(item => (item.lineId === lineId ? { ...item, quantity: nextQuantity } : item))
          : [...current, { lineId, product, presentation, quantity: nextQuantity, discount: 0 }]
      );
      return true;
    },
    [commit]
  );

  /** Fija la cantidad. Devuelve 'remove' si debe pedirse autorización para quitar la línea. */
  const setQuantity = useCallback(
    (lineId, quantity) => {
      const current = itemsRef.current;
      const item = current.find(x => x.lineId === lineId);
      if (!item) return null;
      const value = round2(Number(quantity) || 0);
      if (value <= 0) return 'remove';
      const available = sellableStock(item.product) - baseInCart(item.product.id, lineId);
      if (baseQuantityOf({ ...item, quantity: value }) > available + 0.004) {
        notify.warning(`Solo hay ${trimQty(Math.max(0, available))} ${unitInfo(item.product.unit).short} de ${item.product.name}.`);
        return null;
      }
      commit(current.map(x => (x.lineId === lineId ? { ...x, quantity: value } : x)));
      return 'ok';
    },
    [commit]
  );

  const setLineDiscount = useCallback(
    (lineId, value) => {
      const current = itemsRef.current;
      const item = current.find(x => x.lineId === lineId);
      if (!item) return;
      const max = Math.max(0, grossOf(item) - expiryOf(item));
      const discount = Math.min(Math.max(0, Number(value) || 0), max);
      commit(current.map(x => (x.lineId === lineId ? { ...x, discount } : x)));
    },
    [commit]
  );

  const remove = useCallback(lineId => commit(itemsRef.current.filter(x => x.lineId !== lineId)), [commit]);

  const clear = useCallback(() => {
    commit([]);
    setGlobalDiscountState(0);
  }, [commit]);

  const setGlobalDiscount = useCallback(value => setGlobalDiscountState(Math.max(0, Number(value) || 0)), []);

  const totals = useMemo(() => {
    const subtotal = items.reduce((acc, item) => acc + grossOf(item), 0);
    const lineDiscounts = items.reduce((acc, item) => acc + Number(item.discount || 0), 0);
    // El descuento por vencimiento lo fija el servidor; aquí se replica para mostrar el mismo total
    const expiryDiscounts = items.reduce((acc, item) => acc + expiryOf(item), 0);
    const discount = lineDiscounts + expiryDiscounts + (Number(globalDiscount) || 0);
    const taxable = Math.max(0, subtotal - discount);
    const tax = round2(taxable * taxRate);
    return {
      subtotal: round2(subtotal),
      discount: round2(discount),
      expiryDiscount: round2(expiryDiscounts),
      tax,
      total: round2(taxable + tax),
      // artículos distintos en el ticket (a granel, un peso no es "unidades")
      units: items.length,
    };
  }, [items, globalDiscount, taxRate]);

  // Unidades base por producto (para la insignia de cada tarjeta)
  const quantities = useMemo(() => {
    const map = {};
    for (const item of items) map[item.product.id] = round2((map[item.product.id] || 0) + baseQuantityOf(item));
    return map;
  }, [items]);

  return {
    items,
    globalDiscount,
    totals,
    quantities,
    add,
    setQuantity,
    setLineDiscount,
    setGlobalDiscount,
    remove,
    clear,
    find: lineId => itemsRef.current.find(item => item.lineId === lineId),
  };
}
