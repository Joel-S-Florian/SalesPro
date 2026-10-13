import React, { useState } from 'react';
import { Store, Lock, Unlock, Star } from 'lucide-react';
import Modal from './Modal';
import { printZReport } from '../utils/zReportPdf';
import SmartSelect from './ui/SmartSelect';
import DenominationCounter from './pos/DenominationCounter';
import { sumBreakdown } from '../utils/cashChange';

const inputClass =
  'w-full px-3 py-2 border border-slate-200 dark:border-slate-800 rounded-lg bg-transparent text-xs outline-none focus:ring-1 focus:ring-indigo-500';

const money = value =>
  `$${Number(value || 0).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * Barra del POS: selección de caja y apertura/cierre de turno.
 * `shiftState` es lo que devuelve useShift().
 */
export default function ShiftBar({ shiftState, requireOpenShift }) {
  const {
    terminals,
    terminalId,
    defaultTerminalId,
    shift,
    selectTerminal,
    makeDefault,
    openShift,
    closeShift,
    refreshShift,
  } = shiftState;

  const [mode, setMode] = useState(null); // 'open' | 'close' | null
  const [amount, setAmount] = useState('');
  const [count, setCount] = useState({}); // billetes y monedas con los que abre la caja (opcional)
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (terminals.length === 0) {
    return requireOpenShift ? (
      <div className="bg-amber-50 border border-amber-200 text-amber-800 text-xs rounded-lg px-4 py-2">
        Se requiere una caja para vender y no tiene ninguna asignada. Pida a un administrador que la configure.
      </div>
    ) : null;
  }

  const ownsShift = shift?.ownedByMe;
  const summary = shift?.summary;
  const expectedCash = shift ? Number(shift.openingBalance || 0) + Number(summary?.cashSales || 0) : 0;

  const counted = sumBreakdown(count);

  const startMode = next => {
    setMode(next);
    setAmount('');
    setCount({});
    setNotes('');
    setError('');
    if (next === 'close') refreshShift();
  };

  const submit = async e => {
    e.preventDefault();
    try {
      setBusy(true);
      setError('');
      if (mode === 'open') {
        await openShift(counted > 0 ? counted : amount, count);
      } else {
        const closed = await closeShift({ declaredCash: amount, notes: notes.trim() || undefined });
        printZReport(closed);
      }
      setMode(null);
    } catch (err) {
      setError(err.message || 'No se pudo completar la operación');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-xl px-4 py-2.5 shadow-sm flex flex-wrap items-center gap-3 text-xs">
        <Store className="w-4 h-4 text-indigo-500" />
        <SmartSelect
          value={terminalId}
          onChange={e => selectTerminal(e.target.value)}
          aria-label="Caja"
          className="border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5 bg-transparent cursor-pointer"
        >
          <option value="">Seleccione una caja...</option>
          {terminals.map(t => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </SmartSelect>
        {terminalId && (
          <button aria-label={defaultTerminalId === terminalId ? 'Caja predeterminada' : 'Usar como predeterminada'}
            onClick={makeDefault}
            disabled={defaultTerminalId === terminalId}
            title={defaultTerminalId === terminalId ? 'Caja predeterminada' : 'Usar como predeterminada'}
            className="p-1 text-slate-400 hover:text-amber-500 disabled:text-amber-500 cursor-pointer"
          >
            <Star className="w-4 h-4" fill={defaultTerminalId === terminalId ? 'currentColor' : 'none'} />
          </button>
        )}

        {terminalId && (
          <div className="flex items-center gap-2 ml-auto">
            {shift ? (
              <>
                <span className="text-emerald-600 font-semibold">
                  Turno abierto
                  {!ownsShift && ` por ${shift.user?.fullName}`} · {summary?.transactions || 0} ventas ·{' '}
                  {money(summary?.total)}
                </span>
                {ownsShift && (
                  <button
                    onClick={() => startMode('close')}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-rose-600 text-white font-semibold cursor-pointer"
                  >
                    <Lock className="w-3.5 h-3.5" /> Cerrar caja
                  </button>
                )}
              </>
            ) : (
              <>
                <span className="text-slate-400">Sin turno abierto</span>
                <button
                  onClick={() => startMode('open')}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-600 text-white font-semibold cursor-pointer"
                >
                  <Unlock className="w-3.5 h-3.5" /> Abrir turno
                </button>
              </>
            )}
          </div>
        )}
      </div>

      <Modal
        isOpen={!!mode}
        onClose={() => !busy && setMode(null)}
        title={mode === 'open' ? 'Abrir turno de caja' : 'Cerrar caja'}
        maxWidth="sm"
      >
        <form onSubmit={submit} className="space-y-4">
          {mode === 'close' && summary && (
            <div className="text-xs space-y-1 bg-slate-50 dark:bg-slate-800/50 rounded-lg p-3">
              <div className="flex justify-between"><span>Ventas ({summary.transactions})</span><strong>{money(summary.total)}</strong></div>
              <div className="flex justify-between"><span>ITBIS</span><span>{money(summary.tax)}</span></div>
              {Object.entries(summary.byPaymentMethod || {}).map(([method, total]) => (
                <div key={method} className="flex justify-between"><span>{method}</span><span>{money(total)}</span></div>
              ))}
              <div className="flex justify-between border-t border-slate-200 dark:border-slate-700 pt-1 mt-1">
                <span>Efectivo inicial</span><span>{money(shift.openingBalance)}</span>
              </div>
              <div className="flex justify-between font-semibold"><span>Efectivo esperado</span><span>{money(expectedCash)}</span></div>
            </div>
          )}
          <div className="space-y-1.5">
            <label htmlFor="shift-amount" className="block text-xs font-semibold text-slate-600 dark:text-slate-400">
              {mode === 'open' ? 'Efectivo inicial en caja' : 'Efectivo contado en caja *'}
            </label>
            <input
              id="shift-amount"
              type="number"
              min="0"
              step="0.01"
              required={mode === 'close'}
              autoFocus
              value={mode === 'open' && counted > 0 ? counted : amount}
              disabled={mode === 'open' && counted > 0}
              onChange={e => setAmount(e.target.value)}
              className={inputClass}
            />
          </div>
          {mode === 'open' && (
            <details className="rounded-lg border border-slate-100 p-3 dark:border-slate-800" open={counted > 0}>
              <summary className="cursor-pointer text-xs font-semibold text-slate-600 dark:text-slate-300">Contar billetes y monedas (recomendado para la devuelta)</summary>
              <div className="mt-3"><DenominationCounter value={count} onChange={setCount} compact /></div>
            </details>
          )}
          {mode === 'close' && (
            <div className="space-y-1.5">
              <label htmlFor="shift-notes" className="block text-xs font-semibold text-slate-600 dark:text-slate-400">
                Notas (opcional)
              </label>
              <textarea id="shift-notes" rows={2} maxLength={500} value={notes} onChange={e => setNotes(e.target.value)} className={inputClass} />
            </div>
          )}
          {error && <p className="text-xs text-rose-500">{error}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setMode(null)} className="px-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 cursor-pointer">
              Cancelar
            </button>
            <button type="submit" disabled={busy} className="px-4 py-1.5 text-xs rounded-lg bg-indigo-600 text-white disabled:opacity-50 cursor-pointer">
              {busy ? 'Procesando...' : mode === 'open' ? 'Abrir turno' : 'Cerrar y generar reporte'}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}
