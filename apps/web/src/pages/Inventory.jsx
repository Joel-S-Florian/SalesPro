import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import { Loader2, Plus, Search, ArrowUpRight, ArrowDownLeft, FileText, AlertTriangle, ListFilter, ShoppingCart } from 'lucide-react';
import Modal from '../components/Modal';

export default function Inventory() {
  const [products, setProducts] = useState([]);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Search & Filter state
  const [tab, setTab] = useState('STOCK');
  const [search, setSearch] = useState('');
  const [logTypeFilter, setLogTypeFilter] = useState('ALL');

  // Adjustment Modal states
  const [isAdjustOpen, setIsAdjustOpen] = useState(false);
  const [selectedProdId, setSelectedProdId] = useState('');
  const [adjustType, setAdjustType] = useState('Entrada');
  const [adjustQty, setAdjustQty] = useState(1);
  const [adjustReason, setAdjustReason] = useState('');
  const [submittingAdjust, setSubmittingAdjust] = useState(false);

  // Purchase Modal states
  const [isPurchaseOpen, setIsPurchaseOpen] = useState(false);
  const [purchaseProdId, setPurchaseProdId] = useState('');
  const [purchaseQty, setPurchaseQty] = useState(1);
  const [purchaseUnitCost, setPurchaseUnitCost] = useState(0);
  const [purchaseSupplier, setPurchaseSupplier] = useState('');
  const [purchaseInvoice, setPurchaseInvoice] = useState('');
  const [submittingPurchase, setSubmittingPurchase] = useState(false);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const [pList, lList] = await Promise.all([
        api.products.list(),
        api.inventory.logs()
      ]);
      const safePList = Array.isArray(pList) ? pList : (pList?.data || []);
      const safeLList = Array.isArray(lList) ? lList : (lList?.data || []);
      setProducts(safePList);
      setLogs(safeLList);
      if (safePList.length > 0) {
        setSelectedProdId(safePList[0].id);
      }
    } catch (err) {
      setError(err.message || 'Error al cargar inventario');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const openAdjustmentModal = () => {
    const activeProds = (Array.isArray(products) ? products : []).filter(p => p.active);
    if (activeProds.length > 0) {
      setSelectedProdId(activeProds[0].id);
    }
    setAdjustType('Entrada');
    setAdjustQty(1);
    setAdjustReason('');
    setIsAdjustOpen(true);
  };

  const openPurchaseModal = () => {
    const activeProds = (Array.isArray(products) ? products : []).filter(p => p.active);
    if (activeProds.length > 0) {
      setPurchaseProdId(activeProds[0].id);
    }
    setPurchaseQty(1);
    setPurchaseUnitCost(0);
    setPurchaseSupplier('');
    setPurchaseInvoice('');
    setIsPurchaseOpen(true);
  };

  const handleRegisterPurchase = async (e) => {
    e.preventDefault();
    if (!purchaseProdId || purchaseQty <= 0 || purchaseUnitCost <= 0 || !purchaseSupplier.trim()) {
      alert('Por favor complete proveedor, producto, cantidad y costo correctamente');
      return;
    }

    try {
      setSubmittingPurchase(true);
      await api.inventory.purchase({
        productId: purchaseProdId,
        quantity: Number(purchaseQty),
        unitCost: Number(purchaseUnitCost),
        supplier: purchaseSupplier.trim(),
        invoiceNumber: purchaseInvoice.trim() || undefined,
      });
      setIsPurchaseOpen(false);
      loadData();
    } catch (err) {
      alert(err.message || 'Error al registrar compra');
    } finally {
      setSubmittingPurchase(false);
    }
  };

  const handleAdjustStock = async (e) => {
    e.preventDefault();
    if (!selectedProdId || adjustQty <= 0 || !adjustReason.trim()) {
      alert('Por favor llene todos los campos correctamente');
      return;
    }

    const prod = (Array.isArray(products) ? products : []).find(p => p.id === selectedProdId);
    if (adjustType === 'Salida' && prod && prod.stock < adjustQty) {
      alert(`Error: El stock actual (${prod.stock}) es menor que la cantidad de salida solicitada (${adjustQty}).`);
      return;
    }

    try {
      setSubmittingAdjust(true);
      await api.inventory.adjust({
        productId: selectedProdId,
        type: adjustType.toUpperCase(),
        quantity: Number(adjustQty),
        reason: adjustReason
      });
      setIsAdjustOpen(false);
      loadData();
    } catch (err) {
      alert(err.message || 'Error al procesar ajuste de inventario');
    } finally {
      setSubmittingAdjust(false);
    }
  };

  const safeProducts = Array.isArray(products) ? products : [];
  const safeLogs = Array.isArray(logs) ? logs : [];

  // Filters
  const filteredProducts = safeProducts.filter(p =>
    (p.name || '').toLowerCase().includes((search || '').toLowerCase()) ||
    (p.code || '').toLowerCase().includes((search || '').toLowerCase())
  );

  const filteredLogs = safeLogs.filter(l => {
    const pName = l.productName || l.product?.name || '';
    const reasonStr = l.reason || '';
    const searchLower = (search || '').toLowerCase();
    const matchesSearch = pName.toLowerCase().includes(searchLower) || reasonStr.toLowerCase().includes(searchLower);
    const lType = (l.type || '').toUpperCase();
    const fType = (logTypeFilter || '').toUpperCase();
    const matchesType = fType === 'ALL' || lType === fType || (fType === 'ENTRADA' && lType.includes('ENTRADA')) || (fType === 'SALIDA' && lType.includes('SALIDA'));
    return matchesSearch && matchesType;
  });

  if (loading && safeProducts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-96 space-y-4">
        <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
        <p className="text-slate-500 text-sm font-mono">Cargando módulos de inventario...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6" id="inventory-view">
      {/* Header and Adjustment Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-5">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100 tracking-tight font-sans">
            Módulo de Inventario (Kárdex)
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Control de almacén, entradas, salidas y logs de auditoría comercial.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
          <button
            onClick={openPurchaseModal}
            className="flex items-center gap-1.5 border border-indigo-200 dark:border-indigo-800 hover:bg-indigo-50 dark:hover:bg-indigo-950/30 text-indigo-600 dark:text-indigo-400 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all w-full sm:w-auto justify-center cursor-pointer"
          >
            <ShoppingCart className="w-4 h-4" /> Registrar Compra
          </button>
          <button
            onClick={openAdjustmentModal}
            className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 rounded-lg text-sm font-semibold shadow-sm hover:shadow transition-all w-full sm:w-auto justify-center cursor-pointer"
          >
            <Plus className="w-4 h-4" /> Ajustar Stock Manual
          </button>
        </div>
      </div>

      {/* Tabs selector */}
      <div className="flex border-b border-slate-100 dark:border-slate-800 gap-4">
        <button
          onClick={() => { setTab('STOCK'); setSearch(''); }}
          className={`pb-3 text-sm font-bold transition-all relative cursor-pointer ${
            tab === 'STOCK' ? 'text-indigo-600 dark:text-indigo-400 font-extrabold' : 'text-slate-400 hover:text-slate-600'
          }`}
        >
          Existencias en Almacén
          {tab === 'STOCK' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-600 rounded-full" />}
        </button>
        <button
          onClick={() => { setTab('LOGS'); setSearch(''); }}
          className={`pb-3 text-sm font-bold transition-all relative cursor-pointer ${
            tab === 'LOGS' ? 'text-indigo-600 dark:text-indigo-400 font-extrabold' : 'text-slate-400 hover:text-slate-600'
          }`}
        >
          Historial de Movimientos
          {tab === 'LOGS' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-600 rounded-full" />}
        </button>
      </div>

      {/* Filter toolbar */}
      <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-xl p-4 shadow-sm flex flex-col md:flex-row gap-4 items-center justify-between">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-3 top-3 w-4.5 h-4.5 text-slate-400" />
          <input
            type="text"
            placeholder={tab === 'STOCK' ? 'Buscar productos por código o nombre...' : 'Buscar movimientos por producto, motivo...'}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-800 dark:text-slate-100 bg-transparent text-sm focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
          />
        </div>

        {tab === 'LOGS' && (
          <div className="flex items-center gap-2 text-xs text-slate-500 w-full md:w-auto justify-end">
            <ListFilter className="w-3.5 h-3.5" />
            <span>Tipo Movimiento:</span>
            <select
              value={logTypeFilter}
              onChange={(e) => setLogTypeFilter(e.target.value)}
              className="border border-slate-200 dark:border-slate-800 bg-transparent px-2 py-1 rounded-lg text-slate-700 dark:text-slate-300 outline-none text-xs"
            >
              <option value="ALL">Todos</option>
              <option value="Entrada">Entradas (Reabastecimientos)</option>
              <option value="Salida">Salidas (Ventas / Mermas)</option>
            </select>
          </div>
        )}
      </div>

      {/* Main tables tab router */}
      {tab === 'STOCK' ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-xl shadow-sm overflow-hidden">
          <table className="w-full text-left text-xs text-slate-600 dark:text-slate-400">
            <thead className="bg-slate-50 dark:bg-slate-800/40 text-slate-400 uppercase font-mono tracking-wider">
              <tr>
                <th className="px-6 py-4">Código</th>
                <th className="px-6 py-4">Producto</th>
                <th className="px-6 py-4 text-center">Mínimo</th>
                <th className="px-6 py-4 text-center">Stock Disponible</th>
                <th className="px-6 py-4 text-center">Estado Almacén</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredProducts.map((p) => {
                const isLow = p.stock <= p.minStock && p.stock > 0;
                const isOut = p.stock === 0;

                return (
                  <tr key={p.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/25 transition-colors">
                    <td className="px-6 py-4 font-mono font-semibold text-slate-900 dark:text-slate-100">
                      {p.code}
                    </td>
                    <td className="px-6 py-4">
                      <span className="font-semibold text-slate-800 dark:text-slate-200">{p.name}</span>
                    </td>
                    <td className="px-6 py-4 text-center font-mono font-semibold text-slate-400">{p.minStock}</td>
                    <td className="px-6 py-4 text-center">
                      <span className={`px-2.5 py-0.5 rounded-full font-bold font-mono text-[11px] ${
                        isOut ? 'bg-rose-50 dark:bg-rose-950/20 text-rose-600' :
                        isLow ? 'bg-amber-50 dark:bg-amber-950/20 text-amber-600' :
                        'bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600'
                      }`}>
                        {p.stock} unidades
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      {isOut ? (
                        <span className="text-[10px] text-rose-500 font-bold uppercase tracking-wider flex items-center justify-center gap-1">
                          <AlertTriangle className="w-3.5 h-3.5" /> Agotado
                        </span>
                      ) : isLow ? (
                        <span className="text-[10px] text-amber-500 font-bold uppercase tracking-wider flex items-center justify-center gap-1">
                          <AlertTriangle className="w-3.5 h-3.5 animate-pulse" /> Reabastecer
                        </span>
                      ) : (
                        <span className="text-[10px] text-emerald-500 font-bold uppercase tracking-wider">Estable</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {filteredProducts.length === 0 && (
                <tr>
                  <td colSpan={5} className="text-center py-10 text-slate-400 font-mono">
                    Ningún producto disponible en almacén.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-xl shadow-sm overflow-hidden">
          <table className="w-full text-left text-xs text-slate-600 dark:text-slate-400">
            <thead className="bg-slate-50 dark:bg-slate-800/40 text-slate-400 uppercase font-mono tracking-wider">
              <tr>
                <th className="px-6 py-4">Fecha</th>
                <th className="px-6 py-4">Producto</th>
                <th className="px-6 py-4 text-center">Tipo</th>
                <th className="px-6 py-4 text-center">Cantidad</th>
                <th className="px-6 py-4">Motivo / Documento</th>
                <th className="px-6 py-4">Responsable</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredLogs.map((log) => (
                <tr key={log.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/25 transition-colors">
                  <td className="px-6 py-4 font-mono text-slate-400">
                    {log.createdAt ? new Date(log.createdAt).toLocaleString() : '-'}
                  </td>
                  <td className="px-6 py-4">
                    <span className="font-semibold text-slate-800 dark:text-slate-200">
                      {log.productName || log.product?.name || 'Producto'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1 w-max mx-auto ${
                      (log.type || '').toUpperCase().includes('ENTRADA') ? 'bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600' : 'bg-rose-50 dark:bg-rose-950/20 text-rose-600'
                    }`}>
                      {(log.type || '').toUpperCase().includes('ENTRADA') ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownLeft className="w-3.5 h-3.5" />}
                      {(log.type || '').toUpperCase().includes('ENTRADA') ? 'Entrada' : 'Salida'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-center font-bold font-mono text-slate-950 dark:text-slate-50">
                    {log.quantity} uds.
                  </td>
                  <td className="px-6 py-4 text-slate-500 font-mono text-[11px] flex items-center gap-1">
                    <FileText className="w-3.5 h-3.5 text-slate-300" />
                    {log.reason || '-'}
                  </td>
                  <td className="px-6 py-4 text-slate-400">{log.userName || log.user?.fullName || 'Sistema'}</td>
                </tr>
              ))}
              {filteredLogs.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center py-10 text-slate-400 font-mono">
                    No se registran movimientos en el historial.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Stock Adjust manual Modal */}
      <Modal
        isOpen={isAdjustOpen}
        onClose={() => setIsAdjustOpen(false)}
        title="Ajuste Manual de Inventario"
        maxWidth="md"
      >
        <form onSubmit={handleAdjustStock} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5 col-span-1 md:col-span-2">
              <label htmlFor="adjust-prod" className="block text-xs font-semibold text-slate-600 dark:text-slate-400">
                Seleccionar Producto *
              </label>
              <select
                id="adjust-prod"
                value={selectedProdId}
                onChange={(e) => setSelectedProdId(e.target.value)}
                className="w-full px-3.5 py-2 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-800 dark:text-slate-100 bg-transparent focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-xs"
              >
                {products.filter(p => p.active).map(p => (
                  <option key={p.id} value={p.id} className="dark:bg-slate-950">
                    {p.name} (Stock: {p.stock})
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="adjust-type" className="block text-xs font-semibold text-slate-600 dark:text-slate-400">
                Tipo de Ajuste *
              </label>
              <select
                id="adjust-type"
                value={adjustType}
                onChange={(e) => setAdjustType(e.target.value)}
                className="w-full px-3.5 py-2 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-800 dark:text-slate-100 bg-transparent focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-xs"
              >
                <option value="Entrada" className="dark:bg-slate-950">Entrada (+) Reabastecimiento / Compra</option>
                <option value="Salida" className="dark:bg-slate-950">Salida (-) Retiro / Mermas / Ajustes</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="adjust-qty" className="block text-xs font-semibold text-slate-600 dark:text-slate-400">
                Cantidad de Unidades *
              </label>
              <input
                id="adjust-qty"
                type="number"
                min="1"
                required
                value={adjustQty}
                onChange={(e) => setAdjustQty(Math.max(1, parseInt(e.target.value) || 0))}
                className="w-full px-3.5 py-2 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-800 dark:text-slate-100 bg-transparent focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-xs font-mono"
              />
            </div>

            <div className="col-span-1 md:col-span-2 space-y-1.5">
              <label htmlFor="adjust-reason" className="block text-xs font-semibold text-slate-600 dark:text-slate-400">
                Motivo / Razón del Ajuste *
              </label>
              <input
                id="adjust-reason"
                type="text"
                required
                placeholder="Ej. Compra a Distribuidor, Merma por vencimiento, Corrección stock..."
                value={adjustReason}
                onChange={(e) => setAdjustReason(e.target.value)}
                className="w-full px-3.5 py-2 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-800 dark:text-slate-100 bg-transparent focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-xs"
              />
            </div>
          </div>

          <div className="flex gap-3 pt-3 justify-end">
            <button
              type="button"
              onClick={() => setIsAdjustOpen(false)}
              className="px-4 py-2 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs font-medium rounded-lg transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submittingAdjust || !adjustReason.trim()}
              className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white text-xs font-medium px-4 py-2 rounded-lg shadow-sm transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              {submittingAdjust ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> Registrando...
                </>
              ) : (
                'Registrar Movimiento'
              )}
            </button>
          </div>
        </form>
      </Modal>

      {/* Purchase Modal */}
      <Modal
        isOpen={isPurchaseOpen}
        onClose={() => setIsPurchaseOpen(false)}
        title="Registrar Compra a Proveedor"
        maxWidth="md"
      >
        <form onSubmit={handleRegisterPurchase} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5 col-span-1 md:col-span-2">
              <label htmlFor="purchase-supplier" className="block text-xs font-semibold text-slate-600 dark:text-slate-400">
                Proveedor *
              </label>
              <input
                id="purchase-supplier"
                type="text"
                required
                placeholder="Ej. Distribuidora Nacional SRL"
                value={purchaseSupplier}
                onChange={(e) => setPurchaseSupplier(e.target.value)}
                className="w-full px-3.5 py-2 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-800 dark:text-slate-100 bg-transparent focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-xs"
              />
            </div>

            <div className="space-y-1.5 col-span-1 md:col-span-2">
              <label htmlFor="purchase-prod" className="block text-xs font-semibold text-slate-600 dark:text-slate-400">
                Producto *
              </label>
              <select
                id="purchase-prod"
                value={purchaseProdId}
                onChange={(e) => setPurchaseProdId(e.target.value)}
                className="w-full px-3.5 py-2 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-800 dark:text-slate-100 bg-transparent focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-xs"
              >
                {products.filter(p => p.active).map(p => (
                  <option key={p.id} value={p.id} className="dark:bg-slate-950">
                    {p.name} (Stock: {p.stock})
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="purchase-qty" className="block text-xs font-semibold text-slate-600 dark:text-slate-400">
                Cantidad *
              </label>
              <input
                id="purchase-qty"
                type="number"
                min="1"
                required
                value={purchaseQty}
                onChange={(e) => setPurchaseQty(Math.max(1, parseInt(e.target.value) || 0))}
                className="w-full px-3.5 py-2 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-800 dark:text-slate-100 bg-transparent focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-xs font-mono"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="purchase-cost" className="block text-xs font-semibold text-slate-600 dark:text-slate-400">
                Costo Unitario (USD) *
              </label>
              <input
                id="purchase-cost"
                type="number"
                min="0.01"
                step="0.01"
                required
                value={purchaseUnitCost}
                onChange={(e) => setPurchaseUnitCost(Math.max(0, parseFloat(e.target.value) || 0))}
                className="w-full px-3.5 py-2 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-800 dark:text-slate-100 bg-transparent focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-xs font-mono"
              />
            </div>

            <div className="space-y-1.5 col-span-1 md:col-span-2">
              <label htmlFor="purchase-invoice" className="block text-xs font-semibold text-slate-600 dark:text-slate-400">
                N° Factura Proveedor
              </label>
              <input
                id="purchase-invoice"
                type="text"
                placeholder="Ej. FAC-009283"
                value={purchaseInvoice}
                onChange={(e) => setPurchaseInvoice(e.target.value)}
                className="w-full px-3.5 py-2 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-800 dark:text-slate-100 bg-transparent focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-xs font-mono"
              />
            </div>
          </div>

          <div className="bg-slate-50 dark:bg-slate-800/40 rounded-lg px-4 py-3 flex items-center justify-between text-sm">
            <span className="text-slate-500 dark:text-slate-400 font-medium">Total a Pagar:</span>
            <span className="font-mono font-bold text-slate-900 dark:text-slate-100">
              ${(Number(purchaseQty || 0) * Number(purchaseUnitCost || 0)).toFixed(2)}
            </span>
          </div>

          <div className="flex gap-3 pt-1 justify-end">
            <button
              type="button"
              onClick={() => setIsPurchaseOpen(false)}
              className="px-4 py-2 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs font-medium rounded-lg transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submittingPurchase}
              className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white text-xs font-medium px-4 py-2 rounded-lg shadow-sm transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              {submittingPurchase ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> Registrando...
                </>
              ) : (
                'Registrar Compra y Actualizar Stock'
              )}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
