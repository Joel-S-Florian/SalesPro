/**
 * Lógica pura de lotes (sin base de datos): estado por vencimiento, descuento y reparto FEFO.
 * Las fechas de vencimiento se guardan a las 12:00 UTC del día indicado, así el día es el mismo en hora dominicana.
 */
import { dayKey, diffDays } from '../../shared/utils/tz.js';

export const DEFAULT_BATCH_NUMBER = 'SIN-LOTE';

/** 'YYYY-MM-DD' -> Date (12:00 UTC). Devuelve null si no es una fecha válida. */
export function parseExpiration(value) {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : new Date(`${dayKey(value)}T12:00:00Z`);
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? null : date;
}

/** Días que faltan para vencer (negativo = vencido, 0 = vence hoy). null si el lote no vence. */
export function daysLeft(expirationDate, now = new Date()) {
  if (!expirationDate) return null;
  return diffDays(dayKey(now), dayKey(expirationDate));
}

/** EXPIRED | RED | YELLOW | OK | NO_EXPIRY según los umbrales de la empresa. */
export function batchStatus(expirationDate, perishable, now = new Date()) {
  const days = daysLeft(expirationDate, now);
  if (days === null) return 'NO_EXPIRY';
  if (days < 0) return 'EXPIRED';
  if (days <= perishable.redThresholdDays) return 'RED';
  if (days <= perishable.yellowThresholdDays) return 'YELLOW';
  return 'OK';
}

/** Descuento (%) por cercanía de vencimiento: aplica la regla más estricta que cubre los días restantes. */
export function discountPercentFor(days, perishable) {
  if (!perishable?.autoDiscountEnabled || days === null || days < 0) return 0;
  const applicable = (perishable.discountRules || []).filter(rule => days <= rule.daysRemaining);
  if (!applicable.length) return 0;
  return applicable.reduce((best, rule) => (rule.daysRemaining < best.daysRemaining ? rule : best)).discountPercent;
}

const EPS = 0.004; // las cantidades tienen 2 decimales: lo menor es ruido de coma flotante

/** FEFO: primero vence, primero sale; los lotes sin fecha van al final. */
export function sortFefo(batches) {
  return [...batches].sort((a, b) => {
    const ax = a.expirationDate ? new Date(a.expirationDate).getTime() : Infinity;
    const bx = b.expirationDate ? new Date(b.expirationDate).getTime() : Infinity;
    if (ax !== bx) return ax < bx ? -1 : 1;
    return new Date(a.createdAt || 0) - new Date(b.createdAt || 0);
  });
}

/**
 * Reparte `quantity` entre los lotes en orden FEFO.
 * Devuelve { allocations: [{ batchId, quantity, expirationDate }], missing }; missing > 0 si no alcanza el stock.
 * Con allowExpired = false los lotes vencidos no se usan.
 */
export function allocateFefo(batches, quantity, { allowExpired = false, now = new Date() } = {}) {
  let remaining = Math.round(quantity * 100) / 100;
  const allocations = [];
  for (const batch of sortFefo(batches)) {
    if (remaining <= 0) break;
    if (batch.currentStock <= EPS) continue;
    if (!allowExpired && batch.expirationDate && daysLeft(batch.expirationDate, now) < 0) continue;
    const take = Math.round(Math.min(batch.currentStock, remaining) * 100) / 100;
    allocations.push({ batchId: batch.id, quantity: take, expirationDate: batch.expirationDate || null });
    remaining = Math.round((remaining - take) * 100) / 100;
  }
  return { allocations, missing: remaining > EPS ? remaining : 0 };
}
