import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../services/api';
import {
  Loader2, TrendingUp, TrendingDown, Users, Calendar,
  BarChart2, Package, UserCheck, FileJson, FileSpreadsheet, FileText, FileCode,
} from 'lucide-react';
import { generateFilename, exportToCSV, exportToJSON, exportToXML, exportToPDF } from '../utils/export';

const DATE_PRESETS = [
  { id: 'today', label: 'Hoy' },
  { id: 'yesterday', label: 'Ayer' },
  { id: 'week', label: 'Esta Semana' },
  { id: 'month', label: 'Este Mes' },
  { id: 'custom', label: 'Personalizado' },
];

function toISODate(d) {
  return d.toISOString().split('T')[0];
}

function presetRange(preset) {
  const now = new Date();
  const fmt = (d) => toISODate(d);
  switch (preset) {
    case 'today':
      return { from: fmt(now), to: fmt(now) };
    case 'yesterday': {
      const y = new Date(now);
      y.setDate(now.getDate() - 1);
      return { from: fmt(y), to: fmt(y) };
    }
    case 'week': {
      const start = new Date(now);
      start.setDate(now.getDate() - now.getDay());
      return { from: fmt(start), to: fmt(now) };
    }
    case 'month': {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      return { from: fmt(start), to: fmt(now) };
    }
    default:
      return null;
  }
}

function ExportButtons({ onExport, disabled }) {
  const btn = 'flex items-center gap-1.5 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs font-semibold px-3 py-1.5 rounded-lg transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed';
  return (
    <div className="flex flex-wrap gap-2">
      <button onClick={() => onExport('pdf')} disabled={disabled} className={btn} title="Exportar PDF">
        <FileText className="w-3.5 h-3.5" /> PDF
      </button>
      <button onClick={() => onExport('csv')} disabled={disabled} className={btn} title="Exportar Excel (CSV)">
        <FileSpreadsheet className="w-3.5 h-3.5" /> Excel
      </button>
      <button onClick={() => onExport('json')} disabled={disabled} className={btn} title="Exportar JSON">
        <FileJson className="w-3.5 h-3.5" /> JSON
      </button>
      <button onClick={() => onExport('xml')} disabled={disabled} className={btn} title="Exportar XML">
        <FileCode className="w-3.5 h-3.5" /> XML
      </button>
    </div>
  );
}

function KpiCard({ label, value, icon: Icon, tone = 'indigo' }) {
  const tones = {
    indigo: 'bg-indigo-50 dark:bg-indigo-950/30 text-indigo-500 dark:text-indigo-400',
    emerald: 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-500 dark:text-emerald-400',
    rose: 'bg-rose-50 dark:bg-rose-950/30 text-rose-500 dark:text-rose-400',
    amber: 'bg-amber-50 dark:bg-amber-950/30 text-amber-500 dark:text-amber-400',
    blue: 'bg-blue-50 dark:bg-blue-950/30 text-blue-500 dark:text-blue-400',
  };
  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 p-5 rounded-xl shadow-sm flex items-center justify-between">
      <div className="space-y-1">
        <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider block">{label}</span>
        <h3 className="text-xl font-bold font-sans text-slate-950 dark:text-slate-50">{value}</h3>
      </div>
      <div className={`p-3 rounded-xl ${tones[tone]}`}>
        <Icon className="w-5 h-5" />
      </div>
    </div>
  );
}

function DataTable({ columns, rows, emptyMessage = 'Sin datos registrados' }) {
  return (
    <div className="overflow-x-auto flex-1">
      <table className="w-full text-left text-xs">
        <thead>
          <tr className="text-slate-400 font-mono py-2 border-b border-slate-100 dark:border-slate-800">
            {columns.map((c) => (
              <th key={c.key} className={`pb-2 font-normal ${c.align === 'right' ? 'text-right' : c.align === 'center' ? 'text-center' : ''}`}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
          {rows.map((row, idx) => (
            <tr key={row.id || idx} className="text-slate-600 dark:text-slate-400 hover:bg-slate-50/50">
              {columns.map((c) => (
                <td key={c.key} className={`py-2.5 ${c.align === 'right' ? 'text-right' : c.align === 'center' ? 'text-center' : ''} ${c.bold ? 'font-semibold text-slate-800 dark:text-slate-200' : ''} ${c.mono ? 'font-mono' : ''}`}>
                  {c.render ? c.render(row) : row[c.key]}
                </td>
              ))}
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={columns.length} className="text-center py-8 text-slate-400">{emptyMessage}</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export default function Reports() {
  const [tab, setTab] = useState('PRODUCTS');
  const [preset, setPreset] = useState('month');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Products tab
  const [productView, setProductView] = useState('top-sold');
  const [categoryId, setCategoryId] = useState('');
  const [categories, setCategories] = useState([]);
  const [productData, setProductData] = useState({ data: [] });

  // Customers tab
  const [customerView, setCustomerView] = useState('top-amount');
  const [docType, setDocType] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerData, setCustomerData] = useState({ data: [] });
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [customerHistory, setCustomerHistory] = useState(null);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Staff tab
  const [staffUserId, setStaffUserId] = useState('');
  const [staffPayment, setStaffPayment] = useState('');
  const [users, setUsers] = useState([]);
  const [staffData, setStaffData] = useState({ data: [] });
  const [staffPayments, setStaffPayments] = useState({ byUser: [], peakHours: [] });

  const range = useMemo(() => {
    if (preset !== 'custom') {
      const r = presetRange(preset);
      return r || { from: '', to: '' };
    }
    return { from, to };
  }, [preset, from, to]);

  useEffect(() => {
    if (preset !== 'custom') {
      const r = presetRange(preset);
      if (r) {
        setFrom(r.from);
        setTo(r.to);
      }
    }
  }, [preset]);

  const loadCatalogs = async () => {
    try {
      const [cats, usrs] = await Promise.all([
        api.categories.list().catch(() => []),
        api.auth.getUsers().catch(() => []),
      ]);
      setCategories(Array.isArray(cats) ? cats : []);
      setUsers(Array.isArray(usrs) ? usrs : []);
    } catch {
      // Catalogos opcionales, no bloquean
    }
  };

  const loadProducts = async () => {
    const params = { from: range.from || undefined, to: range.to || undefined, categoryId: categoryId || undefined, limit: 10 };
    let result;
    if (productView === 'top-sold') result = await api.reports.topSoldProducts(params);
    else if (productView === 'most-profitable') result = await api.reports.mostProfitableProducts(params);
    else if (productView === 'low-margin') result = await api.reports.lowMarginProducts({ ...params, minMargin: 20 });
    else result = await api.reports.productsByCategory({ from: params.from, to: params.to });
    setProductData(result?.data ? result : { data: result || [] });
  };

  const loadCustomers = async () => {
    const params = {
      from: range.from || undefined,
      to: range.to || undefined,
      docType: docType || undefined,
      search: customerSearch || undefined,
      limit: 10,
    };
    const result = customerView === 'top-amount'
      ? await api.reports.topCustomersByAmount(params)
      : await api.reports.topCustomersByFrequency(params);
    setCustomerData(result?.data ? result : { data: result || [] });
  };

  const loadStaff = async () => {
    const params = {
      from: range.from || undefined,
      to: range.to || undefined,
      userId: staffUserId || undefined,
      paymentMethod: staffPayment || undefined,
    };
    const [perf, pay] = await Promise.all([
      api.reports.staffPerformance(params),
      api.reports.staffPaymentMethods({ from: params.from, to: params.to, userId: params.userId }),
    ]);
    setStaffData(perf?.data ? perf : { data: perf || [] });
    setStaffPayments(pay || { byUser: [], peakHours: [] });
  };

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      if (tab === 'PRODUCTS') await loadProducts();
      else if (tab === 'CUSTOMERS') await loadCustomers();
      else await loadStaff();
    } catch (err) {
      setError(err.message || 'Error al cargar reportes');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCatalogs();
  }, []);

  useEffect(() => {
    loadData();
  }, [tab]);

  const handleApply = (e) => {
    e?.preventDefault();
    loadData();
  };

  const loadHistory = async (customerId) => {
    if (selectedCustomer === customerId) {
      setSelectedCustomer(null);
      setCustomerHistory(null);
      return;
    }
    try {
      setHistoryLoading(true);
      setSelectedCustomer(customerId);
      const data = await api.reports.customerHistory(customerId, {
        from: range.from || undefined,
        to: range.to || undefined,
      });
      setCustomerHistory(data);
    } catch (err) {
      setCustomerHistory({ error: err.message });
    } finally {
      setHistoryLoading(false);
    }
  };

  const fmtMoney = (v) => `$${Number(v || 0).toFixed(2)}`;

  const handleExport = (format, rows, columns, reportType) => {
    const filename = generateFilename(reportType, { from: range.from, to: range.to });
    if (format === 'csv') exportToCSV(rows, filename, columns);
    else if (format === 'json') exportToJSON(rows, filename);
    else if (format === 'xml') exportToXML(rows, filename, 'report', 'row');
    else if (format === 'pdf') exportToPDF(reportType.replace(/_/g, ' ').toUpperCase(), columns, rows.map((r) => {
      const flat = {};
      columns.forEach((c) => { flat[c.key] = r[c.key] ?? ''; });
      return flat;
    }), filename);
  };

  const productColumns = productView === 'by-category'
    ? [
        { key: 'category', label: 'Categoría', bold: true },
        { key: 'products', label: 'Productos', align: 'center', mono: true },
        { key: 'quantity', label: 'Unidades', align: 'center', mono: true },
        { key: 'revenue', label: 'Ingresos', align: 'right', mono: true, bold: true, render: (r) => fmtMoney(r.revenue) },
        { key: 'profit', label: 'Ganancia', align: 'right', mono: true, render: (r) => fmtMoney(r.profit) },
        { key: 'margin', label: 'Margen %', align: 'right', mono: true, render: (r) => `${Number(r.margin || 0).toFixed(1)}%` },
      ]
    : [
        { key: 'name', label: 'Producto', bold: true },
        { key: 'code', label: 'Código', mono: true },
        { key: 'quantity', label: 'Unidades', align: 'center', mono: true },
        { key: 'revenue', label: 'Ingresos', align: 'right', mono: true, render: (r) => fmtMoney(r.revenue) },
        { key: 'profit', label: 'Ganancia', align: 'right', mono: true, bold: true, render: (r) => fmtMoney(r.profit) },
        { key: 'margin', label: 'Margen %', align: 'right', mono: true, render: (r) => `${Number(r.margin || 0).toFixed(1)}%` },
      ];

  const productRows = productData.data || [];
  const customerRows = customerData.data || [];
  const staffRows = staffData.data || [];

  const customerColumns = [
    { key: 'name', label: 'Cliente', bold: true },
    { key: 'documentId', label: 'Documento', mono: true },
    { key: 'orders', label: 'Compras', align: 'center', mono: true },
    { key: 'totalSpent', label: 'Total Gastado', align: 'right', mono: true, bold: true, render: (r) => fmtMoney(r.totalSpent) },
    { key: 'averageTicket', label: 'Ticket Prom.', align: 'right', mono: true, render: (r) => fmtMoney(r.averageTicket) },
  ];

  const staffColumns = [
    { key: 'fullName', label: 'Caja / Usuario', bold: true },
    { key: 'username', label: 'Usuario', mono: true },
    { key: 'transactions', label: 'Transacciones', align: 'center', mono: true },
    { key: 'total', label: 'Total Vendido', align: 'right', mono: true, bold: true, render: (r) => fmtMoney(r.total) },
    { key: 'averageTicket', label: 'Ticket Prom.', align: 'right', mono: true, render: (r) => fmtMoney(r.averageTicket) },
  ];

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
      <div className="border-b border-slate-100 dark:border-slate-800 pb-5">
        <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100 tracking-tight font-sans">
          Centro de Inteligencia & Reportes
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Productos, clientes y personal con filtros por período y exportación.
        </p>
      </div>

      {/* Main tabs */}
      <div className="flex border-b border-slate-100 dark:border-slate-800 gap-6">
        {[
          { id: 'PRODUCTS', label: 'Productos', icon: Package },
          { id: 'CUSTOMERS', label: 'Clientes', icon: Users },
          { id: 'STAFF', label: 'Personal / Cajas', icon: UserCheck },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`pb-3 text-sm font-bold transition-all relative cursor-pointer flex items-center gap-1.5 ${
              tab === t.id ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400 hover:text-slate-600'
            }`}
          >
            <t.icon className="w-4 h-4" /> {t.label}
            {tab === t.id && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-600 rounded-full" />}
          </button>
        ))}
      </div>

      {/* Filters */}
      <form onSubmit={handleApply} className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-xl p-4 shadow-sm flex flex-col lg:flex-row gap-4 items-stretch lg:items-center">
        <div className="flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-300">
          <Calendar className="w-4 h-4 text-indigo-500" />
          <span>Período:</span>
        </div>
        <select
          value={preset}
          onChange={(e) => setPreset(e.target.value)}
          className="border border-slate-200 dark:border-slate-800 bg-transparent px-3 py-1.5 rounded-lg text-slate-700 dark:text-slate-300 outline-none text-xs"
        >
          {DATE_PRESETS.map((p) => (
            <option key={p.id} value={p.id} className="dark:bg-slate-950">{p.label}</option>
          ))}
        </select>
        {preset === 'custom' && (
          <>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="border border-slate-200 dark:border-slate-800 bg-transparent px-3 py-1.5 rounded-lg text-slate-700 dark:text-slate-300 outline-none text-xs"
            />
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="border border-slate-200 dark:border-slate-800 bg-transparent px-3 py-1.5 rounded-lg text-slate-700 dark:text-slate-300 outline-none text-xs"
            />
          </>
        )}

        {tab === 'PRODUCTS' && (
          <>
            <select
              value={productView}
              onChange={(e) => setProductView(e.target.value)}
              className="border border-slate-200 dark:border-slate-800 bg-transparent px-3 py-1.5 rounded-lg text-slate-700 dark:text-slate-300 outline-none text-xs"
            >
              <option value="top-sold" className="dark:bg-slate-950">Más vendidos</option>
              <option value="most-profitable" className="dark:bg-slate-950">Más rentables</option>
              <option value="low-margin" className="dark:bg-slate-950">Menor margen</option>
              <option value="by-category" className="dark:bg-slate-950">Por categoría</option>
            </select>
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="border border-slate-200 dark:border-slate-800 bg-transparent px-3 py-1.5 rounded-lg text-slate-700 dark:text-slate-300 outline-none text-xs"
            >
              <option value="" className="dark:bg-slate-950">Todas las categorías</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id} className="dark:bg-slate-950">{c.name}</option>
              ))}
            </select>
          </>
        )}

        {tab === 'CUSTOMERS' && (
          <>
            <select
              value={customerView}
              onChange={(e) => setCustomerView(e.target.value)}
              className="border border-slate-200 dark:border-slate-800 bg-transparent px-3 py-1.5 rounded-lg text-slate-700 dark:text-slate-300 outline-none text-xs"
            >
              <option value="top-amount" className="dark:bg-slate-950">Por monto</option>
              <option value="top-frequency" className="dark:bg-slate-950">Por frecuencia</option>
            </select>
            <select
              value={docType}
              onChange={(e) => setDocType(e.target.value)}
              className="border border-slate-200 dark:border-slate-800 bg-transparent px-3 py-1.5 rounded-lg text-slate-700 dark:text-slate-300 outline-none text-xs"
            >
              <option value="" className="dark:bg-slate-950">Todos los documentos</option>
              <option value="CEDULA" className="dark:bg-slate-950">Cédula</option>
              <option value="RNC" className="dark:bg-slate-950">RNC</option>
            </select>
            <input
              type="text"
              placeholder="Buscar cliente..."
              value={customerSearch}
              onChange={(e) => setCustomerSearch(e.target.value)}
              className="border border-slate-200 dark:border-slate-800 bg-transparent px-3 py-1.5 rounded-lg text-slate-700 dark:text-slate-300 outline-none text-xs"
            />
          </>
        )}

        {tab === 'STAFF' && (
          <>
            <select
              value={staffUserId}
              onChange={(e) => setStaffUserId(e.target.value)}
              className="border border-slate-200 dark:border-slate-800 bg-transparent px-3 py-1.5 rounded-lg text-slate-700 dark:text-slate-300 outline-none text-xs"
            >
              <option value="" className="dark:bg-slate-950">Todas las cajas</option>
              {users.map((u) => (
                <option key={u.id} value={u.id} className="dark:bg-slate-950">{u.fullName || u.username}</option>
              ))}
            </select>
            <select
              value={staffPayment}
              onChange={(e) => setStaffPayment(e.target.value)}
              className="border border-slate-200 dark:border-slate-800 bg-transparent px-3 py-1.5 rounded-lg text-slate-700 dark:text-slate-300 outline-none text-xs"
            >
              <option value="" className="dark:bg-slate-950">Todos los pagos</option>
              <option value="EFECTIVO" className="dark:bg-slate-950">Efectivo</option>
              <option value="TARJETA" className="dark:bg-slate-950">Tarjeta</option>
            </select>
          </>
        )}

        <button
          type="submit"
          className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold px-4 py-2 rounded-lg transition-all shadow-sm cursor-pointer"
        >
          Aplicar Filtros
        </button>
      </form>

      {error && (
        <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/50 rounded-xl p-4 text-center text-red-600 dark:text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* PRODUCTS TAB */}
      {tab === 'PRODUCTS' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
            <KpiCard label="Unidades Vendidas" value={(productData.data || []).reduce((s, r) => s + (r.quantity || 0), 0)} icon={Package} tone="indigo" />
            <KpiCard label="Producto Top" value={productData.topProduct?.name?.slice(0, 18) || productRows[0]?.name?.slice(0, 18) || '-'} icon={TrendingUp} tone="emerald" />
            <KpiCard label="Más Rentable" value={productRows.length ? fmtMoney(Math.max(...productRows.map((r) => r.profit || 0))) : '$0.00'} icon={BarChart2} tone="blue" />
            <KpiCard label="Margen Promedio" value={productRows.length ? `${(productRows.reduce((s, r) => s + (r.margin || 0), 0) / productRows.length).toFixed(1)}%` : '-'} icon={Layers} tone="amber" />
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 p-5 rounded-xl shadow-sm space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-50 dark:border-slate-800 flex-wrap gap-3">
              <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">
                {productView === 'top-sold' && 'Productos Más Vendidos'}
                {productView === 'most-profitable' && 'Productos Más Rentables'}
                {productView === 'low-margin' && 'Productos con Menor Margen'}
                {productView === 'by-category' && 'Productos por Categoría'}
              </h3>
              <ExportButtons
                disabled={productRows.length === 0}
                onExport={(f) => handleExport(f, productRows, productColumns, `productos_${productView}`)}
              />
            </div>
            <DataTable columns={productColumns} rows={productRows} />
          </div>
        </div>
      )}

      {/* CUSTOMERS TAB */}
      {tab === 'CUSTOMERS' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
            <KpiCard label="Clientes Únicos" value={customerData.uniqueCustomers ?? customerRows.length} icon={Users} tone="indigo" />
            <KpiCard label="Mejor Cliente" value={customerData.topCustomer?.name?.slice(0, 18) || customerRows[0]?.name?.slice(0, 18) || '-'} icon={TrendingUp} tone="emerald" />
            <KpiCard label="Mayor Compra" value={fmtMoney(customerData.topCustomer?.totalSpent ?? Math.max(0, ...customerRows.map((r) => r.totalSpent || 0)))} icon={BarChart2} tone="blue" />
            <KpiCard label="Ticket Promedio" value={fmtMoney(customerData.averageTicket ?? 0)} icon={Layers} tone="amber" />
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 p-5 rounded-xl shadow-sm space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-50 dark:border-slate-800 flex-wrap gap-3">
              <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">
                {customerView === 'top-amount' ? 'Top Clientes por Monto' : 'Top Clientes por Frecuencia'}
              </h3>
              <ExportButtons
                disabled={customerRows.length === 0}
                onExport={(f) => handleExport(f, customerRows, customerColumns, `clientes_${customerView}`)}
              />
            </div>
            <div className="overflow-x-auto flex-1">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="text-slate-400 font-mono py-2 border-b border-slate-100 dark:border-slate-800">
                    <th className="pb-2 font-normal">Cliente</th>
                    <th className="pb-2 font-normal">Documento</th>
                    <th className="pb-2 text-center font-normal">Compras</th>
                    <th className="pb-2 text-right font-normal">Total</th>
                    <th className="pb-2 text-right font-normal">Detalle</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
                  {customerRows.map((r) => (
                    <React.Fragment key={r.customerId}>
                      <tr className="text-slate-600 dark:text-slate-400 hover:bg-slate-50/50">
                        <td className="py-2.5 font-semibold text-slate-800 dark:text-slate-200">{r.name}</td>
                        <td className="py-2.5 font-mono">{r.documentId}</td>
                        <td className="py-2.5 text-center font-mono">{r.orders}</td>
                        <td className="py-2.5 text-right font-bold font-mono text-slate-900 dark:text-slate-100">{fmtMoney(r.totalSpent)}</td>
                        <td className="py-2.5 text-right">
                          <button
                            onClick={() => loadHistory(r.customerId)}
                            className="text-[11px] font-semibold text-indigo-500 hover:text-indigo-600 cursor-pointer"
                          >
                            {selectedCustomer === r.customerId ? 'Ocultar' : 'Ver historial'}
                          </button>
                        </td>
                      </tr>
                      {selectedCustomer === r.customerId && (
                        <tr>
                          <td colSpan={5} className="py-3 bg-slate-50/60 dark:bg-slate-800/20">
                            {historyLoading ? (
                              <p className="text-xs text-slate-400 text-center py-4">Cargando historial...</p>
                            ) : customerHistory?.sales ? (
                              <div className="space-y-1.5 px-2">
                                <p className="text-[11px] font-mono text-slate-400">
                                  {customerHistory.orders} compras · Total {fmtMoney(customerHistory.totalSpent)}
                                </p>
                                {customerHistory.sales.slice(0, 8).map((s) => (
                                  <div key={s.id} className="flex justify-between text-xs font-mono text-slate-600 dark:text-slate-400 border-b border-slate-100 dark:border-slate-800/50 pb-1.5">
                                    <span>{s.invoiceNumber} · {new Date(s.createdAt).toLocaleDateString('es-DO')}</span>
                                    <span className="font-bold text-slate-800 dark:text-slate-200">{fmtMoney(s.total)}</span>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <p className="text-xs text-red-400 text-center py-4">{customerHistory?.error || 'Sin historial'}</p>
                            )}
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                  {customerRows.length === 0 && (
                    <tr>
                      <td colSpan={5} className="text-center py-8 text-slate-400">Sin datos registrados</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* STAFF TAB */}
      {tab === 'STAFF' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
            <KpiCard label="Transacciones" value={staffData.totalTransactions ?? staffRows.reduce((s, r) => s + (r.transactions || 0), 0)} icon={BarChart2} tone="indigo" />
            <KpiCard label="Mejor Caja" value={staffData.bestPerformer?.fullName?.slice(0, 18) || staffRows[0]?.fullName?.slice(0, 18) || '-'} icon={TrendingUp} tone="emerald" />
            <KpiCard label="Total Vendido" value={fmtMoney(staffRows.reduce((s, r) => s + (r.total || 0), 0))} icon={Users} tone="blue" />
            <KpiCard label="Hora Pico" value={staffPayments.peakHours?.[0]?.hour || '-'} icon={UserCheck} tone="amber" />
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 p-5 rounded-xl shadow-sm space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-50 dark:border-slate-800 flex-wrap gap-3">
              <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">Rendimiento por Caja</h3>
              <ExportButtons
                disabled={staffRows.length === 0}
                onExport={(f) => handleExport(f, staffRows, staffColumns, 'cajas_rendimiento')}
              />
            </div>
            <DataTable columns={staffColumns} rows={staffRows} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 p-5 rounded-xl shadow-sm space-y-4">
              <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 pb-2 border-b border-slate-50 dark:border-slate-800">
                Métodos de Pago por Caja
              </h3>
              <DataTable
                columns={[
                  { key: 'fullName', label: 'Caja', bold: true },
                  { key: 'cashTotal', label: 'Efectivo', align: 'right', mono: true, render: (r) => fmtMoney(r.cashTotal) },
                  { key: 'cardTotal', label: 'Tarjeta', align: 'right', mono: true, render: (r) => fmtMoney(r.cardTotal) },
                  { key: 'total', label: 'Total', align: 'right', mono: true, bold: true, render: (r) => fmtMoney(r.total) },
                ]}
                rows={staffPayments.byUser || []}
                emptyMessage="Sin movimientos"
              />
            </div>

            <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 p-5 rounded-xl shadow-sm space-y-4">
              <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 pb-2 border-b border-slate-50 dark:border-slate-800">
                Horarios Pico
              </h3>
              <DataTable
                columns={[
                  { key: 'hour', label: 'Hora', mono: true, bold: true },
                  { key: 'count', label: 'Ventas', align: 'center', mono: true },
                ]}
                rows={staffPayments.peakHours || []}
                emptyMessage="Sin datos"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
