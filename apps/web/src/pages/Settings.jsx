import React, { Suspense, lazy, useEffect, useState } from 'react';
import { api } from '../services/api';
import { Loader2, Plus, Edit2, Power, Save } from 'lucide-react';
import Modal from '../components/Modal';
import { useConfigStore, formatTaxPercent } from '../stores/configStore';
import { notify } from '../utils/notify';
import SmartSelect from '../components/ui/SmartSelect';
import CardPaymentsSettings from '../components/payments/CardPaymentsSettings';

const EcfSettings = lazy(() => import('../components/ecf/EcfSettings'));

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

function Switch({ id, checked, onToggle, label, hint, disabled }){
  return (
  <div className={`flex items-start justify-between gap-4 ${disabled ? 'opacity-50' : ''}`}>
    <div>
      <label htmlFor={id} className="text-xs font-medium text-slate-700 dark:text-slate-200">{label}</label>
      {hint && <p className="text-[11px] text-slate-400">{hint}</p>}
    </div>
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onToggle(!checked)}
      className={`relative mt-0.5 h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors duration-200 disabled:cursor-not-allowed ${checked ? 'bg-indigo-600' : 'bg-slate-300 dark:bg-slate-600'}`}
    >
      <span className={`absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform duration-200 ${checked ? 'translate-x-4' : ''}`} />
    </button>
  </div>
  );
}

/** Seguridad de la sesión: cierre automático cuando el sistema no se usa. */
function SecurityCard({ value, onChange }) {
  const minutes = value?.idleTimeoutMinutes ?? 30;
  return (
    <div className={cardClass} id="security-settings">
      <h4 className="font-semibold text-sm text-slate-800 dark:text-slate-100">Seguridad de la sesión</h4>
      <p className="text-xs text-slate-400">Si nadie toca el sistema durante este tiempo, la sesión se cierra sola (un minuto antes se avisa). Protege las cajas que se quedan abiertas.</p>
      <div className="max-w-xs space-y-1.5">
        <label htmlFor="idle-minutes" className={labelClass}>Cerrar sesión tras (minutos sin actividad)</label>
        <input
          id="idle-minutes"
          type="number"
          min="0"
          max="1440"
          step="1"
          value={minutes}
          onChange={e => onChange({ ...value, idleTimeoutMinutes: Math.min(1440, Math.max(0, parseInt(e.target.value, 10) || 0)) })}
          className={inputClass}
        />
        <p className="text-[11px] text-slate-400">30 por defecto. Escribe 0 para no cerrar nunca (no recomendado en equipos compartidos).</p>
      </div>
    </div>
  );
}

/** Gestión de perecederos y lotes: umbrales de alerta y reglas de descuento por vencimiento. */
function PerishableCard({ value, onChange }) {
  const set = patch => onChange({ ...value, ...patch });
  const rules = value.discountRules || [];
  const setRule = (index, patch) => set({ discountRules: rules.map((rule, i) => (i === index ? { ...rule, ...patch } : rule)) });
  const num = raw => (raw === '' ? '' : Number(raw));
  const invalidThresholds = Number(value.redThresholdDays) >= Number(value.yellowThresholdDays);

  return (
    <div className={cardClass} id="perishable-settings">
      <h4 className="font-semibold text-sm text-slate-800 dark:text-slate-100">Gestión de perecederos y lotes</h4>
      <p className="text-xs text-slate-400">Lotes con fecha de vencimiento, venta por FEFO (primero vence, primero sale), alertas y descuentos por cercanía de vencimiento.</p>

      <Switch
        id="perishable-enabled"
        checked={value.enabled}
        onToggle={enabled => set({ enabled })}
        label="Activar perecederos y lotes"
        hint="Permite marcar productos como perecederos y registrar lotes al recibir mercancía."
      />

      <fieldset disabled={!value.enabled} className={`space-y-4 border-t border-slate-100 pt-4 dark:border-slate-700 ${value.enabled ? '' : 'opacity-50'}`}>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <label htmlFor="per-yellow" className={labelClass}>Alerta amarilla (días antes)</label>
            <input id="per-yellow" type="number" min="1" max="3650" required value={value.yellowThresholdDays} onChange={e => set({ yellowThresholdDays: num(e.target.value) })} className={inputClass} />
            <p className="text-[11px] text-slate-400">Próximo a vencer.</p>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="per-red" className={labelClass}>Alerta roja / crítico (días antes)</label>
            <input id="per-red" type="number" min="1" max="3650" required value={value.redThresholdDays} onChange={e => set({ redThresholdDays: num(e.target.value) })} className={inputClass} aria-invalid={invalidThresholds} />
            <p className={`text-[11px] ${invalidThresholds ? 'text-rose-500' : 'text-slate-400'}`}>
              {invalidThresholds ? 'Debe ser menor que el umbral amarillo.' : 'Retiro o liquidación urgente.'}
            </p>
          </div>
        </div>

        <Switch
          id="per-block"
          checked={value.blockExpiredSales}
          onToggle={blockExpiredSales => set({ blockExpiredSales })}
          label="Bloquear la venta de lotes vencidos"
          hint="Los lotes vencidos no se venden; se dan de baja desde Inventario."
        />

        <Switch
          id="per-discount"
          checked={value.autoDiscountEnabled}
          onToggle={autoDiscountEnabled => set({ autoDiscountEnabled })}
          label="Descuento automático por vencimiento"
          hint="El sistema lo aplica al vender, sin intervención del vendedor."
        />

        {value.autoDiscountEnabled && (
          <div className="space-y-2">
            <span className={labelClass}>Reglas (se aplica la más cercana al vencimiento)</span>
            {rules.map((rule, index) => (
              <div key={index} className="flex flex-wrap items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                Si faltan
                <input aria-label={`Días de la regla ${index + 1}`} type="number" min="0" max="3650" value={rule.daysRemaining} onChange={e => setRule(index, { daysRemaining: num(e.target.value) })} className={`${inputClass} !w-20`} />
                días o menos, descuento de
                <input aria-label={`Porcentaje de la regla ${index + 1}`} type="number" min="0" max="100" step="0.5" value={rule.discountPercent} onChange={e => setRule(index, { discountPercent: num(e.target.value) })} className={`${inputClass} !w-20`} />
                %
                <button type="button" onClick={() => set({ discountRules: rules.filter((_, i) => i !== index) })} className="cursor-pointer text-rose-500 hover:underline">Quitar</button>
              </div>
            ))}
            {rules.length < 10 && (
              <button type="button" onClick={() => set({ discountRules: [...rules, { daysRemaining: 14, discountPercent: 10 }] })} className="cursor-pointer text-xs font-semibold text-indigo-600 hover:underline">
                + Agregar regla
              </button>
            )}
          </div>
        )}
      </fieldset>
    </div>
  );
}

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
            <SmartSelect
              id="cfg-format"
              value={form.receiptFormat}
              onChange={e => setForm({ ...form, receiptFormat: e.target.value })}
              className={inputClass}
            >
              <option value="A4">Carta (A4)</option>
              <option value="TICKET">Ticket 80 mm</option>
              <option value="BOTH">Ambos (A4 + Ticket)</option>
            </SmartSelect>
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
          <label className="flex items-center gap-2 text-xs cursor-pointer">
            <input
              type="checkbox"
              checked={form.cashChange?.enabled || false}
              onChange={e => setForm({ ...form, cashChange: { ...(form.cashChange || {}), enabled: e.target.checked } })}
            />
            Calcular la devuelta por billetes y monedas al cobrar en efectivo
          </label>
        </div>
      </div>

      <PerishableCard
        value={form.perishable}
        onChange={perishable => setForm({ ...form, perishable })}
      />

      <SecurityCard value={form.security} onChange={security => setForm({ ...form, security })} />

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

/** Ajustes generales + pagos con tarjeta (que se guardan por separado). */
function GeneralWithPayments() {
  return (
    <div className="space-y-6">
      <GeneralSettings />
      <CardPaymentsSettings />
    </div>
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
  const [tab, setTab] = useState(() => {
    try {
      const requested = sessionStorage.getItem('factos-settings-tab');
      sessionStorage.removeItem('factos-settings-tab');
      return requested === 'ECF' ? 'ECF' : 'GENERAL';
    } catch {
      return 'GENERAL';
    }
  });
  const tabs = [
    { id: 'GENERAL', label: 'General' },
    { id: 'TERMINALS', label: 'Cajas' },
    { id: 'ECF', label: 'Facturación electrónica' },
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
      {tab === 'GENERAL' && <GeneralWithPayments />}
      {tab === 'TERMINALS' && <TerminalsSettings />}
      {tab === 'ECF' && (
        <Suspense fallback={<div className="h-40 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800/50" />}>
          <EcfSettings />
        </Suspense>
      )}
    </div>
  );
}
