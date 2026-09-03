import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import { useAuthStore } from '../stores/authStore';
import { DollarSign, TrendingUp, Receipt, Calculator, Loader2, AlertTriangle, RefreshCw, ShoppingCart } from 'lucide-react';

export default function VendorDashboard({ onNavigateToPOS }) {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchStats = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await api.sales.vendorStats();
      setStats(data);
    } catch (err) {
      setError(err.message || 'Error al cargar estadísticas');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  if (loading && !stats) {
    return (
      <div className="flex flex-col items-center justify-center h-96 space-y-4">
        <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
        <p className="text-slate-500 text-sm font-mono">Cargando tu tablero...</p>
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
          onClick={fetchStats}
          className="inline-flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium px-4 py-2 rounded-lg shadow-sm transition-colors cursor-pointer"
        >
          <RefreshCw className="w-4 h-4" /> Reintentar
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-5">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100 tracking-tight font-sans">
            Mi Tablero
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Resumen de tu actividad comercial.
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={fetchStats}
            className="flex items-center gap-1.5 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 px-3.5 py-2 rounded-lg text-sm font-medium transition-all cursor-pointer"
            title="Refrescar datos"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={onNavigateToPOS}
            className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium shadow-sm hover:shadow transition-all cursor-pointer"
          >
            <ShoppingCart className="w-4 h-4" /> Nueva Venta (POS)
          </button>
        </div>
      </div>

      {stats && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 p-5 rounded-xl shadow-sm flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-xs text-slate-400 font-mono uppercase tracking-wider block">Ventas de Hoy</span>
              <h3 className="text-2xl font-bold text-slate-800 dark:text-slate-100 font-sans">
                ${stats.today.total.toFixed(2)}
              </h3>
              <p className="text-xs text-emerald-500 font-medium">
                {stats.today.count} transacciones
              </p>
            </div>
            <div className="bg-emerald-50 dark:bg-emerald-950/30 p-3.5 rounded-xl text-emerald-500 dark:text-emerald-400">
              <DollarSign className="w-6 h-6" />
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 p-5 rounded-xl shadow-sm flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-xs text-slate-400 font-mono uppercase tracking-wider block">Ventas del Mes</span>
              <h3 className="text-2xl font-bold text-slate-800 dark:text-slate-100 font-sans">
                ${stats.month.total.toFixed(2)}
              </h3>
              <p className="text-xs text-blue-500 font-medium">
                {stats.month.count} transacciones
              </p>
            </div>
            <div className="bg-blue-50 dark:bg-blue-950/30 p-3.5 rounded-xl text-blue-500 dark:text-blue-400">
              <TrendingUp className="w-6 h-6" />
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 p-5 rounded-xl shadow-sm flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-xs text-slate-400 font-mono uppercase tracking-wider block">Transacciones Hoy</span>
              <h3 className="text-2xl font-bold text-slate-800 dark:text-slate-100 font-sans">
                {stats.today.count}
              </h3>
              <p className="text-xs text-slate-400 font-medium">ventas registradas</p>
            </div>
            <div className="bg-indigo-50 dark:bg-indigo-950/30 p-3.5 rounded-xl text-indigo-500 dark:text-indigo-400">
              <Receipt className="w-6 h-6" />
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 p-5 rounded-xl shadow-sm flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-xs text-slate-400 font-mono uppercase tracking-wider block">Ticket Promedio</span>
              <h3 className="text-2xl font-bold text-slate-800 dark:text-slate-100 font-sans">
                ${stats.averageTicket.toFixed(2)}
              </h3>
              <p className="text-xs text-slate-400 font-medium">promedio por venta hoy</p>
            </div>
            <div className="bg-purple-50 dark:bg-purple-950/30 p-3.5 rounded-xl text-purple-500 dark:text-purple-400">
              <Calculator className="w-6 h-6" />
            </div>
          </div>
        </div>
      )}

      {stats && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800 shadow-sm p-5 flex flex-col">
            <h4 className="font-semibold text-slate-800 dark:text-slate-200 text-sm mb-4">
              Últimas 5 Ventas
            </h4>
            <div className="overflow-x-auto flex-1">
              <table className="w-full text-left text-xs text-slate-600 dark:text-slate-400">
                <thead className="bg-slate-50 dark:bg-slate-800/40 text-slate-400 uppercase font-mono tracking-wider">
                  <tr>
                    <th className="px-4 py-3">Factura</th>
                    <th className="px-4 py-3">Cliente</th>
                    <th className="px-4 py-3 text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {stats.recentSales.map((sale) => (
                    <tr key={sale.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/25 transition-colors">
                      <td className="px-4 py-3 font-mono font-medium text-slate-900 dark:text-slate-100">
                        {sale.invoiceNumber}
                      </td>
                      <td className="px-4 py-3 truncate max-w-[150px]">{sale.customerName}</td>
                      <td className="px-4 py-3 text-right font-semibold text-slate-900 dark:text-slate-100">
                        ${sale.total.toFixed(2)}
                      </td>
                    </tr>
                  ))}
                  {stats.recentSales.length === 0 && (
                    <tr>
                      <td colSpan={3} className="text-center py-6 text-slate-400">
                        Aún no registras ventas.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800 shadow-sm p-5 flex flex-col">
            <h4 className="font-semibold text-slate-800 dark:text-slate-200 text-sm mb-4">
              Productos Más Vendidos
            </h4>
            <div className="space-y-4">
              {stats.topProducts.map((item, idx) => (
                <div key={idx} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-slate-700 dark:text-slate-300 truncate max-w-[70%]">
                      {item.name}
                    </span>
                    <span className="font-mono text-slate-500 dark:text-slate-400">
                      {item.quantity} uds. | ${item.total.toFixed(2)}
                    </span>
                  </div>
                  <div className="h-2.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-indigo-500 dark:bg-indigo-600 rounded-full"
                      style={{ width: `${Math.min(100, (item.quantity / Math.max(1, stats.topProducts[0]?.quantity || 1)) * 100)}%` }}
                    />
                  </div>
                </div>
              ))}
              {stats.topProducts.length === 0 && (
                <p className="text-xs text-slate-400 text-center py-8">Sin datos de productos.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
