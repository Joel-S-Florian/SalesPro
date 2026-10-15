import React, { useCallback, useEffect, useState } from 'react';
import { api } from '../services/api';
import { PLANS, PLAN_IDS } from '@factos/shared/plans.js';
import TempPasswordModal from '../components/auth/TempPasswordModal';
import { Plus, Search, Power, Eye, KeyRound, Pencil, Building2, Users, Receipt, Package } from 'lucide-react';
import Modal from '../components/Modal';
import PlatformInsights from '../components/PlatformInsights';
import Pagination from '../components/Pagination';
import { TableSkeleton } from '../components/Skeleton';
import { useClientPage } from '../hooks/usePagedList';
import { notify } from '../utils/notify';
import SmartSelect from '../components/ui/SmartSelect';
import PaymentsPanel from '../components/billing/PaymentsPanel';

const inputClass =
  'w-full px-3.5 py-2 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-800 dark:text-slate-100 bg-transparent focus:ring-1 focus:ring-indigo-500 outline-none text-xs';
const labelClass = 'block text-xs font-semibold text-slate-600 dark:text-slate-400';
const cardClass = 'bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-xl shadow-sm';

const EMPTY_FORM = {
  name: '',
  rnc: '',
  email: '',
  phone: '',
  address: '',
  adminFullName: '',
  adminUsername: '',
  adminPassword: '',
};

const money = value =>
  `$${Number(value || 0).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * Panel de plataforma (solo SUPERADMIN): alta, suspensión y consulta de empresas.
 */
const PLAN_LABELS = Object.fromEntries(PLAN_IDS.map(id => [id, PLANS[id].name]));

/** "Prueba: 9 días" / "Prueba vencida" / "Sin prueba". */
function trialLabel(trialEndsAt, paidUntil) {
  const end = [trialEndsAt, paidUntil].filter(Boolean).map(d => new Date(d).getTime()).sort((a, b) => b - a)[0];
  if (paidUntil && end === new Date(paidUntil).getTime()) {
    const left = Math.ceil((end - Date.now()) / (24 * 60 * 60 * 1000));
    return left > 0 ? `Pagado: ${left} ${left === 1 ? 'día' : 'días'}` : 'Pago vencido';
  }
  if (!trialEndsAt) return 'Sin prueba';
  const days = Math.ceil((new Date(trialEndsAt).getTime() - Date.now()) / (24 * 60 * 60 * 1000));
  if (days <= 0) return 'Prueba vencida';
  return `Prueba: ${days} ${days === 1 ? 'día' : 'días'}`;
}

export default function Companies() {
  const [stats, setStats] = useState(null);
  const [companies, setCompanies] = useState([]);
  const [search, setSearch] = useState('');
  const pager = useClientPage(companies);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  const [detail, setDetail] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const [editError, setEditError] = useState('');
  const [editSaving, setEditSaving] = useState(false);
  const [resetTarget, setResetTarget] = useState(null);
  const [tempPassword, setTempPassword] = useState(null); // clave temporal recién generada (se muestra una sola vez)
  const [newPassword, setNewPassword] = useState('');
  const [resetMessage, setResetMessage] = useState('');

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const [statsResult, list] = await Promise.all([
        api.platform.stats(),
        api.platform.companies({ q: search.trim() || undefined }),
      ]);
      setStats(statsResult);
      setCompanies(list || []);
    } catch (err) {
      setError(err.message || 'Error al cargar empresas');
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    const timer = setTimeout(loadData, 250);
    return () => clearTimeout(timer);
  }, [loadData]);

  const handleCreate = async e => {
    e.preventDefault();
    try {
      setSaving(true);
      setFormError('');
      const created = await api.platform.createCompany({
        name: form.name,
        rnc: form.rnc,
        email: form.email,
        phone: form.phone,
        address: form.address,
        admin: { fullName: form.adminFullName, username: form.adminUsername },
      });
      setIsFormOpen(false);
      setForm(EMPTY_FORM);
      notify.success('Empresa creada');
      // La clave del primer administrador la genera el servidor: se muestra una sola vez
      if (created.adminTemporaryPassword) setTempPassword({ username: created.adminUsername, password: created.adminTemporaryPassword, expiresAt: created.adminTemporaryPasswordExpiresAt });
      loadData();
    } catch (err) {
      setFormError(err.message || 'No se pudo crear la empresa');
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async company => {
    const action = company.active ? 'suspender' : 'reactivar';
    const warning = company.active ? ' Sus usuarios perderán el acceso de inmediato.' : '';
    if (!window.confirm(`¿Seguro que desea ${action} a ${company.name}?${warning}`)) return;
    try {
      await api.platform.updateCompany(company.id, { active: !company.active });
      loadData();
      if (detail?.id === company.id) setDetail(await api.platform.company(company.id));
    } catch (err) {
      notify.error(err.message || 'No se pudo actualizar la empresa');
    }
  };

  const openDetail = async company => {
    try {
      setDetail(await api.platform.company(company.id));
    } catch (err) {
      notify.error(err.message || 'No se pudo cargar la empresa');
    }
  };

  const startEdit = () => {
    setEditError('');
    setEditForm({
      name: detail.name || '',
      rnc: detail.rnc || '',
      email: detail.email || '',
      phone: detail.phone || '',
      address: detail.address || '',
      plan: detail.plan || 'STARTER',
      trialEndsAt: detail.trialEndsAt ? detail.trialEndsAt.slice(0, 10) : '',
    });
  };

  const handleEdit = async e => {
    e.preventDefault();
    try {
      setEditSaving(true);
      setEditError('');
      const { trialEndsAt, ...rest } = editForm;
      const updated = await api.platform.updateCompany(detail.id, {
        ...rest,
        trialEndsAt: trialEndsAt ? new Date(`${trialEndsAt}T23:59:59`).toISOString() : null,
      });
      setDetail(updated);
      setEditForm(null);
      notify.success('Datos de la empresa actualizados');
      loadData();
    } catch (err) {
      setEditError(err.message || 'No se pudo guardar la empresa');
    } finally {
      setEditSaving(false);
    }
  };

  const handleReset = async e => {
    e.preventDefault();
    try {
      const result = await api.platform.resetUserPassword(detail.id, resetTarget.id);
      setResetMessage(`Se generó una clave temporal para ${resetTarget.username}. Sus sesiones se cerraron.`);
      setTempPassword({ username: result.username, password: result.temporaryPassword, expiresAt: result.temporaryPasswordExpiresAt });
      setResetTarget(null);
    } catch (err) {
      setResetMessage(err.message || 'No se pudo generar la clave temporal');
    }
  };

  const field = (key, label, extra = {}) => (
    <div className={`space-y-1.5 ${extra.span ? 'md:col-span-2' : ''}`}>
      <label htmlFor={`co-${key}`} className={labelClass}>{label}</label>
      <input
        id={`co-${key}`}
        type={extra.type || 'text'}
        required={extra.required}
        minLength={extra.minLength}
        autoComplete={extra.autoComplete || 'off'}
        value={form[key]}
        onChange={e => setForm({ ...form, [key]: e.target.value })}
        className={inputClass}
      />
    </div>
  );

  return (
    <div className="space-y-4" id="companies-view">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          ['Empresas', stats?.companies, Building2],
          ['Activas', stats?.activeCompanies, Power],
          ['Usuarios', stats?.users, Users],
          ['Ventas', stats?.sales, Receipt],
          ['Volumen', stats ? money(stats.salesVolume) : undefined, Package],
        ].map(([label, value, Icon]) => (
          <div key={label} className={`${cardClass} p-4 flex items-center gap-3`}>
            <Icon className="w-5 h-5 text-indigo-500" />
            <div>
              <p className="text-[11px] text-slate-400">{label}</p>
              <p className="text-lg font-bold font-mono">{value ?? '—'}</p>
            </div>
          </div>
        ))}
      </div>

      <PlatformInsights />

      <div className={`${cardClass} p-4 flex flex-col md:flex-row md:items-center justify-between gap-4`}>
        <div>
          <h3 className="font-semibold text-slate-800 dark:text-slate-100">Empresas</h3>
          <p className="text-xs text-slate-400">Cada empresa tiene sus propios datos, usuarios, cajas y secuencias NCF.</p>
        </div>
        <div className="flex gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar por nombre o RNC..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className={`${inputClass} pl-9 md:w-64`}
            />
          </div>
          <button
            onClick={() => {
              setForm(EMPTY_FORM);
              setFormError('');
              setIsFormOpen(true);
            }}
            className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold px-4 py-2 rounded-lg flex items-center gap-1.5 cursor-pointer"
          >
            <Plus className="w-4 h-4" /> Nueva empresa
          </button>
        </div>
      </div>

      {error && <p className="text-xs text-rose-500">{error}</p>}

      <div className={`${cardClass} overflow-hidden`}>
        <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 uppercase tracking-wider">
            <tr>
              <th className="px-4 py-3">Empresa</th>
              <th className="px-4 py-3">Plan</th>
              <th className="px-4 py-3">RNC</th>
              <th className="px-4 py-3 text-center">Usuarios</th>
              <th className="px-4 py-3 text-center">Productos</th>
              <th className="px-4 py-3 text-center">Ventas</th>
              <th className="px-4 py-3">Alta</th>
              <th className="px-4 py-3 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {loading && <TableSkeleton rows={pager.pageSize} columns={8} />}
            {!loading && companies.length === 0 && (
              <tr><td colSpan={8} className="px-4 py-10 text-center text-slate-400">No hay empresas.</td></tr>
            )}
            {!loading &&
              pager.rows.map(c => (
                <tr key={c.id} className={c.active ? '' : 'opacity-60'}>
                  <td className="px-4 py-3 font-medium">
                    {c.name}
                    {!c.active && <span className="ml-2 text-[10px] font-semibold text-rose-500">SUSPENDIDA</span>}
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-medium">{PLAN_LABELS[c.plan] || c.plan}</span>
                    <span className="block text-xs text-slate-500">{trialLabel(c.trialEndsAt, c.paidUntil)}</span>
                  </td>
                  <td className="px-4 py-3 font-mono">{c.rnc || '—'}</td>
                  <td className="px-4 py-3 text-center font-mono">{c._count.users}</td>
                  <td className="px-4 py-3 text-center font-mono">{c._count.products}</td>
                  <td className="px-4 py-3 text-center font-mono">{c._count.sales}</td>
                  <td className="px-4 py-3">{new Date(c.createdAt).toLocaleDateString('es-DO')}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <button aria-label="Ver usuarios" onClick={() => openDetail(c)} title="Ver usuarios" className="p-1.5 text-slate-400 hover:text-indigo-600 cursor-pointer">
                        <Eye className="w-4 h-4" />
                      </button>
                      <button aria-label={c.active ? 'Suspender' : 'Reactivar'} onClick={() => toggleActive(c)} title={c.active ? 'Suspender' : 'Reactivar'} className="p-1.5 text-slate-400 hover:text-rose-500 cursor-pointer">
                        <Power className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
        </div>
        <Pagination page={pager.page} pageSize={pager.pageSize} total={pager.total} onPageChange={pager.setPage} onPageSizeChange={pager.setPageSize} noun="empresas" />
      </div>

      <Modal isOpen={isFormOpen} onClose={() => !saving && setIsFormOpen(false)} title="Nueva empresa" maxWidth="lg">
        <form onSubmit={handleCreate} className="space-y-5">
          <div>
            <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Datos de la empresa</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {field('name', 'Nombre comercial *', { required: true, span: true })}
              {field('rnc', 'RNC')}
              {field('phone', 'Teléfono')}
              {field('email', 'Email', { type: 'email', span: true })}
              {field('address', 'Dirección', { span: true })}
            </div>
          </div>
          <div>
            <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Primer administrador</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {field('adminFullName', 'Nombre completo *', { required: true, span: true })}
              {field('adminUsername', 'Usuario *', { required: true, minLength: 3 })}
              <p className="md:col-span-2 text-[11px] text-slate-400">La contraseña inicial la genera el sistema: al crear la empresa verás una clave temporal (una sola vez).</p>
            </div>
          </div>
          {formError && <p className="text-xs text-rose-500">{formError}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setIsFormOpen(false)} className="px-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 cursor-pointer">Cancelar</button>
            <button type="submit" disabled={saving} className="px-4 py-1.5 text-xs rounded-lg bg-indigo-600 text-white disabled:opacity-50 cursor-pointer">{saving ? 'Creando...' : 'Crear empresa'}</button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={!!detail} onClose={() => { setDetail(null); setResetTarget(null); setResetMessage(''); setEditForm(null); }} title={detail?.name || ''} maxWidth="2xl">
        {detail && (
          <div className="space-y-4">
            {editForm ? (
              <form onSubmit={handleEdit} className="space-y-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg p-3">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {[
                    ['name', 'Nombre comercial *', true, 'md:col-span-2'],
                    ['rnc', 'RNC', false, ''],
                    ['phone', 'Teléfono', false, ''],
                    ['email', 'Email', false, 'md:col-span-2'],
                    ['address', 'Dirección', false, 'md:col-span-2'],
                    ['plan', 'Plan', false, ''],
                    ['trialEndsAt', 'La prueba termina el', false, ''],
                  ].map(([key, label, required, span]) => (
                    <div key={key} className={`space-y-1.5 ${span}`}>
                      <label htmlFor={`edit-${key}`} className={labelClass}>{label}</label>
                      {key === 'plan' ? (
                        <SmartSelect
                          id={`edit-${key}`}
                          value={editForm.plan}
                          onChange={e => setEditForm({ ...editForm, plan: e.target.value })}
                          className={inputClass}
                        >
                          {Object.entries(PLAN_LABELS).map(([value, label]) => (
                            <option key={value} value={value}>
                              {label}
                            </option>
                          ))}
                        </SmartSelect>
                      ) : (
                        <input
                          id={`edit-${key}`}
                          required={required}
                          type={key === 'email' ? 'email' : key === 'trialEndsAt' ? 'date' : 'text'}
                          value={editForm[key]}
                          onChange={e => setEditForm({ ...editForm, [key]: e.target.value })}
                          className={inputClass}
                        />
                      )}
                    </div>
                  ))}
                </div>
                {editError && <p className="text-xs text-rose-500">{editError}</p>}
                <div className="flex justify-end gap-2">
                  <button type="button" onClick={() => setEditForm(null)} className="px-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 cursor-pointer">Cancelar</button>
                  <button type="submit" disabled={editSaving} className="px-4 py-1.5 text-xs rounded-lg bg-indigo-600 text-white disabled:opacity-50 cursor-pointer">{editSaving ? 'Guardando...' : 'Guardar'}</button>
                </div>
              </form>
            ) : (
              <div className="flex items-start justify-between gap-3">
                <div className="text-xs space-y-1">
                  <p>RNC: <span className="font-mono">{detail.rnc || '—'}</span></p>
                  <p>Contacto: {[detail.phone, detail.email].filter(Boolean).join(' · ') || '—'}</p>
                  <p>Dirección: {detail.address || '—'}</p>
                  <p>Plan: {PLAN_LABELS[detail.plan] || detail.plan} · {trialLabel(detail.trialEndsAt, detail.paidUntil)}</p>
                  <p>Estado: <strong className={detail.active ? 'text-emerald-600' : 'text-rose-500'}>{detail.active ? 'Activa' : 'Suspendida'}</strong></p>
                </div>
                <button onClick={startEdit} className="flex items-center gap-1 px-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 hover:text-indigo-600 cursor-pointer">
                  <Pencil className="w-3.5 h-3.5" /> Editar datos
                </button>
              </div>
            )}
            <table className="w-full text-xs text-left">
              <thead className="text-slate-500 uppercase">
                <tr><th className="py-2">Usuario</th><th className="py-2">Nombre</th><th className="py-2">Rol</th><th className="py-2 text-right">Acción</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {detail.users.map(u => (
                  <tr key={u.id}>
                    <td className="py-2 font-mono">{u.username}{!u.active && ' (inactivo)'}</td>
                    <td className="py-2">{u.fullName}</td>
                    <td className="py-2">{u.role}</td>
                    <td className="py-2 text-right">
                      <button aria-label="Restablecer contraseña" onClick={() => { setResetTarget(u); setResetMessage(''); }} title="Restablecer contraseña" className="p-1.5 text-slate-400 hover:text-indigo-600 cursor-pointer">
                        <KeyRound className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {resetTarget && (
              <form onSubmit={handleReset} className="flex items-end gap-2 bg-slate-50 dark:bg-slate-800/50 rounded-lg p-3">
                <p className="flex-1 text-xs text-slate-600 dark:text-slate-300">¿Generar una clave temporal nueva para <strong>{resetTarget.username}</strong>? La actual dejará de servir y se cerrarán sus sesiones.</p>
                <button type="submit" className="px-3 py-2 text-xs rounded-lg bg-indigo-600 text-white cursor-pointer">Generar clave</button>
                <button type="button" onClick={() => setResetTarget(null)} className="px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 cursor-pointer">Cancelar</button>
              </form>
            )}
            {resetMessage && <p className="text-xs text-emerald-600">{resetMessage}</p>}
            <PaymentsPanel company={detail} onChanged={async () => setDetail(await api.platform.company(detail.id))} />
          </div>
        )}
      </Modal>
      <TempPasswordModal data={tempPassword} onClose={() => setTempPassword(null)} title="Clave temporal" />
    </div>
  );
}
