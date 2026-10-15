/** Serialización de filas para las exportaciones (CSV para Excel y JSON). */

const FORMULA_START = /^[=+\-@\t\r]/;

/** Un valor como celda de CSV. Los textos que empiezan como fórmula de Excel (= + - @) se prefijan con ' para que no se ejecuten. */
export function csvCell(value) {
  if (value === null || value === undefined) return '';
  let text;
  if (value instanceof Date) text = value.toISOString();
  else if (typeof value === 'bigint') text = value.toString();
  else if (typeof value === 'object') text = JSON.stringify(value);
  else text = String(value);
  if (typeof value === 'string' && FORMULA_START.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export const csvLine = (columns, row) => columns.map(column => csvCell(row[column])).join(',') + '\r\n';

/** Encabezado con BOM para que Excel abra bien las tildes. */
export const csvHeader = columns => '﻿' + columns.join(',') + '\r\n';

const jsonReplacer = (key, value) => (typeof value === 'bigint' ? value.toString() : value);
export const jsonRow = (columns, row) => JSON.stringify(Object.fromEntries(columns.map(column => [column, row[column] ?? null])), jsonReplacer);
