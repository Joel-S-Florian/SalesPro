import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import { Loader2, AlertTriangle, RefreshCw, TrendingUp, TrendingDown, Wallet, Calendar, ArrowUpRight, ArrowDownRight } from 'lucide-react';

function defaultRange() {
  const to = new Date();
  const from = new Date();
  from.setDate(to.getDate() - 30);
  return {
    from: from.toISOString().split('T')[0],
    to: to.toISOString().split('T')[0],
  };
}

export default function Finance() {
  const initial = defaultRange();
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchCashflow = async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await api.finance.cashflow({ from, to });
      setData(result);
    } catch (err) {
      setError(err.message || 'Error al cargar flujo de caja');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCashflow();
  }, []);

  const handleApply = (e) => {
    e.preventDefault();
    fetchCashflow();
  };

  const formatDate = (date) => new Date(date).toLocaleDateString('es-DO', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });

  if (loading && !data) {
    return (
      <div className="flex flex-col items-center justify-center h-96 space-y-4">
        <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
        <p className="text-slate-500 text-sm font-mono">Cargando flujo de caja...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/50 rounded-xl p-6 text-center max-w-xl mx-auto my-12">
        <AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-red-900 dark:text-red-200 mb-2">Error de Sincronización</h3>
        <p className="text-red-600 dark:text-red-400 text-sm mb-4">{error}</p>
        <button
          onClick={fetchCashflow}
          className="inline-flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium px-4 py-2 rounded-lg shadow-sm transition-colors cursor-pointer"
        >
          <RefreshCw className="w-4 h-4" /> Reintentar
        </button>
      </div>
    );
  }

  const summary = data?.summary || { income: 0, expenses: 0, balance: 0 };
  const transactions = data?.transactions || [];

  return (
    <div className="space-y-6">
      <div className="border-b border-slate-100 dark:border-slate-800 pb-5">
        <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100 tracking-tight font-sans">
          Flujo de Caja
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Entradas por ventas frente a salidas por compras a proveedores.
        </p>
      </div>

      <form onSubmit={handleApply} className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-xl p-4 shadow-sm flex flex-col sm:flex-row items-center gap-4">
        <div className="flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-300">
          <Calendar className="w-4 h-4 text-indigo-500" />
          <span>Rango de Fechas:</span>
        </div>
        <div className="flex items-center gap-3 flex-1">
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="border border-slate-200 dark:border-slate-800 bg-transparent px-3 py-1.5 rounded-lg text-slate-700 dark:text-slate-300 outline-none text-xs"
          />
          <span className="text-slate-400">→</span>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="border border-slate-200 dark:border-slate-800 bg-transparent px-3 py-1.5 rounded-lg text-slate-700 dark:text-slate-300 outline-none text-xs"
          />
        </div>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={fetchCashflow}
            className="flex items-center gap-1.5 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 px-3.5 py-2 rounded-lg text-xs font-medium transition-all cursor-pointer"
            title="Refrescar datos"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            type="submit"
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-xs font-semibold shadow-sm transition-all cursor-pointer"
          >
            Aplicar Filtros
          </button>
        </div>
      </form>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 p-5 rounded-xl shadow-sm flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider block">Entradas (Ventas)</span>
            <h3 className="text-xl font-bold font-sans text-emerald-600 dark:text-emerald-400">${summary.income.toFixed(2)}</h3>
          </div>
          <div className="bg-emerald-50 dark:bg-emerald-950/30 p-3 rounded-xl text-emerald-500">
            <ArrowUpRight className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 p-5 rounded-xl shadow-sm flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider block">Salidas (Compras)</span>
            <h3 className="text-xl font-bold font-sans text-rose-600 dark:text-rose-400">${summary.expenses.toFixed(2)}</h3>
          </div>
          <div className="bg-rose-50 dark:bg-rose-950/30 p-3 rounded-xl text-rose-500">
            <ArrowDownRight className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 p-5 rounded-xl shadow-sm flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider block">Balance</span>
            <h3 className={`text-xl font-bold font-sans ${summary.balance >= 0 ? 'text-slate-950 dark:text-slate-50' : 'text-rose-600 dark:text-rose-400'}`}>
              ${summary.balance.toFixed(2)}
            </h3>
          </div>
          <div className="bg-indigo-50 dark:bg-indigo-950/30 p-3 rounded-xl text-indigo-500">
            <Wallet className="w-5 h-5" />
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-600 dark:text-slate-400">
            <thead className="bg-slate-50 dark:bg-slate-800/40 text-slate-400 uppercase font-mono tracking-wider">
              <tr>
                <th className="px-6 py-4">Fecha</th>
                <th className="px-6 py-4">Concepto</th>
                <th className="px-6 py-4 text-center">Tipo</th>
                <th className="px-6 py-4 text-right">Monto</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {transactions.map((t) => (
                <tr key={t.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/25 transition-colors">
                  <td className="px-6 py-4 font-mono text-slate-400">{formatDate(t.date)}</td>
                  <td className="px-6 py-4 font-medium text-slate-800 dark:text-slate-200">
                    {t.source}
                    {t.invoiceNumber && (
                      <span className="block text-[10px] text-slate-400 font-mono">{t.invoiceNumber}</span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-center">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      t.type === 'INCOME'
                        ? 'bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600'
                        : 'bg-rose-50 dark:bg-rose-950/20 text-rose-600'
                    }`}>
                      {t.type === 'INCOME' ? 'Entrada' : 'Salida'}
                    </span>
                  </td>
                  <td className={`px-6 py-4 text-right font-mono font-bold ${
                    t.type === 'INCOME' ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
                  }`}>
                    {t.type === 'INCOME' ? '+' : '-'}${Number(t.amount).toFixed(2)}
                  </td>
                </tr>
              ))}
              {transactions.length === 0 && (
                <tr>
                  <td colSpan={4} className="text-center py-10 text-slate-400 font-mono">
                    No hay movimientos en el período seleccionado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-[11px] text-slate-400 flex items-center gap-1.5">
        {summary.balance >= 0 ? <TrendingUp className="w-3.5 h-3.5 text-emerald-500" /> : <TrendingDown className="w-3.5 h-3.5 text-rose-500" />}
        Balance del período: Entradas menos salidas registradas.
      </p>
    </div>
  );
}
