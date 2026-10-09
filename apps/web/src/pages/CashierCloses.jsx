import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import { Loader2, Printer } from 'lucide-react';
import { printZReport } from '../utils/zReportPdf';

const money = value =>
  `$${Number(value || 0).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const dateTime = value =>
  value
    ? new Date(value).toLocaleString('es-DO', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '—';

export default function CashierCloses() {
  const [shifts, setShifts] = useState([]);
  const [terminals, setTerminals] = useState([]);
  const [terminalId, setTerminalId] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.terminals.list().then(setTerminals).catch(() => setTerminals([]));
  }, []);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const result = await api.cashier.list({
          terminalId: terminalId || undefined,
          status: status || undefined,
          limit: 100,
        });
        setShifts(result?.data || []);
      } catch (err) {
        setError(err.message || 'Error al cargar cierres de caja');
      } finally {
        setLoading(false);
      }
    })();
  }, [terminalId, status]);

  const printShift = async shift => {
    try {
      printZReport(await api.cashier.get(shift.id));
    } catch (err) {
      alert(err.message || 'No se pudo generar el reporte');
    }
  };

  return (
    <div className="space-y-4" id="cashier-closes-view">
      <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-xl p-4 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h3 className="font-semibold text-slate-800 dark:text-slate-100">Cierres de caja</h3>
          <p className="text-xs text-slate-400">Turnos abiertos y cerrados por caja, con diferencias de efectivo.</p>
        </div>
        <div className="flex gap-2">
          <select
            value={terminalId}
            onChange={e => setTerminalId(e.target.value)}
            aria-label="Filtrar por caja"
            className="text-xs border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-2 bg-transparent cursor-pointer"
          >
            <option value="">Todas las cajas</option>
            {terminals.map(t => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
          <select
            value={status}
            onChange={e => setStatus(e.target.value)}
            aria-label="Filtrar por estado"
            className="text-xs border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-2 bg-transparent cursor-pointer"
          >
            <option value="">Todos</option>
            <option value="OPEN">Abiertos</option>
            <option value="CLOSED">Cerrados</option>
          </select>
        </div>
      </div>

      {error && <p className="text-xs text-rose-500">{error}</p>}

      <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-xl shadow-sm overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 uppercase tracking-wider">
            <tr>
              <th className="px-4 py-3">Caja</th>
              <th className="px-4 py-3">Cajero</th>
              <th className="px-4 py-3">Apertura</th>
              <th className="px-4 py-3">Cierre</th>
              <th className="px-4 py-3 text-right">Esperado</th>
              <th className="px-4 py-3 text-right">Declarado</th>
              <th className="px-4 py-3 text-right">Diferencia</th>
              <th className="px-4 py-3 text-right">Reporte</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {loading && (
              <tr><td colSpan={8} className="px-4 py-10 text-center"><Loader2 className="w-5 h-5 animate-spin inline" /></td></tr>
            )}
            {!loading && shifts.length === 0 && (
              <tr><td colSpan={8} className="px-4 py-10 text-center text-slate-400">No hay turnos registrados.</td></tr>
            )}
            {!loading &&
              shifts.map(s => {
                const diff = Number(s.difference || 0);
                return (
                  <tr key={s.id}>
                    <td className="px-4 py-3 font-medium">{s.terminal?.name}</td>
                    <td className="px-4 py-3">{s.user?.fullName}</td>
                    <td className="px-4 py-3">{dateTime(s.openedAt)}</td>
                    <td className="px-4 py-3">{s.status === 'OPEN' ? <span className="text-emerald-600 font-semibold">Abierto</span> : dateTime(s.closedAt)}</td>
                    <td className="px-4 py-3 text-right font-mono">{s.status === 'CLOSED' ? money(s.expectedCash) : '—'}</td>
                    <td className="px-4 py-3 text-right font-mono">{s.status === 'CLOSED' ? money(s.declaredCash) : '—'}</td>
                    <td className={`px-4 py-3 text-right font-mono font-semibold ${diff < 0 ? 'text-rose-500' : diff > 0 ? 'text-amber-600' : ''}`}>
                      {s.status === 'CLOSED' ? `${diff > 0 ? '+' : ''}${money(diff)}` : '—'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => printShift(s)} title="Reporte Z" className="p-1.5 text-slate-400 hover:text-indigo-600 cursor-pointer">
                        <Printer className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
