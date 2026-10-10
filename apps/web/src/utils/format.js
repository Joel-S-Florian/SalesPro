const MONEY_OPTIONS = { minimumFractionDigits: 2, maximumFractionDigits: 2 };

/** Importe con separadores locales: 1234.5 -> "$1,234.50". */
export function money(value) {
  return `$${Number(value || 0).toLocaleString('es-DO', MONEY_OPTIONS)}`;
}

/** Fecha y hora cortas en formato local. */
export function dateTime(value) {
  return value
    ? new Date(value).toLocaleString('es-DO', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '—';
}
