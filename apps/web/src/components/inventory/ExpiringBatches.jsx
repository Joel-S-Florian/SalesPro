import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Loader2, PackageMinus } from 'lucide-react';
import { api } from '../../services/api';
import ExpiryBadge from './ExpiryBadge';

const FILTERS = [
  { id: 'ALL', label: 'Todos' },
  { id: 'EXPIRED', label: 'Vencidos' },
  { id: 'RED', label: 'Críticos' },
  { id: 'YELLOW', label: 'Por vencer' },
];

const money = n => `$${Number(n || 0).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const dateLabel = value => (value ? new Date(value).toLocaleDateString('es-DO', { timeZone: 'UTC' }) : '-');

/** Pestaña "Lotes por vencer" de Inventario: vencidos, críticos y por vencer, con baja rápida. */
export default function ExpiringBatches({ reloadKey, onWriteOff }) {
  const [status, setStatus] = useState('ALL');
  const [state, setState] = useState({ loading: true, data: [], summary: null, thresholds: null, error: null });

  const load = useCallback(async () => {
    try {
      setState(prev => ({ ...prev, loading: true, error: null }));
      const result = await api.inventory.expiring({ status, limit: 100 });
      setState({ loading: false, data: result.data, summary: result.summary, thresholds: result.thresholds, error: null });
    } catch (err) {
      setState(prev => ({ ...prev, loading: false, error: err.message || 'No se pudieron cargar los lotes' }));
    }
  }, [status]);

  useEffect(() => {
    load();
  }, [load, reloadKey]);

  const { summary } = state;
  const tiles = summary && [
    { label: 'Vencidos', value: summary.expired, tone: 'text-rose-600' },
    { label: 'Críticos', value: summary.red, tone: 'text-rose-500' },
    { label: 'Por vencer', value: summary.yellow, tone: 'text-amber-600' },
    { label: 'Costo en riesgo', value: money(summary.valueAtRisk), tone: 'text-slate-800 dark:text-slate-100' },
  ];

  return (
    <div className="space-y-4" id="expiring-batches">
      {tiles && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {tiles.map(tile => (
            <div key={tile.label} className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <p className="font-mono text-[10px] uppercase tracking-wider text-slate-400">{tile.label}</p>
              <p className={`mt-1 text-xl font-bold tabular-nums ${tile.tone}`}>{tile.value}</p>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filtrar por estado">
        {FILTERS.map(filter => (
          <button
            key={filter.id}
            type="button"
            onClick={() => setStatus(filter.id)}
            aria-pressed={status === filter.id}
            className={`cursor-pointer rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
              status === filter.id ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
            }`}
          >
            {filter.label}
          </button>
        ))}
        {state.thresholds && (
          <span className="ml-auto text-[11px] text-slate-400">
            Amarillo: {state.thresholds.yellow} d · Rojo: {state.thresholds.red} d (se ajusta en Configuración)
          </span>
        )}
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-100 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-600 dark:text-slate-400">
            <thead className="bg-slate-50 font-mono uppercase tracking-wider text-slate-400 dark:bg-slate-800/40">
              <tr>
                <th className="px-6 py-4">Producto</th>
                <th className="px-6 py-4">Lote</th>
                <th className="px-6 py-4">Vence</th>
                <th className="px-6 py-4 text-center">Estado</th>
                <th className="px-6 py-4 text-center">Existencias</th>
                <th className="px-6 py-4 text-center">Descuento</th>
                <th className="px-6 py-4" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {state.loading && state.data.length === 0 && (
                <tr><td colSpan={7} className="py-10 text-center text-slate-400"><Loader2 className="mx-auto h-4 w-4 animate-spin" /></td></tr>
              )}
              {state.data.map(batch => (
                <tr key={batch.id} className="transition-colors hover:bg-slate-50/50 dark:hover:bg-slate-800/25">
                  <td className="px-6 py-4">
                    <div className="font-semibold text-slate-800 dark:text-slate-200">{batch.product.name}</div>
                    <div className="font-mono text-[10px] text-slate-400">{batch.product.code}</div>
                  </td>
                  <td className="px-6 py-4 font-mono">{batch.batchNumber}</td>
                  <td className="px-6 py-4 font-mono">{dateLabel(batch.expirationDate)}</td>
                  <td className="px-6 py-4 text-center"><ExpiryBadge status={batch.status} daysLeft={batch.daysLeft} /></td>
                  <td className="px-6 py-4 text-center font-mono font-semibold">{batch.currentStock} uds.</td>
                  <td className="px-6 py-4 text-center font-mono">{batch.discountPercent ? `${batch.discountPercent}%` : '-'}</td>
                  <td className="px-6 py-4 text-right">
                    <button
                      type="button"
                      onClick={() => onWriteOff(batch)}
                      className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-[11px] font-semibold text-slate-600 transition-colors hover:border-rose-300 hover:text-rose-600 dark:border-slate-700 dark:text-slate-300"
                    >
                      <PackageMinus className="h-3.5 w-3.5" /> Dar de baja
                    </button>
                  </td>
                </tr>
              ))}
              {!state.loading && state.data.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-10 text-center font-mono text-slate-400">
                    {state.error ? (
                      <span className="inline-flex items-center gap-1 text-rose-500"><AlertTriangle className="h-4 w-4" /> {state.error}</span>
                    ) : (
                      'Sin lotes en riesgo.'
                    )}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
