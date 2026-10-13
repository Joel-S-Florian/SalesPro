import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import SmartSelect from './ui/SmartSelect';

export const PAGE_SIZES = [10, 20, 50];

/** Páginas visibles con elipsis: 1 … 4 5 [6] 7 8 … 20 */
function pageWindow(current, total) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages = new Set([1, total, current, current - 1, current + 1]);
  if (current <= 3) [2, 3, 4].forEach(p => pages.add(p));
  if (current >= total - 2) [total - 1, total - 2, total - 3].forEach(p => pages.add(p));
  const sorted = [...pages].filter(p => p >= 1 && p <= total).sort((a, b) => a - b);
  return sorted.flatMap((p, i) => (i > 0 && p - sorted[i - 1] > 1 ? ['…', p] : [p]));
}

const pageButton =
  'flex h-8 min-w-8 items-center justify-center rounded-md px-2 text-[13px] font-medium tabular-nums [@media(pointer:coarse)]:h-10 [@media(pointer:coarse)]:min-w-10 cursor-pointer';

/**
 * Pie de tabla común a todos los módulos: rango mostrado, navegación por páginas y tamaño de página.
 * Se oculta si todo cabe en una sola página y el tamaño ya es el mínimo.
 */
export default function Pagination({ page, pageSize, total, onPageChange, onPageSizeChange, noun = 'registros' }) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (total === 0) return null;
  if (totalPages === 1 && pageSize === PAGE_SIZES[0] && total <= PAGE_SIZES[0]) {
    return (
      <div className="border-t border-slate-100 px-4 py-3 text-[13px] text-slate-500 dark:border-slate-800 dark:text-slate-400">
        {total} {noun}
      </div>
    );
  }

  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <nav
      aria-label="Paginación"
      className="flex flex-col gap-3 border-t border-slate-100 px-4 py-3 text-[13px] text-slate-500 dark:border-slate-800 dark:text-slate-400 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex items-center gap-3">
        <span className="tabular-nums">
          {from}–{to} de {total} {noun}
        </span>
        {onPageSizeChange && (
          <label className="flex items-center gap-1.5">
            <span className="sr-only sm:not-sr-only">Por página</span>
            <SmartSelect
              value={pageSize}
              onChange={e => onPageSizeChange(Number(e.target.value))}
              aria-label="Filas por página"
              className="h-8 rounded-md border border-slate-200 bg-transparent px-1.5 text-[13px] text-slate-700 dark:border-slate-700 dark:text-slate-300 cursor-pointer"
            >
              {PAGE_SIZES.map(size => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </SmartSelect>
          </label>
        )}
      </div>

      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          aria-label="Página anterior"
          className={`${pageButton} text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40 dark:text-slate-300 dark:hover:bg-slate-800`}
        >
          <ChevronLeft className="h-4 w-4" />
        </button>

        {pageWindow(page, totalPages).map((item, index) =>
          item === '…' ? (
            <span key={`gap-${index}`} className="px-1 text-slate-400" aria-hidden="true">
              …
            </span>
          ) : (
            <button
              key={item}
              type="button"
              onClick={() => onPageChange(item)}
              aria-label={`Página ${item}`}
              aria-current={item === page ? 'page' : undefined}
              className={`${pageButton} ${
                item === page
                  ? 'bg-indigo-600 text-white'
                  : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
              }`}
            >
              {item}
            </button>
          )
        )}

        <button
          type="button"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          aria-label="Página siguiente"
          className={`${pageButton} text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40 dark:text-slate-300 dark:hover:bg-slate-800`}
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </nav>
  );
}
