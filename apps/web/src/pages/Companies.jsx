import React, { useCallback, useEffect, useState } from 'react';
import { api } from '../services/api';
import { Loader2, Plus, Search, Power, Eye, KeyRound, Building2, Users, Receipt, Package } from 'lucide-react';
import Modal from '../components/Modal';

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
export default function Companies() {
  const [stats, setStats] = useState(null);
  const [companies, setCompanies] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  const [detail, setDetail] = useState(null);
  const [resetTarget, setResetTarget] = useState(null);
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
      await api.platform.createCompany({
        name: form.name,
        rnc: form.rnc,
        email: form.email,
        phone: form.phone,
        address: form.address,
        admin: { fullName: form.adminFullName, username: form.adminUsername, password: form.adminPassword },
      });
      setIsFormOpen(false);
      setForm(EMPTY_FORM);
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
      alert(err.message || 'No se pudo actualizar la empresa');
    }
  };

  const openDetail = async company => {
    try {
      setDetail(await api.platform.company(company.id));
    } catch (err) {
      alert(err.message || 'No se pudo cargar la empresa');
    }
  };

  const handleReset = async e => {
    e.preventDefault();
    try {
      await api.platform.resetUserPassword(detail.id, resetTarget.id, newPassword);
      setResetMessage(`Contraseña de ${resetTarget.username} actualizada. Sus sesiones se cerraron.`);
      setResetTarget(null);
      setNewPassword('');
    } catch (err) {
      setResetMessage(err.message || 'No se pudo cambiar la contraseña');
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

      <div className={`${cardClass} overflow-x-auto`}>
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 uppercase tracking-wider">
            <tr>
              <th className="px-4 py-3">Empresa</th>
              <th className="px-4 py-3">RNC</th>
              <th className="px-4 py-3 text-center">Usuarios</th>
              <th className="px-4 py-3 text-center">Productos</th>
              <th className="px-4 py-3 text-center">Ventas</th>
              <th className="px-4 py-3">Alta</th>
              <th className="px-4 py-3 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {loading && (
              <tr><td colSpan={7} className="px-4 py-10 text-center"><Loader2 className="w-5 h-5 animate-spin inline" /></td></tr>
            )}
            {!loading && companies.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-10 text-center text-slate-400">No hay empresas.</td></tr>
            )}
            {!loading &&
              companies.map(c => (
                <tr key={c.id} className={c.active ? '' : 'opacity-60'}>
                  <td className="px-4 py-3 font-medium">
                    {c.name}
                    {!c.active && <span className="ml-2 text-[10px] font-semibold text-rose-500">SUSPENDIDA</span>}
                  </td>
                  <td className="px-4 py-3 font-mono">{c.rnc || '—'}</td>
                  <td className="px-4 py-3 text-center font-mono">{c._count.users}</td>
                  <td className="px-4 py-3 text-center font-mono">{c._count.products}</td>
                  <td className="px-4 py-3 text-center font-mono">{c._count.sales}</td>
                  <td className="px-4 py-3">{new Date(c.createdAt).toLocaleDateString('es-DO')}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <button onClick={() => openDetail(c)} title="Ver usuarios" className="p-1.5 text-slate-400 hover:text-indigo-600 cursor-pointer">
                        <Eye className="w-4 h-4" />
                      </button>
                      <button onClick={() => toggleActive(c)} title={c.active ? 'Suspender' : 'Reactivar'} className="p-1.5 text-slate-400 hover:text-rose-500 cursor-pointer">
                        <Power className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
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
              {field('adminPassword', 'Contraseña inicial * (mín. 8)', { type: 'password', required: true, minLength: 8, autoComplete: 'new-password' })}
            </div>
          </div>
          {formError && <p className="text-xs text-rose-500">{formError}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setIsFormOpen(false)} className="px-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 cursor-pointer">Cancelar</button>
            <button type="submit" disabled={saving} className="px-4 py-1.5 text-xs rounded-lg bg-indigo-600 text-white disabled:opacity-50 cursor-pointer">{saving ? 'Creando...' : 'Crear empresa'}</button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={!!detail} onClose={() => { setDetail(null); setResetTarget(null); setResetMessage(''); }} title={detail?.name || ''} maxWidth="lg">
        {detail && (
          <div className="space-y-4">
            <div className="text-xs space-y-1">
              <p>RNC: <span className="font-mono">{detail.rnc || '—'}</span></p>
              <p>Contacto: {[detail.phone, detail.email].filter(Boolean).join(' · ') || '—'}</p>
              <p>Estado: <strong className={detail.active ? 'text-emerald-600' : 'text-rose-500'}>{detail.active ? 'Activa' : 'Suspendida'}</strong></p>
            </div>
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
                      <button onClick={() => { setResetTarget(u); setResetMessage(''); }} title="Restablecer contraseña" className="p-1.5 text-slate-400 hover:text-indigo-600 cursor-pointer">
                        <KeyRound className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {resetTarget && (
              <form onSubmit={handleReset} className="flex items-end gap-2 bg-slate-50 dark:bg-slate-800/50 rounded-lg p-3">
                <div className="flex-1 space-y-1.5">
                  <label htmlFor="reset-pass" className={labelClass}>Nueva contraseña para {resetTarget.username}</label>
                  <input id="reset-pass" type="password" required minLength={8} autoComplete="new-password" value={newPassword} onChange={e => setNewPassword(e.target.value)} className={inputClass} />
                </div>
                <button type="submit" className="px-3 py-2 text-xs rounded-lg bg-indigo-600 text-white cursor-pointer">Cambiar</button>
                <button type="button" onClick={() => setResetTarget(null)} className="px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 cursor-pointer">Cancelar</button>
              </form>
            )}
            {resetMessage && <p className="text-xs text-emerald-600">{resetMessage}</p>}
          </div>
        )}
      </Modal>
    </div>
  );
}
