import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import { Loader2, FileText, Download, TrendingUp, TrendingDown, Layers, Users, Calendar, BarChart2 } from 'lucide-react';

export default function Reports() {
  const [sales, setSales] = useState([]);
  const [products, setProducts] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [selectedYear, setSelectedYear] = useState(2026);
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const [sList, pList, cList] = await Promise.all([
        api.sales.list(),
        api.products.list(),
        api.customers.list()
      ]);
      setSales(Array.isArray(sList) ? sList : (sList?.data || []));
      setProducts(Array.isArray(pList) ? pList : (pList?.data || []));
      setCustomers(Array.isArray(cList) ? cList : (cList?.data || []));
    } catch (err) {
      setError(err.message || 'Error al cargar reportes');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const safeSales = Array.isArray(sales) ? sales : [];
  const safeProducts = Array.isArray(products) ? products : [];
  const safeCustomers = Array.isArray(customers) ? customers : [];

  // 1. Sales by Period calculations
  const filteredSales = safeSales.filter(s => {
    if (!s?.createdAt) return false;
    const d = new Date(s.createdAt);
    return d.getFullYear() === selectedYear && (d.getMonth() + 1) === selectedMonth;
  });

  const periodRevenue = filteredSales.reduce((acc, s) => acc + Number(s.total || 0), 0);
  const periodDiscounts = filteredSales.reduce((acc, s) => acc + Number(s.discount || 0), 0);
  const periodTransactions = filteredSales.length;

  // 2. Ranking of Top Customers
  const customerSpendingMap = new Map();
  safeSales.forEach(s => {
    if (!s?.customerId) return;
    const entry = customerSpendingMap.get(s.customerId) || { total: 0, count: 0 };
    entry.total += Number(s.total || 0);
    entry.count += 1;
    customerSpendingMap.set(s.customerId, entry);
  });

  const rankedCustomers = Array.from(customerSpendingMap.entries())
    .map(([id, stats]) => {
      const cust = safeCustomers.find(c => c.id === id);
      return {
        name: cust?.name || 'Cliente Desconocido',
        documentId: cust?.documentId || '-',
        totalSpent: Number(Number(stats.total || 0).toFixed(2)),
        ordersCount: stats.count
      };
    })
    .sort((a, b) => b.totalSpent - a.totalSpent)
    .slice(0, 5);

  // 3. Product Rotation Metrics
  const productSalesQty = new Map();
  safeSales.forEach(s => {
    (s.details || []).forEach(d => {
      if (!d?.productId) return;
      const qty = productSalesQty.get(d.productId) || 0;
      productSalesQty.set(d.productId, qty + Number(d.quantity || 0));
    });
  });

  const rotations = safeProducts.map(p => {
    const unitsSold = productSalesQty.get(p.id) || 0;
    let rotationRate = 'Baja';
    if (unitsSold > 10) rotationRate = 'Alta';
    else if (unitsSold > 3) rotationRate = 'Media';

    return {
      name: p.name || 'Producto',
      code: p.code || '-',
      stock: Number(p.stock || 0),
      unitsSold,
      rotationRate
    };
  }).sort((a, b) => b.unitsSold - a.unitsSold);

  // Simulation export to Excel / PDF
  const handleExport = (type, reportName) => {
    alert(`[SalesPro v2 Exportación] Generando reporte de ${reportName} en formato ${type}...\nSu descarga iniciará de forma automática.`);
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-96 space-y-4">
        <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
        <p className="text-slate-500 text-sm font-mono">Consolidando bases comerciales...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6" id="reports-view">
      {/* Header */}
      <div className="border-b border-slate-100 dark:border-slate-800 pb-5">
        <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100 tracking-tight font-sans">
          Centro de Inteligencia & Reportes
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Visualiza rotaciones de stock, auditorías de ingresos y clientes premium con descargas parametrizadas.
        </p>
      </div>

      {/* Select Period Panel */}
      <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-xl p-4 shadow-sm flex flex-col sm:flex-row items-center gap-4 justify-between">
        <div className="flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-300">
          <Calendar className="w-4.5 h-4.5 text-indigo-500" />
          <span>Filtro de Cierre Mensual:</span>
        </div>

        <div className="flex items-center gap-3">
          <select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(parseInt(e.target.value))}
            className="border border-slate-200 dark:border-slate-800 bg-transparent px-3 py-1.5 rounded-lg text-slate-700 dark:text-slate-300 outline-none text-xs"
          >
            {Array.from({ length: 12 }, (_, i) => (
              <option key={i + 1} value={i + 1} className="dark:bg-slate-950">
                {new Date(2026, i, 1).toLocaleString('es', { month: 'long' }).toUpperCase()}
              </option>
            ))}
          </select>

          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(parseInt(e.target.value))}
            className="border border-slate-200 dark:border-slate-800 bg-transparent px-3 py-1.5 rounded-lg text-slate-700 dark:text-slate-300 outline-none text-xs"
          >
            <option value={2026} className="dark:bg-slate-950">2026</option>
            <option value={2025} className="dark:bg-slate-950">2025</option>
          </select>
        </div>
      </div>

      {/* Report Aggregates */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 p-5 rounded-xl shadow-sm space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">Ingresos Netos del Período</span>
            <TrendingUp className="w-4 h-4 text-indigo-500" />
          </div>
          <h3 className="text-xl font-bold font-sans text-slate-950 dark:text-slate-50">${periodRevenue.toFixed(2)}</h3>
          <p className="text-[10px] text-slate-400">Total acumulado en el mes/año seleccionado</p>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 p-5 rounded-xl shadow-sm space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">Transacciones Realizadas</span>
            <FileText className="w-4 h-4 text-indigo-500" />
          </div>
          <h3 className="text-xl font-bold font-sans text-slate-950 dark:text-slate-50">{periodTransactions} boletas</h3>
          <p className="text-[10px] text-slate-400">Comprobantes válidos emitidos por POS</p>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 p-5 rounded-xl shadow-sm space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">Descuentos Ofrecidos</span>
            <TrendingDown className="w-4 h-4 text-rose-500" />
          </div>
          <h3 className="text-xl font-bold font-sans text-slate-950 dark:text-slate-50">${periodDiscounts.toFixed(2)}</h3>
          <p className="text-[10px] text-slate-400">Suma total de rebajas en POS</p>
        </div>
      </div>

      {/* Grid: Rankings (Top Customers & Low Rotation) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top customers */}
        <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 p-5 rounded-xl shadow-sm space-y-4 flex flex-col justify-between">
          <div className="flex items-center justify-between pb-2 border-b border-slate-50 dark:border-slate-800">
            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
              <Users className="w-4 h-4 text-indigo-500" />
              Clientes Premium (Mayor Compra Histórica)
            </h3>
            <button
              onClick={() => handleExport('EXCEL', 'Clientes Premium')}
              className="text-[10px] font-semibold text-slate-400 hover:text-indigo-500 flex items-center gap-1 cursor-pointer"
            >
              <Download className="w-3 h-3" /> Excel
            </button>
          </div>

          <div className="overflow-x-auto flex-1">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="text-slate-400 font-mono py-2 border-b border-slate-100 dark:border-slate-800">
                  <th className="pb-2 font-normal">Cliente</th>
                  <th className="pb-2 font-normal">Identificación</th>
                  <th className="pb-2 text-center font-normal">Transacciones</th>
                  <th className="pb-2 text-right font-normal">Consumo Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
                {rankedCustomers.map((rc, idx) => (
                  <tr key={idx} className="text-slate-600 dark:text-slate-400 hover:bg-slate-50/50">
                    <td className="py-2.5 font-semibold text-slate-800 dark:text-slate-200">{rc.name}</td>
                    <td className="py-2.5 font-mono">{rc.documentId}</td>
                    <td className="py-2.5 text-center font-mono">{rc.ordersCount}</td>
                    <td className="py-2.5 text-right font-bold font-mono text-slate-900 dark:text-slate-100">${Number(rc.totalSpent || 0).toFixed(2)}</td>
                  </tr>
                ))}
                {rankedCustomers.length === 0 && (
                  <tr>
                    <td colSpan={4} className="text-center py-8 text-slate-400">Sin datos registrados</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Low Rotation inventory */}
        <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 p-5 rounded-xl shadow-sm space-y-4 flex flex-col justify-between">
          <div className="flex items-center justify-between pb-2 border-b border-slate-50 dark:border-slate-800">
            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
              <Layers className="w-4 h-4 text-indigo-500" />
              Análisis de Baja Rotación (Riesgo Sobrestock)
            </h3>
            <button
              onClick={() => handleExport('EXCEL', 'Inventario Baja Rotación')}
              className="text-[10px] font-semibold text-slate-400 hover:text-indigo-500 flex items-center gap-1 cursor-pointer"
            >
              <Download className="w-3 h-3" /> Excel
            </button>
          </div>

          <div className="overflow-x-auto flex-1">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="text-slate-400 font-mono py-2 border-b border-slate-100 dark:border-slate-800">
                  <th className="pb-2 font-normal">Código</th>
                  <th className="pb-2 font-normal">Producto</th>
                  <th className="pb-2 text-center font-normal">Unidades Vendidas</th>
                  <th className="pb-2 text-center font-normal">Rotación</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
                {rotations.slice(0, 5).map((rot, idx) => (
                  <tr key={idx} className="text-slate-600 dark:text-slate-400 hover:bg-slate-50/50">
                    <td className="py-2.5 font-mono text-slate-400">{rot.code}</td>
                    <td className="py-2.5 font-semibold text-slate-800 dark:text-slate-200 truncate max-w-[120px]">{rot.name}</td>
                    <td className="py-2.5 text-center font-mono">{rot.unitsSold} uds.</td>
                    <td className="py-2.5 text-center">
                      <span className={`px-2 py-0.5 rounded text-[9px] font-bold ${
                        rot.rotationRate === 'Alta' ? 'bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600' :
                        rot.rotationRate === 'Media' ? 'bg-amber-50 dark:bg-amber-950/20 text-amber-600' :
                        'bg-rose-50 dark:bg-rose-950/20 text-rose-600'
                      }`}>
                        {rot.rotationRate}
                      </span>
                    </td>
                  </tr>
                ))}
                {rotations.length === 0 && (
                  <tr>
                    <td colSpan={4} className="text-center py-8 text-slate-400">Sin datos de productos registrados</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Export closing section */}
      <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-xl p-5 shadow-sm space-y-4">
        <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
          <BarChart2 className="w-4 h-4 text-indigo-500" /> Generador de Exportaciones de Cierre Comercial
        </h4>
        <p className="text-xs text-slate-400">
          Haz clic para compilar y descargar las sábanas de datos consolidadas de ventas e inventario del mes.
        </p>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => handleExport('PDF', `Cierre Comercial ${selectedMonth}/${selectedYear}`)}
            className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold px-4 py-2 rounded-lg transition-all shadow-sm cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" /> Generar Cierre PDF
          </button>
          <button
            onClick={() => handleExport('EXCEL', `Kardex Completo ${selectedMonth}/${selectedYear}`)}
            className="flex items-center gap-1.5 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs font-semibold px-4 py-2 rounded-lg transition-all cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" /> Descargar Kárdex Completo Excel
          </button>
        </div>
      </div>
    </div>
  );
}
