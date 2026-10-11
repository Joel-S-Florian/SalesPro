/**
 * Zona horaria de negocio: República Dominicana (America/Santo_Domingo).
 * UTC-4 todo el año, sin horario de verano, por lo que un desfase fijo es exacto y no depende
 * de la zona del servidor (en la nube suele ser UTC).
 */
export const BUSINESS_TZ = 'America/Santo_Domingo';
export const TZ_OFFSET_HOURS = -4;
const TZ_OFFSET_MS = TZ_OFFSET_HOURS * 3600 * 1000;
const DAY_MS = 86400000;

/** Fecha "de pared" en RD: sus campos UTC (getUTC*) son los de la hora local dominicana. */
export function toLocal(date) {
  return new Date(new Date(date).getTime() + TZ_OFFSET_MS);
}

const pad = n => String(n).padStart(2, '0');

/** YYYY-MM-DD en hora dominicana. */
export function dayKey(date) {
  const d = toLocal(date);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** YYYY-MM en hora dominicana. */
export function monthKey(date) {
  return dayKey(date).slice(0, 7);
}

/** Hora (0-23) en hora dominicana. */
export function hourOf(date) {
  return toLocal(date).getUTCHours();
}

/** Día de la semana en hora dominicana, lunes = 0 … domingo = 6. */
export function weekdayOf(date) {
  return (toLocal(date).getUTCDay() + 6) % 7;
}

/** Lunes (YYYY-MM-DD) de la semana a la que pertenece la fecha. */
export function weekKey(date) {
  const d = toLocal(date);
  const monday = new Date(d.getTime() - weekdayOf(date) * DAY_MS);
  return `${monday.getUTCFullYear()}-${pad(monday.getUTCMonth() + 1)}-${pad(monday.getUTCDate())}`;
}

export function startOfDayUtc(dayStr) {
  return new Date(`${dayStr}T00:00:00${TZ_OFFSET_HOURS < 0 ? '-' : '+'}${pad(Math.abs(TZ_OFFSET_HOURS))}:00`);
}

export function endOfDayUtc(dayStr) {
  return new Date(startOfDayUtc(dayStr).getTime() + DAY_MS - 1);
}

/** Suma días a un YYYY-MM-DD. */
export function addDays(dayStr, days) {
  const base = new Date(`${dayStr}T00:00:00Z`);
  return new Date(base.getTime() + days * DAY_MS).toISOString().slice(0, 10);
}

export function diffDays(fromDay, toDay) {
  return Math.round((new Date(`${toDay}T00:00:00Z`) - new Date(`${fromDay}T00:00:00Z`)) / DAY_MS);
}

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Rango de reporte a partir de `from`/`to` (YYYY-MM-DD). Sin valores: mes en curso hasta hoy.
 * Devuelve el rango y el período anterior de la misma duración, para comparar.
 */
export function resolveRange({ from, to } = {}) {
  const today = dayKey(new Date());
  const toDay = DAY_RE.test(to || '') ? to : today;
  const fromDay = DAY_RE.test(from || '') ? from : `${toDay.slice(0, 8)}01`;
  const [start, end] = fromDay <= toDay ? [fromDay, toDay] : [toDay, fromDay];
  const days = diffDays(start, end) + 1;
  const prevEnd = addDays(start, -1);
  const prevStart = addDays(prevEnd, -(days - 1));
  return {
    from: start,
    to: end,
    days,
    gte: startOfDayUtc(start),
    lte: endOfDayUtc(end),
    previous: { from: prevStart, to: prevEnd, gte: startOfDayUtc(prevStart), lte: endOfDayUtc(prevEnd) },
  };
}
