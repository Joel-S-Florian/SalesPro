import React, { useState } from 'react';
import { api } from '../services/api';
import { Loader2, Plus, Search, Edit2, Power, History, Phone, MessageCircle } from 'lucide-react';
import Modal from '../components/Modal';
import Pagination from '../components/Pagination';
import { TableSkeleton } from '../components/Skeleton';
import { usePagedList } from '../hooks/usePagedList';
import { notify } from '../utils/notify';
import { telUrl, whatsappUrl } from '../utils/phone';
import { useConfigStore } from '../stores/configStore';

/** Llamar y escribir por WhatsApp al proveedor. Cada botón se activa en Configuración → Llamadas y WhatsApp a proveedores. */
function ContactButtons({ supplier }) {
  const actions = useConfigStore(state => state.config.contactActions);
  const businessName = useConfigStore(state => state.config.business?.name);
  const call = telUrl(supplier.phone);
  const buildMessage = products =>
    (actions?.supplierMessage || '')
      .replaceAll('{contacto}', supplier.contactName || supplier.name)
      .replaceAll('{empresa}', businessName || '')
      .replaceAll('{productos}', products || '(le indicaremos los productos)');
  const chat = whatsappUrl(supplier.phone, buildMessage(''));

  // {productos}: los que se le han comprado a este proveedor y están bajos de existencia. Se consulta al hacer clic.
  const openWhatsapp = async event => {
    if (!(actions?.supplierMessage || '').includes('{productos}')) return;
    event.preventDefault();
    const popup = window.open('', '_blank');
    let names = '';
    try {
      const result = await api.suppliers.reorderProducts(supplier.id);
      names = (result?.data || []).map(p => p.name).join(', ');
    } catch {
      // sin sugerencias: el mensaje sale igual
    }
    const url = whatsappUrl(supplier.phone, buildMessage(names));
    if (popup) popup.location.href = url;
    else window.location.href = url;
  };
  const base = 'p-1.5 rounded';
  const render = (label, Icon, href, tone, enabled, onClick) =>
    enabled && href ? (
      <a aria-label={label} title={label} href={href} onClick={onClick} target={href.startsWith('http') ? '_blank' : undefined} rel="noreferrer" className={`${base} text-slate-400 ${tone} hover:bg-slate-100 dark:hover:bg-slate-800`}>
        <Icon className="w-4 h-4" />
      </a>
    ) : (
      <button type="button" disabled aria-label={enabled ? `${label} (sin teléfono)` : `${label} (desactivado en Configuración)`} title={enabled ? 'Este proveedor no tiene teléfono' : 'Actívalo en Configuración'} className={`${base} text-slate-300 dark:text-slate-600 cursor-not-allowed`}>
        <Icon className="w-4 h-4" />
      </button>
    );
  return (
    <>
      {render('Llamar', Phone, call, 'hover:text-emerald-600', Boolean(actions?.supplierCall))}
      {render('Escribir por WhatsApp', MessageCircle, chat, 'hover:text-green-600', Boolean(actions?.supplierWhatsapp), openWhatsapp)}
    </>
  );
}

const EMPTY_FORM = {
  name: '',
  rnc: '',
  contactName: '',
  email: '',
  phone: '',
  address: '',
  paymentTerms: '',
};

const FIELDS = [
  { key: 'name', label: 'Nombre / Razón social *', required: true, span: 2 },
  { key: 'rnc', label: 'RNC', placeholder: '131888421', maxLength: 11 },
  { key: 'paymentTerms', label: 'Condiciones de pago (plazo acordado)', placeholder: 'Contado, 30 días...' },
  { key: 'contactName', label: 'Persona de contacto' },
  { key: 'phone', label: 'Teléfono' },
  { key: 'email', label: 'Email', type: 'email', span: 2 },
  { key: 'address', label: 'Dirección', span: 2 },
];

const inputClass =
  'w-full px-3.5 py-2 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-800 dark:text-slate-100 bg-transparent focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-xs';

const money = value =>
  `$${Number(value || 0).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function Suppliers() {
  const [search, setSearch] = useState('');
  const [showInactive, setShowInactive] = useState(false);

  const {
    rows: suppliers,
    total,
    loading,
    error,
    page,
    pageSize,
    setPage,
    setPageSize,
    reload: loadData,
  } = usePagedList(api.suppliers.list, {
    q: search.trim() || undefined,
    active: showInactive ? undefined : 'true',
  });

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  const [historySupplier, setHistorySupplier] = useState(null);
  const [history, setHistory] = useState({ data: [], totalSpent: 0 });
  const [loadingHistory, setLoadingHistory] = useState(false);

  const openCreate = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFormError('');
    setIsFormOpen(true);
  };

  const openEdit = supplier => {
    setEditingId(supplier.id);
    setForm(Object.fromEntries(Object.keys(EMPTY_FORM).map(key => [key, supplier[key] || ''])));
    setFormError('');
    setIsFormOpen(true);
  };

  const handleSave = async e => {
    e.preventDefault();
    try {
      setSaving(true);
      setFormError('');
      if (editingId) await api.suppliers.update(editingId, form);
      else await api.suppliers.create(form);
      notify.success(editingId ? 'Proveedor actualizado' : 'Proveedor creado');
      setIsFormOpen(false);
      loadData();
    } catch (err) {
      setFormError(err.message || 'No se pudo guardar el proveedor');
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async supplier => {
    const action = supplier.active ? 'desactivar' : 'reactivar';
    if (!window.confirm(`¿Seguro que desea ${action} a ${supplier.name}?`)) return;
    try {
      await api.suppliers.update(supplier.id, { active: !supplier.active });
      notify.success(supplier.active ? 'Proveedor desactivado' : 'Proveedor reactivado');
      loadData();
    } catch (err) {
      notify.error(err.message || 'No se pudo actualizar el proveedor');
    }
  };

  const openHistory = async supplier => {
    setHistorySupplier(supplier);
    setHistory({ data: [], totalSpent: 0 });
    try {
      setLoadingHistory(true);
      setHistory(await api.suppliers.purchases(supplier.id, { limit: 100 }));
    } catch (err) {
      notify.error(err.message || 'No se pudo cargar el historial de compras');
    } finally {
      setLoadingHistory(false);
    }
  };

  return (
    <div className="space-y-4" id="suppliers-view">
      <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-xl p-4 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-0.5">
          <h3 className="font-semibold text-slate-800 dark:text-slate-100">Proveedores</h3>
          <p className="text-xs text-slate-400">Directorio de proveedores e historial de compras.</p>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <label className="flex items-center gap-1.5 text-xs text-slate-500 cursor-pointer">
            <input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} />
            Mostrar inactivos
          </label>
          <div className="relative">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar por nombre, RNC o contacto..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className={`${inputClass} pl-9 md:w-72`}
            />
          </div>
          <button
            onClick={openCreate}
            className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold px-4 py-2 rounded-lg flex items-center gap-1.5 cursor-pointer"
          >
            <Plus className="w-4 h-4" /> Nuevo proveedor
          </button>
        </div>
      </div>

      {error && <p className="text-xs text-rose-500">{error}</p>}

      <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 uppercase tracking-wider">
            <tr>
              <th className="px-4 py-3">Proveedor</th>
              <th className="px-4 py-3">RNC</th>
              <th className="px-4 py-3">Contacto</th>
              <th className="px-4 py-3">Condiciones</th>
              <th className="px-4 py-3 text-center">Compras</th>
              <th className="px-4 py-3 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {loading && suppliers.length === 0 && <TableSkeleton rows={pageSize} columns={6} />}
            {!loading && suppliers.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-slate-400">
                  No hay proveedores registrados.
                </td>
              </tr>
            )}
            {!loading &&
              suppliers.map(s => (
                <tr key={s.id} className={s.active ? '' : 'opacity-50'}>
                  <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-100">
                    {s.name}
                    {s.isSystem && <span className="ml-2 rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold text-indigo-600 dark:bg-indigo-950/30" title="Proveedor de sistema: se usa en las compras que no indican proveedor">Sistema</span>}
                    {!s.active && <span className="ml-2 text-[10px] text-slate-400">(inactivo)</span>}
                  </td>
                  <td className="px-4 py-3 font-mono">{s.rnc || '—'}</td>
                  <td className="px-4 py-3">
                    {s.contactName || '—'}
                    {s.phone && <div className="text-slate-400">{s.phone}</div>}
                  </td>
                  <td className="px-4 py-3">{s.paymentTerms || '—'}</td>
                  <td className="px-4 py-3 text-center font-mono">{s._count?.purchases ?? 0}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      {!s.isSystem && <ContactButtons supplier={s} />}
                      <button aria-label="Historial de compras"
                        onClick={() => openHistory(s)}
                        title="Historial de compras"
                        className="p-1.5 rounded text-slate-400 hover:text-indigo-600 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                      >
                        <History className="w-4 h-4" />
                      </button>
                      {!s.isSystem && (
                        <>
                          <button aria-label="Editar"
                            onClick={() => openEdit(s)}
                            title="Editar"
                            className="p-1.5 rounded text-slate-400 hover:text-indigo-600 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button aria-label={s.active ? 'Desactivar' : 'Reactivar'}
                            onClick={() => toggleActive(s)}
                            title={s.active ? 'Desactivar' : 'Reactivar'}
                            className="p-1.5 rounded text-slate-400 hover:text-rose-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                          >
                            <Power className="w-4 h-4" />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
        </div>
        <Pagination page={page} pageSize={pageSize} total={total} onPageChange={setPage} onPageSizeChange={setPageSize} noun="proveedores" />
      </div>

      <Modal
        isOpen={isFormOpen}
        onClose={() => !saving && setIsFormOpen(false)}
        title={editingId ? 'Editar proveedor' : 'Nuevo proveedor'}
        maxWidth="lg"
      >
        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {FIELDS.map(field => (
              <div key={field.key} className={`space-y-1.5 ${field.span === 2 ? 'md:col-span-2' : ''}`}>
                <label htmlFor={`supplier-${field.key}`} className="block text-xs font-semibold text-slate-600 dark:text-slate-400">
                  {field.label}
                </label>
                <input
                  id={`supplier-${field.key}`}
                  type={field.type || 'text'}
                  required={field.required}
                  maxLength={field.maxLength}
                  placeholder={field.placeholder}
                  value={form[field.key]}
                  onChange={e => setForm({ ...form, [field.key]: e.target.value })}
                  className={inputClass}
                />
              </div>
            ))}
          </div>
          {formError && <p className="text-xs text-rose-500">{formError}</p>}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setIsFormOpen(false)}
              className="px-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-1.5 text-xs rounded-lg bg-indigo-600 text-white disabled:opacity-50 cursor-pointer"
            >
              {saving ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={!!historySupplier}
        onClose={() => setHistorySupplier(null)}
        title={`Compras: ${historySupplier?.name || ''}`}
        maxWidth="2xl"
      >
        {loadingHistory ? (
          <div className="py-8 text-center">
            <Loader2 className="w-5 h-5 animate-spin inline" />
          </div>
        ) : history.data.length === 0 ? (
          <p className="text-xs text-slate-400 text-center py-6">Sin compras registradas para este proveedor.</p>
        ) : (
          <div className="space-y-3">
            <p className="text-xs">
              Total comprado: <strong className="font-mono">{money(history.totalSpent)}</strong>
            </p>
            <table className="w-full text-left text-xs">
              <thead className="text-slate-500 uppercase">
                <tr>
                  <th className="py-2">Fecha</th>
                  <th className="py-2">Producto</th>
                  <th className="py-2">Factura</th>
                  <th className="py-2 text-right">Cant.</th>
                  <th className="py-2 text-right">Costo unit.</th>
                  <th className="py-2 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {history.data.map(p => (
                  <tr key={p.id}>
                    <td className="py-2">{new Date(p.createdAt).toLocaleDateString('es-DO')}</td>
                    <td className="py-2">{p.productName}</td>
                    <td className="py-2 font-mono">{p.invoiceNumber || '—'}</td>
                    <td className="py-2 text-right font-mono">{p.quantity}</td>
                    <td className="py-2 text-right font-mono">{money(p.unitCost)}</td>
                    <td className="py-2 text-right font-mono">{money(p.totalCost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Modal>
    </div>
  );
}
