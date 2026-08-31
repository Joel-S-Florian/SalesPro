import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import { useAuthStore } from '../stores/authStore';
import { SalesTrendChart, TopProductsChart } from '../components/SVGCharts';
import { DollarSign, TrendingUp, Package, AlertTriangle, ArrowRight, Loader2, RefreshCw, ShoppingCart } from 'lucide-react';
import Modal from '../components/Modal';

export default function Dashboard({ onNavigateToPOS, onNavigateToProducts }) {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [adjustingProduct, setAdjustingProduct] = useState(null);
  const [adjustmentQty, setAdjustmentQty] = useState(10);
  const [submittingAdjust, setSubmittingAdjust] = useState(false);

  const fetchDashboardStats = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await api.reports.dashboard();
      setStats(data);
    } catch (err) {
      if (err.status === 401 || err.message?.includes('token') || err.message?.includes('expirad') || err.message?.includes('expiró')) {
        useAuthStore.getState().logout();
      }
      setError(err.message || 'Error al cargar estadísticas');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardStats();
  }, []);

  const handleFastReorder = async (e) => {
    e.preventDefault();
    if (!adjustingProduct) return;

    try {
      setSubmittingAdjust(true);
      await api.inventory.adjust({
        productId: adjustingProduct.id,
        type: 'Entrada',
        quantity: adjustmentQty,
        reason: 'Reabastecimiento Express (Dashboard Alertas)'
      });
      setAdjustingProduct(null);
      setAdjustmentQty(10);
      await fetchDashboardStats();
    } catch (err) {
      alert(err.message || 'Error al reabastecer');
    } finally {
      setSubmittingAdjust(false);
    }
  };

  if (loading && !stats) {
    return (
      <div className="flex flex-col items-center justify-center h-96 space-y-4">
        <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
        <p className="text-slate-500 text-sm font-mono">Cargando tablero central...</p>
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
          onClick={fetchDashboardStats}
          className="inline-flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium px-4 py-2 rounded-lg shadow-sm transition-colors cursor-pointer"
        >
          <RefreshCw className="w-4 h-4" /> Reintentar Carga
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6" id="dashboard-view">
      {/* Top Banner */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-5">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100 tracking-tight font-sans">
            Dashboard General
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Resumen en tiempo real del proceso comercial, inventario y ventas.
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={fetchDashboardStats}
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

      {/* KPI Stats Grid */}
      {stats && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5" id="kpi-grid">
          {/* Card 1: Revenue Today */}
          <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 p-5 rounded-xl shadow-sm hover:shadow-md transition-all flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-xs text-slate-400 font-mono uppercase tracking-wider block">Ventas de Hoy</span>
              <h3 className="text-2xl font-bold text-slate-800 dark:text-slate-100 font-sans">
                ${stats.revenueToday.toFixed(2)}
              </h3>
              <p className="text-xs text-emerald-500 font-medium">
                {stats.salesToday} transacciones registradas
              </p>
            </div>
            <div className="bg-emerald-50 dark:bg-emerald-950/30 p-3.5 rounded-xl text-emerald-500 dark:text-emerald-400">
              <DollarSign className="w-6 h-6" />
            </div>
          </div>

          {/* Card 2: Revenue Month */}
          <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 p-5 rounded-xl shadow-sm hover:shadow-md transition-all flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-xs text-slate-400 font-mono uppercase tracking-wider block">Ventas del Mes</span>
              <h3 className="text-2xl font-bold text-slate-800 dark:text-slate-100 font-sans">
                ${stats.revenueMonth.toFixed(2)}
              </h3>
              <p className="text-xs text-blue-500 font-medium">
                {stats.salesMonth} transacciones totales
              </p>
            </div>
            <div className="bg-blue-50 dark:bg-blue-950/30 p-3.5 rounded-xl text-blue-500 dark:text-blue-400">
              <TrendingUp className="w-6 h-6" />
            </div>
          </div>

          {/* Card 3: Active Products */}
          <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 p-5 rounded-xl shadow-sm hover:shadow-md transition-all flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-xs text-slate-400 font-mono uppercase tracking-wider block">Productos Activos</span>
              <h3 className="text-2xl font-bold text-slate-800 dark:text-slate-100 font-sans">
                {stats.totalProducts}
              </h3>
              <button
                onClick={onNavigateToProducts}
                className="text-xs text-slate-400 hover:text-indigo-500 font-medium flex items-center gap-1 transition-colors cursor-pointer"
              >
                Ver inventario completo <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="bg-indigo-50 dark:bg-indigo-950/30 p-3.5 rounded-xl text-indigo-500 dark:text-indigo-400">
              <Package className="w-6 h-6" />
            </div>
          </div>

          {/* Card 4: Low Stock Warnings */}
          <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 p-5 rounded-xl shadow-sm hover:shadow-md transition-all flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-xs text-slate-400 font-mono uppercase tracking-wider block">Alertas de Stock</span>
              <h3 className="text-2xl font-bold text-slate-800 dark:text-slate-100 font-sans flex items-center gap-2">
                {stats.lowStockCount}
                {stats.lowStockCount > 0 && (
                  <span className="relative flex h-3 w-3">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-rose-500"></span>
                  </span>
                )}
              </h3>
              <p className="text-xs text-rose-500 font-medium">
                {stats.lowStockCount > 0 ? 'Requieren abastecimiento' : 'Todo en orden en almacén'}
              </p>
            </div>
            <div className={`p-3.5 rounded-xl ${stats.lowStockCount > 0 ? 'bg-rose-50 dark:bg-rose-950/30 text-rose-500 dark:text-rose-400' : 'bg-slate-50 dark:bg-slate-800 text-slate-400'}`}>
              <AlertTriangle className="w-6 h-6" />
            </div>
          </div>
        </div>
      )}

      {/* Vector Charts Panel */}
      {stats && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6" id="charts-panel">
          <SalesTrendChart data={stats.salesByDay} />
          <TopProductsChart data={stats.topSellingProducts} />
        </div>
      )}

      {/* Lists Summary Grid */}
      {stats && (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6" id="tables-panel">
          {/* Recent Sales Column (3/5 width) */}
          <div className="lg:col-span-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800 shadow-sm p-5 flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h4 className="font-semibold text-slate-800 dark:text-slate-200 text-sm">
                Últimas Ventas Registradas
              </h4>
              <span className="text-xs text-indigo-500 font-medium font-mono">Últimas 5 transacciones</span>
            </div>
            <div className="overflow-x-auto flex-1">
              <table className="w-full text-left text-xs text-slate-600 dark:text-slate-400">
                <thead className="bg-slate-50 dark:bg-slate-800/40 text-slate-400 uppercase font-mono tracking-wider">
                  <tr>
                    <th className="px-4 py-3">N° Documento</th>
                    <th className="px-4 py-3">Cliente</th>
                    <th className="px-4 py-3">Pago</th>
                    <th className="px-4 py-3 text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {stats.recentSales.map((sale) => (
                    <tr key={sale.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/25 transition-colors">
                      <td className="px-4 py-3 font-mono font-medium text-slate-900 dark:text-slate-100">
                        {sale.invoiceNumber}
                      </td>
                      <td className="px-4 py-3 truncate max-w-[150px]">
                        {sale.customerName}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                          sale.paymentMethod === 'Efectivo' ? 'bg-amber-50 dark:bg-amber-950/20 text-amber-600 dark:text-amber-400' :
                          sale.paymentMethod === 'Tarjeta' ? 'bg-purple-50 dark:bg-purple-950/20 text-purple-600 dark:text-purple-400' :
                          'bg-sky-50 dark:bg-sky-950/20 text-sky-600 dark:text-sky-400'
                        }`}>
                          {sale.paymentMethod}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-slate-900 dark:text-slate-100">
                        ${sale.total.toFixed(2)}
                      </td>
                    </tr>
                  ))}
                  {stats.recentSales.length === 0 && (
                    <tr>
                      <td colSpan={4} className="text-center py-6 text-slate-400">
                        No se han registrado ventas hoy.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Low Stock Alerts (2/5 width) */}
          <div className="lg:col-span-2 bg-white dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800 shadow-sm p-5 flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h4 className="font-semibold text-slate-800 dark:text-slate-200 text-sm flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-amber-500 animate-pulse" />
                Alertas Críticas de Stock
              </h4>
              <span className="text-xs bg-rose-50 dark:bg-rose-950/30 text-rose-600 dark:text-rose-400 px-2 py-0.5 rounded font-bold font-mono">
                {stats.lowStockCount} items
              </span>
            </div>
            <div className="overflow-y-auto max-h-[220px] flex-1 space-y-3 pr-1">
              {stats.lowStockProducts.map((prod) => (
                <div
                  key={prod.id}
                  className="p-3 bg-rose-50/20 dark:bg-rose-950/5 border border-rose-100/50 dark:border-rose-900/20 rounded-lg flex items-center justify-between gap-2"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">{prod.name}</p>
                    <p className="text-[10px] font-mono text-slate-400">
                      Stock: <span className="text-rose-500 font-bold">{prod.stock}</span> / Min: {prod.minStock}
                    </p>
                  </div>
                  <button
                    onClick={() => setAdjustingProduct({ id: prod.id, name: prod.name, currentStock: prod.stock })}
                    className="bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/40 dark:hover:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400 text-[11px] font-bold px-3 py-1.5 rounded-md transition-colors whitespace-nowrap cursor-pointer"
                  >
                    Reabastecer
                  </button>
                </div>
              ))}
              {stats.lowStockProducts.length === 0 && (
                <div className="flex flex-col items-center justify-center py-10 text-center space-y-2">
                  <span className="text-2xl">🎉</span>
                  <p className="text-xs text-slate-500">¡Excelente! Todos tus productos cuentan con suficiente stock de respaldo.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Fast Stock Adjust Modal */}
      <Modal
        isOpen={adjustingProduct !== null}
        onClose={() => setAdjustingProduct(null)}
        title="Reabastecimiento Express"
        maxWidth="sm"
      >
        {adjustingProduct && (
          <form onSubmit={handleFastReorder} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs text-slate-400 uppercase font-mono">Producto a Reabastecer</label>
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">{adjustingProduct.name}</p>
              <p className="text-xs text-slate-500 font-mono">Stock actual: {adjustingProduct.currentStock} unidades</p>
            </div>

            <div className="space-y-2">
              <label htmlFor="fast-stock-qty" className="block text-xs font-semibold text-slate-600 dark:text-slate-400">
                Cantidad a Agregar (Entrada)
              </label>
              <input
                id="fast-stock-qty"
                type="number"
                min="1"
                required
                value={adjustmentQty}
                onChange={(e) => setAdjustmentQty(Math.max(1, parseInt(e.target.value) || 0))}
                className="w-full px-3.5 py-2 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-800 dark:text-slate-100 bg-transparent focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-sm font-mono"
              />
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setAdjustingProduct(null)}
                className="w-full px-4 py-2 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 text-sm font-medium rounded-lg transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={submittingAdjust}
                className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white text-sm font-medium py-2 rounded-lg shadow-sm transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
              >
                {submittingAdjust ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" /> Registrando...
                  </>
                ) : (
                  'Ingresar Stock'
                )}
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
