import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import { Loader2, Plus, Edit2, Power, Save } from 'lucide-react';
import Modal from '../components/Modal';
import { useConfigStore, formatTaxPercent } from '../stores/configStore';
import { notify } from '../utils/notify';

const inputClass =
  'w-full px-3.5 py-2 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-800 dark:text-slate-100 bg-transparent focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-xs';
const labelClass = 'block text-xs font-semibold text-slate-600 dark:text-slate-400';
const cardClass =
  'bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-xl p-5 shadow-sm space-y-4';

const BUSINESS_FIELDS = [
  { key: 'name', label: 'Nombre comercial *', required: true },
  { key: 'rnc', label: 'RNC' },
  { key: 'phone', label: 'Teléfono' },
  { key: 'email', label: 'Email', type: 'email' },
  { key: 'address', label: 'Dirección', span: true },
];

const PAYMENT_OPTIONS = [
  { id: 'EFECTIVO', label: 'Efectivo' },
  { id: 'TARJETA', label: 'Tarjeta' },
];

function GeneralSettings() {
  const config = useConfigStore(state => state.config);
  const setConfig = useConfigStore(state => state.setConfig);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);

  useEffect(() => {
    setForm({ ...config, taxPercent: formatTaxPercent(config.taxRate) });
  }, [config]);

  if (!form) return null;

  const togglePayment = id => {
    const has = form.paymentMethods.includes(id);
    setForm({
      ...form,
      paymentMethods: has ? form.paymentMethods.filter(m => m !== id) : [...form.paymentMethods, id],
    });
  };

  const handleSave = async e => {
    e.preventDefault();
    try {
      setSaving(true);
      setMessage(null);
      const { taxPercent, ...rest } = form;
      const saved = await api.config.update({ ...rest, taxRate: Number(taxPercent) / 100 });
      setConfig(saved);
      setMessage({ ok: true, text: 'Configuración guardada.' });
      notify.success('Configuración guardada');
    } catch (err) {
      setMessage({ ok: false, text: err.message || 'No se pudo guardar la configuración' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSave} className="space-y-4">
      <div className={cardClass}>
        <h4 className="font-semibold text-sm text-slate-800 dark:text-slate-100">Datos del negocio</h4>
        <p className="text-xs text-slate-400">Aparecen en el encabezado de facturas y reportes.</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {BUSINESS_FIELDS.map(field => (
            <div key={field.key} className={`space-y-1.5 ${field.span ? 'md:col-span-2' : ''}`}>
              <label htmlFor={`biz-${field.key}`} className={labelClass}>{field.label}</label>
              <input
                id={`biz-${field.key}`}
                type={field.type || 'text'}
                required={field.required}
                value={form.business[field.key] || ''}
                onChange={e => setForm({ ...form, business: { ...form.business, [field.key]: e.target.value } })}
                className={inputClass}
              />
            </div>
          ))}
        </div>
      </div>

      <div className={cardClass}>
        <h4 className="font-semibold text-sm text-slate-800 dark:text-slate-100">Ventas e impuestos</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label htmlFor="cfg-tax" className={labelClass}>ITBIS (%)</label>
            <input
              id="cfg-tax"
              type="number"
              min="0"
              max="100"
              step="0.01"
              required
              value={form.taxPercent}
              onChange={e => setForm({ ...form, taxPercent: e.target.value })}
              className={inputClass}
            />
            <p className="text-[11px] text-slate-400">Solo afecta ventas nuevas; las existentes conservan su ITBIS.</p>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="cfg-format" className={labelClass}>Formato de comprobante por defecto</label>
            <select
              id="cfg-format"
              value={form.receiptFormat}
              onChange={e => setForm({ ...form, receiptFormat: e.target.value })}
              className={inputClass}
            >
              <option value="A4">Carta (A4)</option>
              <option value="TICKET">Ticket 80 mm</option>
              <option value="BOTH">Ambos (A4 + Ticket)</option>
            </select>
            <p className="text-[11px] text-slate-400">Cada equipo puede cambiarlo localmente desde el POS.</p>
          </div>
        </div>

        <div className="space-y-1.5">
          <span className={labelClass}>Métodos de pago habilitados</span>
          <div className="flex gap-4">
            {PAYMENT_OPTIONS.map(option => (
              <label key={option.id} className="flex items-center gap-1.5 text-xs cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.paymentMethods.includes(option.id)}
                  onChange={() => togglePayment(option.id)}
                />
                {option.label}
              </label>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <label className="flex items-center gap-2 text-xs cursor-pointer">
            <input
              type="checkbox"
              checked={form.vendedorCanDiscount}
              onChange={e => setForm({ ...form, vendedorCanDiscount: e.target.checked })}
            />
            Permitir que los vendedores apliquen descuentos
          </label>
          <label className="flex items-center gap-2 text-xs cursor-pointer">
            <input
              type="checkbox"
              checked={form.requireOpenShift}
              onChange={e => setForm({ ...form, requireOpenShift: e.target.checked })}
            />
            Exigir una caja con turno abierto para poder vender
          </label>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={saving}
          className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold px-4 py-2 rounded-lg flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
        >
          <Save className="w-4 h-4" /> {saving ? 'Guardando...' : 'Guardar cambios'}
        </button>
        {message && <span className={`text-xs ${message.ok ? 'text-emerald-600' : 'text-rose-500'}`}>{message.text}</span>}
      </div>
    </form>
  );
}

function TerminalsSettings() {
  const [terminals, setTerminals] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [name, setName] = useState('');
  const [userIds, setUserIds] = useState([]);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const [terminalList, userList] = await Promise.all([api.terminals.list(), api.auth.getUsers({ limit: 100 })]);
      setTerminals(terminalList || []);
      setUsers((Array.isArray(userList) ? userList : userList?.data || []).filter(u => u.active));
    } catch (err) {
      setError(err.message || 'Error al cargar cajas');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const openForm = terminal => {
    setEditingId(terminal?.id || null);
    setName(terminal?.name || '');
    setUserIds(terminal ? terminal.users.map(u => u.id) : []);
    setFormError('');
    setIsFormOpen(true);
  };

  const toggleUser = id =>
    setUserIds(ids => (ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id]));

  const handleSave = async e => {
    e.preventDefault();
    try {
      setSaving(true);
      setFormError('');
      const payload = { name: name.trim(), userIds };
      if (editingId) await api.terminals.update(editingId, payload);
      else await api.terminals.create(payload);
      notify.success(editingId ? 'Caja actualizada' : 'Caja creada');
      setIsFormOpen(false);
      loadData();
    } catch (err) {
      setFormError(err.message || 'No se pudo guardar la caja');
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async terminal => {
    try {
      await api.terminals.update(terminal.id, { active: !terminal.active });
      loadData();
    } catch (err) {
      notify.error(err.message || 'No se pudo actualizar la caja');
    }
  };

  return (
    <div className={cardClass}>
      <div className="flex items-center justify-between">
        <div>
          <h4 className="font-semibold text-sm text-slate-800 dark:text-slate-100">Cajas (terminales)</h4>
          <p className="text-xs text-slate-400">Cada venta queda ligada a la caja donde se hizo. Los vendedores solo ven las cajas asignadas.</p>
        </div>
        <button
          onClick={() => openForm(null)}
          className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold px-3 py-2 rounded-lg flex items-center gap-1.5 cursor-pointer"
        >
          <Plus className="w-4 h-4" /> Nueva caja
        </button>
      </div>

      {error && <p className="text-xs text-rose-500">{error}</p>}
      {loading ? (
        <Loader2 className="w-5 h-5 animate-spin" />
      ) : terminals.length === 0 ? (
        <p className="text-xs text-slate-400">Aún no hay cajas creadas.</p>
      ) : (
        <table className="w-full text-left text-xs">
          <thead className="text-slate-500 uppercase tracking-wider">
            <tr>
              <th className="py-2">Caja</th>
              <th className="py-2">Cajeros asignados</th>
              <th className="py-2 text-center">Ventas</th>
              <th className="py-2 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {terminals.map(t => (
              <tr key={t.id} className={t.active ? '' : 'opacity-50'}>
                <td className="py-2.5 font-medium">{t.name}{!t.active && ' (inactiva)'}</td>
                <td className="py-2.5">{t.users.map(u => u.fullName).join(', ') || 'Solo administradores'}</td>
                <td className="py-2.5 text-center font-mono">{t._count?.sales ?? 0}</td>
                <td className="py-2.5 text-right">
                  <button aria-label="Editar" onClick={() => openForm(t)} title="Editar" className="p-1.5 text-slate-400 hover:text-indigo-600 cursor-pointer">
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button aria-label={t.active ? 'Desactivar' : 'Reactivar'} onClick={() => toggleActive(t)} title={t.active ? 'Desactivar' : 'Reactivar'} className="p-1.5 text-slate-400 hover:text-rose-500 cursor-pointer">
                    <Power className="w-4 h-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <Modal isOpen={isFormOpen} onClose={() => !saving && setIsFormOpen(false)} title={editingId ? 'Editar caja' : 'Nueva caja'} maxWidth="md">
        <form onSubmit={handleSave} className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="terminal-name" className={labelClass}>Nombre *</label>
            <input id="terminal-name" required maxLength={60} placeholder="Ej. Caja 1" value={name} onChange={e => setName(e.target.value)} className={inputClass} />
          </div>
          <div className="space-y-1.5">
            <span className={labelClass}>Cajeros con acceso</span>
            <div className="max-h-48 overflow-y-auto space-y-1 border border-slate-200 dark:border-slate-800 rounded-lg p-2">
              {users.filter(u => u.role === 'VENDEDOR').map(u => (
                <label key={u.id} className="flex items-center gap-2 text-xs cursor-pointer">
                  <input type="checkbox" checked={userIds.includes(u.id)} onChange={() => toggleUser(u.id)} />
                  {u.fullName} <span className="text-slate-400">({u.username})</span>
                </label>
              ))}
              {users.filter(u => u.role === 'VENDEDOR').length === 0 && (
                <p className="text-xs text-slate-400">No hay vendedores activos. Los administradores acceden a todas las cajas.</p>
              )}
            </div>
          </div>
          {formError && <p className="text-xs text-rose-500">{formError}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setIsFormOpen(false)} className="px-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 cursor-pointer">Cancelar</button>
            <button type="submit" disabled={saving} className="px-4 py-1.5 text-xs rounded-lg bg-indigo-600 text-white disabled:opacity-50 cursor-pointer">{saving ? 'Guardando...' : 'Guardar'}</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

export default function Settings() {
  const [tab, setTab] = useState('GENERAL');
  const tabs = [
    { id: 'GENERAL', label: 'General' },
    { id: 'TERMINALS', label: 'Cajas' },
  ];

  return (
    <div className="space-y-4" id="settings-view">
      <div className="flex gap-2 border-b border-slate-200 dark:border-slate-800">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-xs font-semibold border-b-2 -mb-px cursor-pointer ${
              tab === t.id ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'GENERAL' ? <GeneralSettings /> : <TerminalsSettings />}
    </div>
  );
}
