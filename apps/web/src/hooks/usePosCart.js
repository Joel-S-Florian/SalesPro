import { useCallback, useMemo, useRef, useState } from 'react';
import { notify } from '../utils/notify';

const round2 = n => Math.round(n * 100) / 100;

/**
 * Estado y cálculos del carrito del POS.
 * Cada línea es { product, quantity, discount }; los importes se calculan con la tasa de ITBIS vigente.
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

  /** Agrega una unidad. Devuelve false (y avisa) si no hay existencia suficiente. */
  const add = useCallback(
    product => {
      const current = itemsRef.current;
      const existing = current.find(item => item.product.id === product.id);

      if (existing) {
        if (product.stock <= existing.quantity) {
          notify.warning(`Solo hay ${product.stock} unidades de ${product.name}.`);
          return false;
        }
        commit(current.map(item => (item.product.id === product.id ? { ...item, quantity: item.quantity + 1 } : item)));
        return true;
      }

      if (product.stock < 1) {
        notify.warning(`${product.name} está agotado.`);
        return false;
      }
      commit([...current, { product, quantity: 1, discount: 0 }]);
      return true;
    },
    [commit]
  );

  /** Fija la cantidad. Devuelve 'remove' si debe pedirse autorización para quitar la línea. */
  const setQuantity = useCallback(
    (productId, quantity) => {
      const current = itemsRef.current;
      const item = current.find(x => x.product.id === productId);
      if (!item) return null;
      if (quantity <= 0) return 'remove';
      if (item.product.stock < quantity) {
        notify.warning(`Solo hay ${item.product.stock} unidades de ${item.product.name}.`);
        return null;
      }
      commit(current.map(x => (x.product.id === productId ? { ...x, quantity } : x)));
      return 'ok';
    },
    [commit]
  );

  const setLineDiscount = useCallback(
    (productId, value) => {
      const current = itemsRef.current;
      const item = current.find(x => x.product.id === productId);
      if (!item) return;
      const max = Number(item.product.salePrice || 0) * item.quantity;
      const discount = Math.min(Math.max(0, Number(value) || 0), max);
      commit(current.map(x => (x.product.id === productId ? { ...x, discount } : x)));
    },
    [commit]
  );

  const remove = useCallback(
    productId => commit(itemsRef.current.filter(x => x.product.id !== productId)),
    [commit]
  );

  const clear = useCallback(() => {
    commit([]);
    setGlobalDiscountState(0);
  }, [commit]);

  const setGlobalDiscount = useCallback(value => setGlobalDiscountState(Math.max(0, Number(value) || 0)), []);

  const totals = useMemo(() => {
    const subtotal = items.reduce((acc, item) => acc + Number(item.product.salePrice || 0) * item.quantity, 0);
    const lineDiscounts = items.reduce((acc, item) => acc + Number(item.discount || 0), 0);
    const discount = lineDiscounts + (Number(globalDiscount) || 0);
    const taxable = Math.max(0, subtotal - discount);
    const tax = round2(taxable * taxRate);
    return {
      subtotal: round2(subtotal),
      discount: round2(discount),
      tax,
      total: round2(taxable + tax),
      units: items.reduce((acc, item) => acc + item.quantity, 0),
    };
  }, [items, globalDiscount, taxRate]);

  const quantities = useMemo(
    () => Object.fromEntries(items.map(item => [item.product.id, item.quantity])),
    [items]
  );

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
    find: productId => itemsRef.current.find(item => item.product.id === productId),
  };
}
