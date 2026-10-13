import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Banknote, Loader2 } from 'lucide-react';
import Modal from '../Modal';
import DenominationCounter from './DenominationCounter';
import { api } from '../../services/api';
import { addBreakdowns, changeDue, greedyBreakdown, makeChange, sumBreakdown } from '../../utils/cashChange';

const money = value => `RD$ ${Number(value || 0).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const piecesText = pieces =>
  Object.entries(pieces)
    .sort((a, b) => Number(b[0]) - Number(a[0]))
    .map(([denom, count]) => `${count} × ${Number(denom).toLocaleString('es-DO')}`)
    .join(' + ');

/**
 * Cobro en efectivo con devuelta: el cajero toca los billetes y monedas que recibe; el sistema calcula la devuelta y propone
 * qué entregar usando lo que hay en la caja (lo que más hay, sin agotar lo que escasea). La devuelta se puede ajustar a mano.
 * `onConfirm({ received, change })` entrega los desgloses; `onCancel()` vuelve al carrito.
 */
export default function CashTenderModal({ isOpen, total, shiftId, onConfirm, onCancel }) {
  const [drawer, setDrawer] = useState(null); // { counts, complete } | null (desconocida)
  const [loading, setLoading] = useState(false);
  const [received, setReceived] = useState({});
  const [manualChange, setManualChange] = useState(null);
  const [typed, setTyped] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setReceived({});
    setManualChange(null);
    setTyped('');
    setDrawer(null);
    if (!shiftId) return;
    setLoading(true);
    api.cashier
      .drawer(shiftId)
      .then(setDrawer)
      .catch(() => setDrawer(null))
      .finally(() => setLoading(false));
  }, [isOpen, shiftId]);

  const receivedTotal = sumBreakdown(received);
  const due = changeDue(receivedTotal, total);
  // Lo recibido también sirve para devolver
  const available = useMemo(() => (drawer ? addBreakdowns(drawer.counts, received) : null), [drawer, received]);
  const suggestion = useMemo(() => (due.insufficient ? null : makeChange(due.due, available)), [due.due, due.insufficient, available]);

  // Si cambia lo recibido, se vuelve a la sugerencia
  useEffect(() => setManualChange(null), [receivedTotal]);

  const change = manualChange ?? suggestion?.pieces ?? {};
  const changeTotal = sumBreakdown(change);
  const changeOk = !due.insufficient && changeTotal === due.due;
  const canConfirm = receivedTotal > 0 && changeOk;

  const applyTyped = value => {
    setTyped(value);
    const amount = Math.round(Number(value));
    setReceived(amount > 0 ? greedyBreakdown(amount) : {});
  };

  return (
    <Modal isOpen={isOpen} onClose={onCancel} title="Cobro en efectivo" maxWidth="lg">
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-3 text-center">
          <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800/50">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Total</p>
            <p className="font-mono text-lg font-bold tabular-nums">{money(total)}</p>
          </div>
          <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800/50">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Recibido</p>
            <p className="font-mono text-lg font-bold tabular-nums">{money(receivedTotal)}</p>
          </div>
          <div className={`rounded-xl p-3 ${due.insufficient ? 'bg-rose-50 dark:bg-rose-950/30' : 'bg-emerald-50 dark:bg-emerald-950/30'}`}>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{due.insufficient ? 'Falta' : 'Devuelta'}</p>
            <p className={`font-mono text-lg font-bold tabular-nums ${due.insufficient ? 'text-rose-600' : 'text-emerald-700 dark:text-emerald-400'}`}>
              {money(due.insufficient ? Math.abs(due.exact) : due.due)}
            </p>
          </div>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between gap-3">
            <h4 className="text-xs font-bold text-slate-700 dark:text-slate-200">Lo que recibe</h4>
            <div className="flex items-center gap-2">
              <label htmlFor="cash-typed" className="text-[11px] text-slate-500">Monto</label>
              <input id="cash-typed" type="number" min="0" step="1" inputMode="numeric" value={typed} onChange={e => applyTyped(e.target.value)} placeholder="Ej. 2000" className="h-8 w-28 rounded-lg border border-slate-200 bg-transparent px-2 text-right font-mono text-xs outline-none focus:border-indigo-400 dark:border-slate-700" />
              <button type="button" onClick={() => { setTyped(''); setReceived(greedyBreakdown(Math.ceil(total))); }} className="h-8 cursor-pointer rounded-lg border border-slate-200 px-2 text-[11px] font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300">
                Exacto
              </button>
            </div>
          </div>
          <DenominationCounter value={received} onChange={next => { setTyped(''); setReceived(next); }} compact />
        </div>

        {!due.insufficient && due.due > 0 && (
          <div className="space-y-2 rounded-xl border border-emerald-200 p-3 dark:border-emerald-900/50">
            <div className="flex items-center justify-between">
              <h4 className="flex items-center gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-200">
                <Banknote className="h-4 w-4" /> Devuelta sugerida
                {loading && <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" />}
              </h4>
              {manualChange && (
                <button type="button" onClick={() => setManualChange(null)} className="cursor-pointer text-[11px] font-semibold text-indigo-600">Volver a la sugerencia</button>
              )}
            </div>
            <p className="text-sm font-semibold tabular-nums text-slate-900 dark:text-white">{piecesText(change) || '—'}</p>
            {suggestion && !suggestion.exact && !manualChange && (
              <p role="alert" className="flex gap-1.5 text-[11px] text-amber-700 dark:text-amber-400">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                La caja no tiene para dar {money(due.due)} exactos (faltan {money(suggestion.shortfall)}). Pida otra combinación al cliente o ajuste la devuelta abajo.
              </p>
            )}
            {drawer && !drawer.complete && (
              <p className="text-[11px] text-slate-400">
                {drawer.hasOpeningCount ? 'Hubo movimientos de efectivo sin registrar: la sugerencia puede no coincidir con la caja.' : 'Este turno se abrió sin contar billetes y monedas; registre el conteo al abrir para sugerencias exactas.'}
              </p>
            )}
            {!shiftId && <p className="text-[11px] text-slate-400">Sin turno abierto no se conoce el contenido de la caja: la sugerencia usa la menor cantidad de piezas.</p>}
            <details className="text-xs">
              <summary className="cursor-pointer font-semibold text-slate-600 dark:text-slate-300">Ajustar la devuelta a mano</summary>
              <div className="mt-2">
                <DenominationCounter value={change} onChange={setManualChange} limits={available} compact />
                {!changeOk && <p className="mt-1 text-[11px] text-rose-600">La devuelta debe sumar {money(due.due)} (suma {money(changeTotal)}).</p>}
              </div>
            </details>
          </div>
        )}
        {!due.insufficient && due.rounding !== 0 && due.due > 0 && (
          <p className="text-[11px] text-slate-400">Los centavos ({money(Math.abs(due.rounding))}) se redondean a pesos enteros en la devuelta.</p>
        )}

        <div className="flex gap-3 pt-1">
          <button type="button" onClick={onCancel} className="w-full cursor-pointer rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 dark:border-slate-800 dark:text-slate-300">
            Cancelar
          </button>
          <button type="button" disabled={!canConfirm} onClick={() => onConfirm({ received, change })} className="w-full cursor-pointer rounded-lg bg-indigo-600 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:bg-slate-300 disabled:text-slate-500 dark:disabled:bg-slate-800">
            Confirmar cobro
          </button>
        </div>
      </div>
    </Modal>
  );
}
