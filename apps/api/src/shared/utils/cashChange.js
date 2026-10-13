/**
 * Devuelta (cambio) por denominaciones. Lógica pura, sin base de datos.
 * Hay una copia para el navegador en apps/web/src/utils/cashChange.js: mantenga ambas iguales.
 *
 * Billetes: 2000, 1000, 500, 200, 100, 50. Monedas: 25, 10, 5, 1.
 * Un «desglose» es un objeto { [denominación]: cantidad }, p. ej. { 1000: 1, 50: 2 }.
 */

export const BILLS = [2000, 1000, 500, 200, 100, 50];
export const COINS = [25, 10, 5, 1];
export const DENOMINATIONS = [...BILLS, ...COINS];

/** Por encima de esto no se calcula el óptimo (la tabla crecería demasiado): se usa el método simple. */
const MAX_OPTIMAL_AMOUNT = 20000;
/** Disponibilidad que se asume cuando no se conoce el contenido de la caja. */
const UNKNOWN_AVAILABLE = 99;
/** Cuánto pesa agotar lo que escasea frente a usar más piezas de lo que sobra. */
const SCARCITY_WEIGHT = 2;

export const isDenomination = value => DENOMINATIONS.includes(Number(value));

/** Total en pesos de un desglose. */
export const sumBreakdown = breakdown =>
  Object.entries(breakdown || {}).reduce((sum, [denom, count]) => sum + Number(denom) * Number(count || 0), 0);

/** Cantidad de piezas (billetes + monedas) de un desglose. */
export const countPieces = breakdown => Object.values(breakdown || {}).reduce((sum, count) => sum + Number(count || 0), 0);

/**
 * Normaliza un desglose: solo denominaciones válidas y cantidades enteras positivas.
 * Devuelve { ok, breakdown, error }.
 */
export function normalizeBreakdown(raw) {
  if (raw === null || raw === undefined) return { ok: true, breakdown: {} };
  if (typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, error: 'El desglose de billetes y monedas no es válido' };
  const breakdown = {};
  for (const [key, value] of Object.entries(raw)) {
    const count = Number(value);
    if (!isDenomination(key)) return { ok: false, error: `Denominación desconocida: ${key}` };
    if (!Number.isInteger(count) || count < 0 || count > 100000) return { ok: false, error: `Cantidad inválida de ${key}` };
    if (count > 0) breakdown[Number(key)] = count;
  }
  return { ok: true, breakdown };
}

/** Suma desgloses (p. ej. apertura + cobros − devueltas). Las cantidades pueden quedar negativas si se pasa `allowNegative`. */
export function addBreakdowns(base, plus, minus, { allowNegative = false } = {}) {
  const result = {};
  for (const denom of DENOMINATIONS) {
    const value = Number((base || {})[denom] || 0) + Number((plus || {})[denom] || 0) - Number((minus || {})[denom] || 0);
    const final = allowNegative ? value : Math.max(0, value);
    if (final !== 0) result[denom] = final;
  }
  return result;
}

/** Piezas que costaría dar `amount` con el método simple (la denominación más grande primero), sin límites de existencia. */
export function greedyBreakdown(amount) {
  let rest = Math.max(0, Math.round(amount));
  const pieces = {};
  for (const denom of DENOMINATIONS) {
    const count = Math.floor(rest / denom);
    if (count > 0) {
      pieces[denom] = count;
      rest -= count * denom;
    }
  }
  return pieces;
}

/**
 * Devuelta eficiente: reparte `amount` (pesos enteros) usando lo que HAY en caja y sin agotar lo que escasea.
 *
 * @param {number} amount        pesos a devolver
 * @param {object|null} drawer   existencia por denominación; null = desconocida (se asume abundante)
 * @returns {{ exact: boolean, pieces: object, given: number, shortfall: number, pieceCount: number }}
 *   exact: se pudo dar el monto completo; si no, `pieces` es lo más cercano posible por debajo y `shortfall` lo que falta.
 *
 * Criterio: minimiza un costo por pieza que crece al usar muchas de la misma denominación respecto de las que hay
 * (la pieza j de una denominación con `a` disponibles cuesta 1 + 2·j/(a+1)). Así devuelve de lo que más hay, usa pocas piezas
 * y no deja la caja sin billetes o monedas que escasean.
 */
export function makeChange(amount, drawer = null) {
  const target = Math.max(0, Math.round(amount));
  if (target === 0) return { exact: true, pieces: {}, given: 0, shortfall: 0, pieceCount: 0 };

  const availableOf = denom => (drawer ? Math.max(0, Math.floor(Number(drawer[denom] || 0))) : UNKNOWN_AVAILABLE);

  if (target > MAX_OPTIMAL_AMOUNT) {
    const pieces = greedyBreakdown(target);
    return { exact: true, pieces, given: target, shortfall: 0, pieceCount: countPieces(pieces) };
  }

  // Cada pieza utilizable es un «objeto» con su valor y su costo marginal
  const items = [];
  for (const denom of DENOMINATIONS) {
    const available = availableOf(denom);
    const usable = Math.min(available, Math.floor(target / denom));
    for (let j = 1; j <= usable; j += 1) items.push({ denom, cost: 1 + (SCARCITY_WEIGHT * j) / (available + 1) });
  }

  const width = target + 1;
  const best = new Float64Array(width).fill(Infinity);
  best[0] = 0;
  const took = new Uint8Array(items.length * width);
  items.forEach((item, index) => {
    for (let v = target; v >= item.denom; v -= 1) {
      const candidate = best[v - item.denom] + item.cost;
      if (candidate < best[v] - 1e-12) {
        best[v] = candidate;
        took[index * width + v] = 1;
      }
    }
  });

  // Si no se puede dar el monto exacto, se da lo más cercano por debajo
  let value = target;
  while (value > 0 && best[value] === Infinity) value -= 1;

  const pieces = {};
  let v = value;
  for (let index = items.length - 1; index >= 0 && v > 0; index -= 1) {
    if (took[index * width + v]) {
      pieces[items[index].denom] = (pieces[items[index].denom] || 0) + 1;
      v -= items[index].denom;
    }
  }
  return { exact: value === target, pieces, given: value, shortfall: target - value, pieceCount: countPieces(pieces) };
}

/**
 * Cuánto hay que devolver: recibido − total, a pesos enteros (los centavos no se devuelven en monedas).
 * `rounding` es la diferencia entre el cambio exacto y el entregado (positiva = el cliente deja unos centavos).
 */
export function changeDue(received, total) {
  const exact = Math.round((Number(received) - Number(total)) * 100) / 100;
  if (exact < 0) return { due: 0, exact, rounding: 0, insufficient: true };
  const due = Math.round(exact);
  return { due, exact, rounding: Math.round((exact - due) * 100) / 100, insufficient: false };
}
