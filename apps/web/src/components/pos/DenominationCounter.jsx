import React from 'react';
import { Minus, Plus } from 'lucide-react';
import { BILLS, COINS, sumBreakdown } from '../../utils/cashChange';

const money = value => `RD$ ${Number(value || 0).toLocaleString('es-DO', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

/**
 * Cuenta de billetes y monedas con botones + / −. `value` es { [denominación]: cantidad }.
 * `limits` (opcional) impide pasar de lo que hay disponible (p. ej. al elegir la devuelta).
 */
export default function DenominationCounter({ value = {}, onChange, limits = null, compact = false }) {
  const set = (denom, count) => {
    const next = { ...value };
    if (count > 0) next[denom] = count;
    else delete next[denom];
    onChange(next);
  };

  const row = (title, denominations) => (
    <div>
      <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">{title}</p>
      <div className={`grid gap-2 ${compact ? 'grid-cols-3' : 'grid-cols-2 sm:grid-cols-3'}`}>
        {denominations.map(denom => {
          const count = Number(value[denom] || 0);
          const max = limits ? Number(limits[denom] || 0) : Infinity;
          return (
            <div
              key={denom}
              className={`flex items-center justify-between rounded-lg border px-2 py-1.5 ${count > 0 ? 'border-indigo-300 bg-indigo-50 dark:border-indigo-800 dark:bg-indigo-950/30' : 'border-slate-200 dark:border-slate-700'}`}
            >
              <span className="text-xs font-semibold tabular-nums text-slate-700 dark:text-slate-200">{money(denom)}</span>
              <span className="flex items-center gap-1">
                <button type="button" aria-label={`Quitar ${money(denom)}`} disabled={count === 0} onClick={() => set(denom, count - 1)} className="flex h-6 w-6 cursor-pointer items-center justify-center rounded-md text-slate-500 hover:bg-white disabled:opacity-30 dark:hover:bg-slate-800">
                  <Minus className="h-3.5 w-3.5" />
                </button>
                <span className="w-6 text-center text-xs font-bold tabular-nums" aria-live="polite">{count}</span>
                <button type="button" aria-label={`Agregar ${money(denom)}`} disabled={count >= max} onClick={() => set(denom, count + 1)} className="flex h-6 w-6 cursor-pointer items-center justify-center rounded-md text-indigo-600 hover:bg-white disabled:opacity-30 dark:hover:bg-slate-800">
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );

  return (
    <div className="space-y-3">
      {row('Billetes', BILLS)}
      {row('Monedas', COINS)}
      <p className="text-right text-xs text-slate-500">
        Total: <strong className="tabular-nums text-slate-800 dark:text-slate-100">{money(sumBreakdown(value))}</strong>
      </p>
    </div>
  );
}
