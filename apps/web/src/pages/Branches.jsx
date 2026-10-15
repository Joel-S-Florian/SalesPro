import React, { useState } from 'react';
import { Edit2, Loader2, MapPin, MessageCircle, Phone, Plus, Power, Store } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../services/api';
import Modal from '../components/Modal';
import { notify } from '../utils/notify';
import { useBranches, useContact, usePlanUsage } from '../hooks/queries';

const inputClass =
  'w-full px-3.5 py-2 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-800 dark:text-slate-100 bg-transparent focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-xs';
const labelClass = 'block text-xs font-semibold text-slate-600 dark:text-slate-400';
const EMPTY = { name: '', code: '', address: '', phone: '' };

/** Sucursales de la empresa: cada una con sus cajas, personal y (más adelante) inventario. El tope lo fija el plan. */
export default function Branches() {
  const queryClient = useQueryClient();
  const { data: branches = [], isLoading, error, refetch } = useBranches({ all: true });
  const { data: usage } = usePlanUsage();
  const { data: contact } = useContact();
  const [form, setForm] = useState(null); // null = cerrado; { id?, ...campos }
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  const limit = usage?.usage?.branches;
  const atLimit = limit?.blocksCreation;
  const refreshAll = () => {
    queryClient.invalidateQueries({ queryKey: ['branches'] });
    queryClient.invalidateQueries({ queryKey: ['company', 'plan-usage'] });
  };

  const openForm = branch => {
    setFormError('');
    setForm(branch ? { id: branch.id, isMain: branch.isMain, name: branch.name, code: branch.code, address: branch.address || '', phone: branch.phone || '' } : { ...EMPTY });
  };
  const set = (key, value) => setForm(f => ({ ...f, [key]: value }));

  const save = async e => {
    e.preventDefault();
    try {
      setSaving(true);
      setFormError('');
      const payload = { name: form.name.trim(), code: form.code.trim() || undefined, address: form.address.trim(), phone: form.phone.trim() };
      if (form.id) await api.branches.update(form.id, { ...payload, code: payload.code || form.code });
      else await api.branches.create(payload);
      notify.success(form.id ? 'Sucursal actualizada' : 'Sucursal creada');
      setForm(null);
      refreshAll();
    } catch (err) {
      setFormError(err.message || 'No se pudo guardar la sucursal');
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async branch => {
    try {
      await api.branches.update(branch.id, { active: !branch.active });
      refreshAll();
    } catch (err) {
      notify.error(err.message || 'No se pudo cambiar el estado de la sucursal');
    }
  };

  return (
    <div className="space-y-6" id="branches-view">
      <div className="flex flex-col gap-4 border-b border-slate-100 pb-5 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-sans text-2xl font-bold tracking-tight text-slate-800 dark:text-slate-100">Sucursales</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">Cada sucursal tiene sus cajas y su personal. Sus datos salen en los tickets y facturas de sus ventas.</p>
        </div>
        <button
          type="button"
          onClick={() => openForm(null)}
          disabled={atLimit}
          className="flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
        >
          <Plus className="h-4 w-4" /> Nueva sucursal
        </button>
      </div>

      {limit && (
        <div className="rounded-xl border border-slate-100 bg-white p-4 text-xs shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <p className="text-slate-600 dark:text-slate-300">
            Tu plan <strong>{usage.effectivePlanName}</strong> incluye {limit.limit === null ? 'sucursales sin tope' : `${limit.limit} ${limit.limit === 1 ? 'sucursal' : 'sucursales'}`}; usas {limit.current}.
          </p>
          {atLimit && (
            <p className="mt-1 text-amber-600">
              Llegaste al tope de tu plan. Para agregar más sucursales, cambia de plan.
              {contact?.link && (
                <a href={contact.link} target="_blank" rel="noreferrer" className="ml-2 inline-flex items-center gap-1 font-semibold text-emerald-600 hover:underline">
                  <MessageCircle className="h-3 w-3" /> Escribir por WhatsApp
                </a>
              )}
            </p>
          )}
        </div>
      )}

      {error ? (
        <p className="text-xs text-rose-500">
          No se pudieron cargar las sucursales.{' '}
          <button type="button" className="cursor-pointer underline" onClick={() => refetch()}>
            Reintentar
          </button>
        </p>
      ) : isLoading ? (
        <Loader2 className="h-5 w-5 animate-spin" />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {branches.map(b => (
            <div key={b.id} className={`space-y-3 rounded-xl border bg-white p-5 shadow-sm dark:bg-slate-900 ${b.active ? 'border-slate-100 dark:border-slate-800' : 'border-dashed border-slate-300 opacity-60 dark:border-slate-700'}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Store className="h-5 w-5 text-indigo-500" />
                  <div>
                    <h3 className="font-semibold text-slate-800 dark:text-slate-100">{b.name}</h3>
                    <p className="font-mono text-[11px] text-slate-400">Código {b.code}</p>
                  </div>
                </div>
                <div className="flex gap-1">
                  {b.isMain && <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300">Principal</span>}
                  {!b.active && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500 dark:bg-slate-800">Inactiva</span>}
                </div>
              </div>
              <div className="space-y-1 text-xs text-slate-500">
                <p className="flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" /> {b.address || 'Sin dirección'}</p>
                <p className="flex items-center gap-1.5"><Phone className="h-3.5 w-3.5" /> {b.phone || 'Sin teléfono'}</p>
              </div>
              <div className="flex items-center justify-between border-t border-slate-100 pt-3 text-[11px] text-slate-500 dark:border-slate-800">
                <span>{b._count?.terminals ?? 0} cajas · {b._count?.users ?? 0} vendedores · {b._count?.sales ?? 0} ventas</span>
                <span className="flex gap-1">
                  <button type="button" aria-label={`Editar ${b.name}`} title="Editar" onClick={() => openForm(b)} className="cursor-pointer p-1.5 text-slate-400 hover:text-indigo-600">
                    <Edit2 className="h-4 w-4" />
                  </button>
                  {!b.isMain && (
                    <button type="button" aria-label={b.active ? `Desactivar ${b.name}` : `Reactivar ${b.name}`} title={b.active ? 'Desactivar' : 'Reactivar'} onClick={() => toggleActive(b)} className="cursor-pointer p-1.5 text-slate-400 hover:text-rose-500">
                      <Power className="h-4 w-4" />
                    </button>
                  )}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal isOpen={!!form} onClose={() => !saving && setForm(null)} title={form?.id ? 'Editar sucursal' : 'Nueva sucursal'} maxWidth="md">
        {form && (
          <form onSubmit={save} className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div className="col-span-2 space-y-1.5">
                <label htmlFor="branch-name" className={labelClass}>Nombre *</label>
                <input id="branch-name" required maxLength={60} placeholder="Ej. Sucursal Santiago" value={form.name} onChange={e => set('name', e.target.value)} className={inputClass} />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="branch-code" className={labelClass}>Código</label>
                <input id="branch-code" maxLength={20} placeholder="Automático" value={form.code} onChange={e => set('code', e.target.value)} className={inputClass} />
              </div>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="branch-address" className={labelClass}>Dirección</label>
              <input id="branch-address" maxLength={200} value={form.address} onChange={e => set('address', e.target.value)} className={inputClass} />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="branch-phone" className={labelClass}>Teléfono</label>
              <input id="branch-phone" type="tel" maxLength={30} placeholder="809-000-0000" value={form.phone} onChange={e => set('phone', e.target.value)} className={inputClass} />
            </div>
            {formError && <p className="text-xs text-rose-500">{formError}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setForm(null)} className="cursor-pointer rounded-lg border border-slate-200 px-3 py-1.5 text-xs dark:border-slate-700">Cancelar</button>
              <button type="submit" disabled={saving} className="cursor-pointer rounded-lg bg-indigo-600 px-4 py-1.5 text-xs text-white disabled:opacity-50">{saving ? 'Guardando...' : 'Guardar'}</button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
