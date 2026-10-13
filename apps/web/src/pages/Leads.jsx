import React, { useState } from 'react';
import { Check, Copy, Inbox, Loader2, X } from 'lucide-react';
import { api } from '../services/api';
import Modal from '../components/Modal';
import Pagination from '../components/Pagination';
import { TableSkeleton } from '../components/Skeleton';
import { usePagedList } from '../hooks/usePagedList';
import { Field, inputClass, primaryButtonClass, secondaryButtonClass } from '../components/ui/form';
import { notify } from '../utils/notify';
import { dateTime } from '../utils/format';
import SmartSelect from '../components/ui/SmartSelect';

const STATUS = {
  NEW: { label: 'Nueva', style: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300' },
  APPROVED: { label: 'Aprobada', style: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300' },
  REJECTED: { label: 'Rechazada', style: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300' },
};
const PLANS = [
  ['FREE', 'Gratis'],
  ['STARTER', 'Starter'],
  ['BUSINESS', 'Business'],
  ['PRO', 'Pro'],
  ['ENTERPRISE', 'Enterprise'],
];

/** Bandeja de solicitudes de acceso que llegan desde la página de promoción (solo SUPERADMIN). */
export default function Leads() {
  const [status, setStatus] = useState('NEW');
  const { rows, total, loading, error, page, pageSize, setPage, setPageSize, reload } = usePagedList(api.platform.leads, {
    status: status || undefined,
  });

  const [target, setTarget] = useState(null);
  const [plan, setPlan] = useState('STARTER');
  const [trialDays, setTrialDays] = useState(14);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null); // { company, credentials }
  const [copied, setCopied] = useState(false);

  const approve = async event => {
    event.preventDefault();
    try {
      setBusy(true);
      const created = await api.platform.approveLead(target.id, { plan, trialDays: Number(trialDays) || 0 });
      setTarget(null);
      setResult(created);
      reload();
    } catch (err) {
      notify.error(err.message || 'No se pudo aprobar la solicitud');
    } finally {
      setBusy(false);
    }
  };

  const reject = async lead => {
    if (!window.confirm(`¿Rechazar la solicitud de ${lead.business}?`)) return;
    try {
      await api.platform.rejectLead(lead.id);
      notify.success('Solicitud rechazada');
      reload();
    } catch (err) {
      notify.error(err.message || 'No se pudo rechazar la solicitud');
    }
  };

  const copyCredentials = async () => {
    const text = `Usuario: ${result.credentials.username}\nContraseña temporal: ${result.credentials.password}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      notify.warning('No se pudo copiar automáticamente. Selecciónalos y cópialos a mano.');
    }
  };

  return (
    <div className="space-y-4" id="leads-view">
      <div className="flex flex-col justify-between gap-3 rounded-xl border border-slate-100 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 md:flex-row md:items-center">
        <div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Solicitudes de acceso</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">Negocios que pidieron entrar desde la página de promoción.</p>
        </div>
        <div role="group" aria-label="Filtrar por estado" className="flex gap-1.5">
          {[['NEW', 'Nuevas'], ['APPROVED', 'Aprobadas'], ['REJECTED', 'Rechazadas'], ['', 'Todas']].map(([value, label]) => (
            <button
              key={label}
              type="button"
              aria-pressed={status === value}
              onClick={() => setStatus(value)}
              className={`h-9 rounded-lg px-3.5 text-[13px] font-medium cursor-pointer ${
                status === value ? 'bg-indigo-600 text-white' : 'border border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-100 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500 dark:bg-slate-800/50">
              <tr>
                <th className="px-4 py-3">Negocio</th>
                <th className="px-4 py-3">Contacto</th>
                <th className="px-4 py-3">Recibida</th>
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {loading && rows.length === 0 && <TableSkeleton rows={pageSize} columns={5} />}
              {rows.map(lead => (
                <tr key={lead.id} className="align-top">
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-900 dark:text-white">{lead.business}</p>
                    <p className="text-xs text-slate-500">{[lead.name, lead.businessType].filter(Boolean).join(' · ')}</p>
                    {lead.note && <p className="mt-1 max-w-xs text-xs italic text-slate-500">“{lead.note}”</p>}
                  </td>
                  <td className="px-4 py-3 font-mono text-[13px]">{lead.contact}</td>
                  <td className="px-4 py-3 text-slate-500">{dateTime(lead.createdAt)}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS[lead.status].style}`}>{STATUS[lead.status].label}</span>
                  </td>
                  <td className="px-4 py-3">
                    {lead.status === 'NEW' && (
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setTarget(lead);
                            setPlan('STARTER');
                            setTrialDays(14);
                          }}
                          className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-indigo-600 px-3 text-[13px] font-semibold text-white hover:bg-indigo-700 cursor-pointer"
                        >
                          <Check className="h-4 w-4" /> Aprobar
                        </button>
                        <button
                          type="button"
                          onClick={() => reject(lead)}
                          aria-label={`Rechazar solicitud de ${lead.business}`}
                          className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-rose-50 hover:text-rose-600 dark:border-slate-700 cursor-pointer"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {!loading && rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-slate-500">
                    <Inbox className="mx-auto mb-2 h-8 w-8 text-slate-300" strokeWidth={1.5} />
                    {error || 'No hay solicitudes en esta lista.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <Pagination page={page} pageSize={pageSize} total={total} onPageChange={setPage} onPageSizeChange={setPageSize} noun="solicitudes" />
      </div>

      <Modal isOpen={!!target} onClose={() => !busy && setTarget(null)} title="Aprobar solicitud" maxWidth="sm">
        {target && (
          <form onSubmit={approve} className="space-y-4">
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Se creará la empresa <strong className="text-slate-900 dark:text-white">{target.business}</strong> con un administrador ({target.name}) y una
              contraseña temporal.
            </p>
            <Field id="lead-plan" label="Plan">
              <SmartSelect id="lead-plan" value={plan} onChange={e => setPlan(e.target.value)} className={inputClass}>
                {PLANS.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </SmartSelect>
            </Field>
            <Field id="lead-trial" label="Días de prueba gratuita" hint="0 = sin periodo de prueba">
              <input id="lead-trial" type="number" min="0" max="365" value={trialDays} onChange={e => setTrialDays(e.target.value)} className={inputClass} />
            </Field>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setTarget(null)} disabled={busy} className={secondaryButtonClass}>
                Cancelar
              </button>
              <button type="submit" disabled={busy} className={`${primaryButtonClass} inline-flex items-center gap-2`}>
                {busy && <Loader2 className="h-4 w-4 animate-spin" />} Crear empresa
              </button>
            </div>
          </form>
        )}
      </Modal>

      <Modal isOpen={!!result} onClose={() => setResult(null)} title="Empresa creada" maxWidth="sm">
        {result && (
          <div className="space-y-4">
            <p className="text-sm text-slate-600 dark:text-slate-300">
              <strong className="text-slate-900 dark:text-white">{result.company.name}</strong> ya puede entrar. Comparte estos datos con{' '}
              {result.company.users?.[0]?.fullName || 'el cliente'}; la contraseña <strong>no se vuelve a mostrar</strong>.
            </p>
            <dl className="space-y-2 rounded-xl bg-slate-50 p-4 font-mono text-sm dark:bg-slate-800/50">
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">Usuario</dt>
                <dd className="select-all font-semibold text-slate-900 dark:text-white">{result.credentials.username}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">Contraseña</dt>
                <dd className="select-all font-semibold text-slate-900 dark:text-white">{result.credentials.password}</dd>
              </div>
            </dl>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={copyCredentials} className={`${secondaryButtonClass} inline-flex items-center gap-2`}>
                {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />} {copied ? 'Copiado' : 'Copiar'}
              </button>
              <button type="button" onClick={() => setResult(null)} className={primaryButtonClass}>
                Listo
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
