import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import { Loader2, Plus, Search, ArrowUpRight, ArrowDownLeft, FileText, AlertTriangle, ListFilter, ShoppingCart } from 'lucide-react';
import Modal from '../components/Modal';
import Pagination from '../components/Pagination';
import ProductPicker from '../components/ProductPicker';
import { TableSkeleton } from '../components/Skeleton';
import { usePagedList } from '../hooks/usePagedList';
import { notify } from '../utils/notify';
import { useConfigStore } from '../stores/configStore';
import { formatQty, isFractional, unitInfo } from '../utils/units';
import BatchFields from '../components/inventory/BatchFields';
import ExpiringBatches from '../components/inventory/ExpiringBatches';
import ExpiryBadge from '../components/inventory/ExpiryBadge';
import SmartSelect from '../components/ui/SmartSelect';

export default function Inventory() {
  // Search & Filter state
  const perishableEnabled = useConfigStore(state => state.config.perishable?.enabled);
  const [tab, setTab] = useState('STOCK');
  const [batchesReload, setBatchesReload] = useState(0);
  const [search, setSearch] = useState('');
  const [logTypeFilter, setLogTypeFilter] = useState('ALL');

  const stock = usePagedList(
    params => (tab === 'STOCK' ? api.products.page(params) : Promise.resolve({ data: [], pagination: { total: 0 } })),
    { tab, q: tab === 'STOCK' ? search.trim() || undefined : undefined }
  );
  const history = usePagedList(
    params => (tab === 'LOGS' ? api.inventory.logsPage(params) : Promise.resolve({ data: [], pagination: { total: 0 } })),
    {
      tab,
      q: tab === 'LOGS' ? search.trim() || undefined : undefined,
      type: tab === 'LOGS' && logTypeFilter !== 'ALL' ? logTypeFilter.toUpperCase() : undefined,
    }
  );
  const current = tab === 'STOCK' ? stock : history;
  const reload = () => {
    stock.reload();
    history.reload();
    setBatchesReload(n => n + 1);
  };

  // Adjustment Modal states
  const [isAdjustOpen, setIsAdjustOpen] = useState(false);
  const [selectedProdId, setSelectedProdId] = useState('');
  const [selectedProd, setSelectedProd] = useState(null);
  const [adjustType, setAdjustType] = useState('Entrada');
  const [adjustQty, setAdjustQty] = useState(1);
  const [adjustReason, setAdjustReason] = useState('');
  const [submittingAdjust, setSubmittingAdjust] = useState(false);
  const [adjustBatch, setAdjustBatch] = useState({ batchNumber: '', expirationDate: '' });
  const [adjustBatchId, setAdjustBatchId] = useState(null); // baja de un lote concreto

  // Purchase Modal states
  const [isPurchaseOpen, setIsPurchaseOpen] = useState(false);
  const [purchaseProdId, setPurchaseProdId] = useState('');
  const [purchaseQty, setPurchaseQty] = useState(1);
  const [purchaseUnitCost, setPurchaseUnitCost] = useState(0);
  const [purchaseSupplier, setPurchaseSupplier] = useState('');
  const [suppliers, setSuppliers] = useState([]);
  const [purchaseInvoice, setPurchaseInvoice] = useState('');
  const [purchaseProd, setPurchaseProd] = useState(null);
  const [pinnedProduct, setPinnedProduct] = useState(null);
  const [purchaseBatch, setPurchaseBatch] = useState({ batchNumber: '', expirationDate: '' });
  const [submittingPurchase, setSubmittingPurchase] = useState(false);

  // «Reabastecer» del Dashboard: abre el registro de compra con el producto ya elegido
  useEffect(() => {
    let id = null;
    try {
      id = sessionStorage.getItem('factos-restock-product');
      sessionStorage.removeItem('factos-restock-product');
    } catch {
      // almacenamiento no disponible
    }
    if (!id) return;
    api.products.get(id).then(product => openPurchaseModal(product)).catch(() => notify.error('No se pudo cargar el producto a reabastecer'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openAdjustmentModal = () => {
    setSelectedProdId('');
    setSelectedProd(null);
    setAdjustType('Entrada');
    setAdjustQty(1);
    setAdjustReason('');
    setAdjustBatch({ batchNumber: '', expirationDate: '' });
    setAdjustBatchId(null);
    setIsAdjustOpen(true);
  };

  // Baja rápida de un lote desde la pestaña de vencimientos
  const openWriteOff = batch => {
    setSelectedProdId(batch.product.id);
    setSelectedProd(batch.product);
    setAdjustType('Merma');
    setAdjustQty(batch.currentStock);
    setAdjustReason(`Baja del lote ${batch.batchNumber}${batch.status === 'EXPIRED' ? ' por vencimiento' : ''}`);
    setAdjustBatch({ batchNumber: '', expirationDate: '' });
    setAdjustBatchId(batch.id);
    setIsAdjustOpen(true);
  };

  const openPurchaseModal = (preselected = null) => {
    setPinnedProduct(preselected);
    setPurchaseProdId(preselected?.id || '');
    setPurchaseQty(1);
    setPurchaseUnitCost(preselected ? Number(preselected.costPrice) || 0 : 0);
    setPurchaseSupplier('');
    setPurchaseInvoice('');
    setPurchaseProd(preselected);
    setPurchaseBatch({ batchNumber: '', expirationDate: '' });
    setIsPurchaseOpen(true);
    api.suppliers
      .list({ active: 'true', limit: 100 })
      .then(res => {
        const list = res?.data || [];
        setSuppliers(list);
        // Sin elegir otro, la compra va al «Proveedor general»
        setPurchaseSupplier(list.find(s => s.isDefault)?.id || '');
      })
      .catch(() => setSuppliers([]));
  };

  const handleRegisterPurchase = async (e) => {
    e.preventDefault();
    if (!purchaseProdId || purchaseQty <= 0 || purchaseUnitCost <= 0 || !purchaseSupplier) {
      notify.warning('Por favor complete proveedor, producto, cantidad y costo correctamente');
      return;
    }

    try {
      setSubmittingPurchase(true);
      await api.inventory.purchase({
        productId: purchaseProdId,
        quantity: Number(purchaseQty),
        unitCost: Number(purchaseUnitCost),
        supplierId: purchaseSupplier,
        invoiceNumber: purchaseInvoice.trim() || undefined,
        ...(purchaseProd?.isPerishable ? { batchNumber: purchaseBatch.batchNumber.trim(), expirationDate: purchaseBatch.expirationDate } : {}),
      });
      setIsPurchaseOpen(false);
      notify.success('Compra registrada');
      reload();
    } catch (err) {
      notify.error(err.message || 'Error al registrar compra');
    } finally {
      setSubmittingPurchase(false);
    }
  };

  const handleAdjustStock = async (e) => {
    e.preventDefault();
    if (!selectedProdId || adjustQty <= 0 || !adjustReason.trim()) {
      notify.warning('Por favor llene todos los campos correctamente');
      return;
    }

    const prod = selectedProd;
    if ((adjustType === 'Salida' || adjustType === 'Merma') && prod && prod.stock < adjustQty) {
      notify.warning(`Error: El stock actual (${prod.stock}) es menor que la cantidad de salida solicitada (${adjustQty}).`);
      return;
    }

    try {
      setSubmittingAdjust(true);
      await api.inventory.adjust({
        productId: selectedProdId,
        type: adjustType.toUpperCase(),
        quantity: Number(adjustQty),
        reason: adjustReason,
        ...(adjustBatchId ? { batchId: adjustBatchId } : {}),
        ...(selectedProd?.isPerishable && adjustType === 'Entrada' ? { batchNumber: adjustBatch.batchNumber.trim(), expirationDate: adjustBatch.expirationDate } : {}),
      });
      setIsAdjustOpen(false);
      notify.success('Ajuste de inventario registrado');
      reload();
    } catch (err) {
      notify.error(err.message || 'Error al procesar ajuste de inventario');
    } finally {
      setSubmittingAdjust(false);
    }
  };

  const filteredProducts = stock.rows;
  const filteredLogs = history.rows;

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
            onClick={() => openPurchaseModal()}
            className="flex items-center gap-1.5 border border-indigo-200 dark:border-indigo-800 hover:bg-indigo-50 dark:hover:bg-indigo-950/30 text-indigo-600 dark:text-indigo-400 px-4 py-2.5 rounded-lg text-sm font-semibold transition w-full sm:w-auto justify-center cursor-pointer"
          >
            <ShoppingCart className="w-4 h-4" /> Registrar Compra
          </button>
          <button
            onClick={openAdjustmentModal}
            className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 rounded-lg text-sm font-semibold shadow-sm hover:shadow transition w-full sm:w-auto justify-center cursor-pointer"
          >
            <Plus className="w-4 h-4" /> Ajustar Stock Manual
          </button>
        </div>
      </div>

      {/* Tabs selector */}
      <div className="flex border-b border-slate-100 dark:border-slate-800 gap-4">
        <button
          onClick={() => { setTab('STOCK'); setSearch(''); }}
          className={`pb-3 text-sm font-bold transition relative cursor-pointer ${
            tab === 'STOCK' ? 'text-indigo-600 dark:text-indigo-400 font-extrabold' : 'text-slate-400 hover:text-slate-600'
          }`}
        >
          Existencias en Almacén
          {tab === 'STOCK' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-600 rounded-full" />}
        </button>
        <button
          onClick={() => { setTab('LOGS'); setSearch(''); }}
          className={`pb-3 text-sm font-bold transition relative cursor-pointer ${
            tab === 'LOGS' ? 'text-indigo-600 dark:text-indigo-400 font-extrabold' : 'text-slate-400 hover:text-slate-600'
          }`}
        >
          Historial de Movimientos
          {tab === 'LOGS' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-600 rounded-full" />}
        </button>
        {perishableEnabled && (
          <button
            onClick={() => { setTab('EXPIRING'); setSearch(''); }}
            className={`pb-3 text-sm font-bold transition relative cursor-pointer ${
              tab === 'EXPIRING' ? 'text-indigo-600 dark:text-indigo-400 font-extrabold' : 'text-slate-400 hover:text-slate-600'
            }`}
          >
            Lotes y Vencimientos
            {tab === 'EXPIRING' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-600 rounded-full" />}
          </button>
        )}
      </div>

      {/* Filter toolbar */}
      {tab !== 'EXPIRING' && (
      <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-xl p-4 shadow-sm flex flex-col md:flex-row gap-4 items-center justify-between">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
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
            <SmartSelect
              value={logTypeFilter}
              onChange={(e) => setLogTypeFilter(e.target.value)}
              className="border border-slate-200 dark:border-slate-800 bg-transparent px-2 py-1 rounded-lg text-slate-700 dark:text-slate-300 outline-none text-xs"
            >
              <option value="ALL">Todos</option>
              <option value="Entrada">Entradas (Reabastecimientos)</option>
              <option value="Salida">Salidas (Ventas / Mermas)</option>
            </SmartSelect>
          </div>
        )}
      </div>
      )}

      {/* Main tables tab router */}
      {tab === 'EXPIRING' ? (
        <ExpiringBatches reloadKey={batchesReload} onWriteOff={openWriteOff} />
      ) : tab === 'STOCK' ? (
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
              {stock.loading && filteredProducts.length === 0 && <TableSkeleton rows={stock.pageSize} columns={5} />}
              {filteredProducts.map((p) => {
                const isLow = p.stock <= p.minStock && p.stock > 0;
                const isOut = p.stock === 0;

                return (
                  <tr key={p.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/25 transition-colors">
                    <td className="px-6 py-4 font-mono font-semibold text-slate-900 dark:text-slate-100">
                      {p.code}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-semibold text-slate-800 dark:text-slate-200">{p.name}</span>
                        {p.isPerishable && p.nearestBatch && <ExpiryBadge status={p.nearestBatch.status} daysLeft={p.nearestBatch.daysLeft} />}
                      </div>
                      {p.isPerishable && p.nearestBatch && (
                        <div className="font-mono text-[10px] text-slate-400">Próximo lote: {p.nearestBatch.batchNumber}</div>
                      )}
                    </td>
                    <td className="px-6 py-4 text-center font-mono font-semibold text-slate-400">{p.minStock}</td>
                    <td className="px-6 py-4 text-center">
                      <span className={`px-2.5 py-0.5 rounded-full font-bold font-mono text-[11px] ${
                        isOut ? 'bg-rose-50 dark:bg-rose-950/20 text-rose-600' :
                        isLow ? 'bg-amber-50 dark:bg-amber-950/20 text-amber-600' :
                        'bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600'
                      }`}>
                        {p.unit && p.unit !== 'UND' ? formatQty(p.stock, p.unit) : `${p.stock} unidades`}
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
              {!stock.loading && filteredProducts.length === 0 && (
                <tr>
                  <td colSpan={5} className="text-center py-10 text-slate-400 font-mono">
                    {stock.error || 'Ningún producto disponible en almacén.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          <Pagination page={stock.page} pageSize={stock.pageSize} total={stock.total} onPageChange={stock.setPage} onPageSizeChange={stock.setPageSize} noun="productos" />
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
              {history.loading && filteredLogs.length === 0 && <TableSkeleton rows={history.pageSize} columns={6} />}
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
                      {(log.type || '').toUpperCase().includes('ENTRADA') ? 'Entrada' : (log.type || '').toUpperCase() === 'MERMA' ? 'Merma' : 'Salida'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-center font-bold font-mono text-slate-950 dark:text-slate-50">
                    {Number(log.quantity) % 1 ? Math.round(log.quantity * 100) / 100 : log.quantity} uds.
                  </td>
                  <td className="px-6 py-4 text-slate-500 font-mono text-[11px] flex items-center gap-1">
                    <FileText className="w-3.5 h-3.5 text-slate-300" />
                    {log.reason || '-'}
                  </td>
                  <td className="px-6 py-4 text-slate-400">{log.userName || log.user?.fullName || 'Sistema'}</td>
                </tr>
              ))}
              {!history.loading && filteredLogs.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center py-10 text-slate-400 font-mono">
                    {history.error || 'No se registran movimientos en el historial.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          <Pagination page={history.page} pageSize={history.pageSize} total={history.total} onPageChange={history.setPage} onPageSizeChange={history.setPageSize} noun="movimientos" />
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
              <ProductPicker
                id="adjust-prod"
                value={selectedProdId}
                onChange={(id, product) => {
                  setSelectedProdId(id);
                  setSelectedProd(product || null);
                  setAdjustBatchId(null);
                }}
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="adjust-type" className="block text-xs font-semibold text-slate-600 dark:text-slate-400">
                Tipo de Ajuste *
              </label>
              <SmartSelect
                id="adjust-type"
                value={adjustType}
                onChange={(e) => setAdjustType(e.target.value)}
                className="w-full px-3.5 py-2 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-800 dark:text-slate-100 bg-transparent focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-xs"
              >
                <option value="Entrada" className="dark:bg-slate-950">Entrada (+) Reabastecimiento / Compra</option>
                <option value="Salida" className="dark:bg-slate-950">Salida (-) Retiro / Ajustes</option>
                <option value="Merma" className="dark:bg-slate-950">Merma (-) Vencido, dañado o perdido (con costo)</option>
              </SmartSelect>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="adjust-qty" className="block text-xs font-semibold text-slate-600 dark:text-slate-400">
                Cantidad ({unitInfo(selectedProd?.unit).short}) *
              </label>
              <input
                id="adjust-qty"
                type="number"
                min={isFractional(selectedProd?.unit) ? '0.01' : '1'}
                step={isFractional(selectedProd?.unit) ? '0.01' : '1'}
                required
                value={adjustQty}
                onChange={(e) => setAdjustQty(isFractional(selectedProd?.unit) ? Math.max(0.01, Math.round((parseFloat(e.target.value) || 0) * 100) / 100) : Math.max(1, parseInt(e.target.value) || 0))}
                className="w-full px-3.5 py-2 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-800 dark:text-slate-100 bg-transparent focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-xs font-mono"
              />
            </div>

            {selectedProd?.isPerishable && adjustType === 'Entrada' && (
              <BatchFields idPrefix="adjust" {...adjustBatch} onChange={patch => setAdjustBatch(prev => ({ ...prev, ...patch }))} />
            )}
            {selectedProd?.isPerishable && (adjustType === 'Salida' || adjustType === 'Merma') && !adjustBatchId && (
              <p className="col-span-1 text-[11px] text-slate-400 md:col-span-2">Perecedero: la salida descuenta primero los lotes que vencen antes (FEFO). Para dar de baja un lote concreto use la pestaña «Lotes y Vencimientos».</p>
            )}

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
              <SmartSelect
                id="purchase-supplier"
                required
                value={purchaseSupplier}
                onChange={(e) => setPurchaseSupplier(e.target.value)}
                className="w-full px-3.5 py-2 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-800 dark:text-slate-100 bg-transparent focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-xs"
              >
                <option value="">
                  {suppliers.length ? 'Seleccione un proveedor...' : 'No hay proveedores: créelos en el módulo Proveedores'}
                </option>
                {suppliers.map(sup => (
                  <option key={sup.id} value={sup.id}>
                    {sup.name}{sup.rnc ? ` — ${sup.rnc}` : ''}
                  </option>
                ))}
              </SmartSelect>
            </div>

            <div className="space-y-1.5 col-span-1 md:col-span-2">
              <label htmlFor="purchase-prod" className="block text-xs font-semibold text-slate-600 dark:text-slate-400">
                Producto *
              </label>
              <ProductPicker id="purchase-prod" pinned={pinnedProduct} value={purchaseProdId} onChange={(id, product) => { setPurchaseProdId(id); setPurchaseProd(product || null); }} />
            </div>

            {purchaseProd?.isPerishable && (
              <BatchFields idPrefix="purchase" {...purchaseBatch} onChange={patch => setPurchaseBatch(prev => ({ ...prev, ...patch }))} />
            )}

            <div className="space-y-1.5">
              <label htmlFor="purchase-qty" className="block text-xs font-semibold text-slate-600 dark:text-slate-400">
                Cantidad ({unitInfo(purchaseProd?.unit).short}) *
              </label>
              <input
                id="purchase-qty"
                type="number"
                min={isFractional(purchaseProd?.unit) ? '0.01' : '1'}
                step={isFractional(purchaseProd?.unit) ? '0.01' : '1'}
                required
                value={purchaseQty}
                onChange={(e) => setPurchaseQty(isFractional(purchaseProd?.unit) ? Math.max(0.01, Math.round((parseFloat(e.target.value) || 0) * 100) / 100) : Math.max(1, parseInt(e.target.value) || 0))}
                className="w-full px-3.5 py-2 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-800 dark:text-slate-100 bg-transparent focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-xs font-mono"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="purchase-cost" className="block text-xs font-semibold text-slate-600 dark:text-slate-400">
                Costo Unitario (RD$) *
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
