import React, { useCallback, useEffect, useState } from 'react';
import { BadgeCheck, CircleAlert, Clock3, Download, FileInput, Loader2, Receipt, RefreshCw, ShieldAlert, TriangleAlert } from 'lucide-react';
import { api } from '../services/api';
import Modal from '../components/Modal';
import Pagination from '../components/Pagination';
import EcfStatusBadge, { ECF_STATUS } from '../components/ecf/EcfStatusBadge';
import { TableSkeleton, Skeleton } from '../components/Skeleton';
import { Field, inputClass, primaryButtonClass, secondaryButtonClass } from '../components/ui/form';
import { usePagedList } from '../hooks/usePagedList';
import { dateTime, money } from '../utils/format';
import { notify } from '../utils/notify';
import { Kpi } from './reports/shared';

const TABS = [
  { id: 'SENT', label: 'Emitidos', icon: Receipt },
  { id: 'INBOX', label: 'Recibidos', icon: FileInput },
  { id: 'NUMBERING', label: 'Numeración', icon: Clock3 },
];

const MODE_LABELS = { OFF: 'Apagado', PRECERT: 'Pruebas (pre-certificación)', CERT: 'Certificación', PROD: 'Producción' };
const selectClass = 'h-9 rounded-lg border border-slate-200 bg-transparent px-3 text-xs text-slate-700 outline-none focus:ring-1 focus:ring-indigo-500 dark:border-slate-700 dark:text-slate-300';

async function saveXml(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* --------------------------------- Emitidos ---------------------------------- */

function IssuedTab() {
  const [status, setStatus] = useState('');
  const { rows, total, loading, error, page, pageSize, setPage, setPageSize, reload } = usePagedList(api.ecf.documents, { status: status || undefined });
  const [busyId, setBusyId] = useState(null);

  const retry = async row => {
    try {
      setBusyId(row.id);
      await api.ecf.retry(row.sale.id);
      notify.info('Reintentando el envío…');
      setTimeout(reload, 2500);
    } catch (err) {
      notify.error(err.message || 'No se pudo reintentar');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="overflow-hidden rounded-xl border border-slate-100 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-4 dark:border-slate-800">
        <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">Comprobantes emitidos</h3>
        <select aria-label="Filtrar por estado" value={status} onChange={e => setStatus(e.target.value)} className={selectClass}>
          <option value="">Todos los estados</option>
          {Object.entries(ECF_STATUS).map(([value, info]) => <option key={value} value={value}>{info.label}</option>)}
        </select>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-50 font-mono uppercase tracking-wider text-slate-400 dark:bg-slate-800/40">
            <tr>
              <th className="px-4 py-3">e-NCF</th>
              <th className="px-4 py-3">Cliente</th>
              <th className="px-4 py-3 text-right">Total</th>
              <th className="px-4 py-3">Estado</th>
              <th className="px-4 py-3">Fecha</th>
              <th className="px-4 py-3">Detalle</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
            {loading && rows.length === 0 && <TableSkeleton rows={pageSize} columns={7} />}
            {rows.map(row => (
              <tr key={row.id} className="text-slate-600 dark:text-slate-400">
                <td className="px-4 py-3 font-mono font-semibold text-slate-800 dark:text-slate-200">{row.eNcf}<span className="ml-2 font-sans text-[10px] font-normal text-slate-400">{row.kind === 'RFCE' ? 'resumen' : ''}</span></td>
                <td className="px-4 py-3">{row.sale?.customerName}</td>
                <td className="px-4 py-3 text-right font-mono">{money(row.sale?.total)}</td>
                <td className="px-4 py-3"><EcfStatusBadge status={row.status} /></td>
                <td className="px-4 py-3">{dateTime(row.sale?.createdAt || row.createdAt)}</td>
                <td className="max-w-[18rem] px-4 py-3">
                  {row.lastError ? <span className="text-rose-600">{row.lastError}</span> : row.trackId ? <span className="font-mono text-[11px] text-slate-400">track {row.trackId.slice(0, 8)}…</span> : '—'}
                </td>
                <td className="px-4 py-3 text-right">
                  {['ERROR', 'CONTINGENCY', 'PENDING'].includes(row.status) && (
                    <button type="button" onClick={() => retry(row)} disabled={busyId === row.id} className="inline-flex cursor-pointer items-center gap-1 text-[11px] font-semibold text-indigo-500 hover:text-indigo-600 disabled:opacity-50">
                      {busyId === row.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />} Reintentar
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {!loading && rows.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-10 text-center text-slate-400">{error || 'Aún no hay comprobantes electrónicos emitidos.'}</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <Pagination page={page} pageSize={pageSize} total={total} onPageChange={setPage} onPageSizeChange={setPageSize} noun="comprobantes" />
    </div>
  );
}

/* --------------------------------- Recibidos --------------------------------- */

const INBOX_STATUS = {
  RECIBIDO: { label: 'Por responder', style: 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300' },
  APROBADO: { label: 'Aprobado', style: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300' },
  RECHAZADO: { label: 'Rechazado', style: 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300' },
};

function InboxTab() {
  const { rows, total, loading, error, page, pageSize, setPage, setPageSize, reload } = usePagedList(api.ecf.inbox, {});
  const [target, setTarget] = useState(null); // { row, approved }
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const respond = async event => {
    event.preventDefault();
    try {
      setBusy(true);
      const result = await api.ecf.respondInbox(target.row.id, { approved: target.approved, reason: reason || undefined });
      notify.success(target.approved ? 'Comprobante aprobado' : 'Comprobante rechazado');
      if (result.issuer && result.issuer !== 'enviada') notify.warning(`Aviso al emisor: ${result.issuer}`);
      setTarget(null);
      setReason('');
      reload();
    } catch (err) {
      notify.error(err.message || 'No se pudo enviar la respuesta');
    } finally {
      setBusy(false);
    }
  };

  const download = async row => {
    try {
      await saveXml(await api.ecf.inboxXml(row.id), `${row.rncEmisor}${row.eNcf}.xml`);
    } catch (err) {
      notify.error(err.message || 'No se pudo descargar el XML');
    }
  };

  return (
    <div className="overflow-hidden rounded-xl border border-slate-100 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="border-b border-slate-100 p-4 dark:border-slate-800">
        <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">Comprobantes recibidos de proveedores</h3>
        <p className="text-xs text-slate-400">e-CF que otros contribuyentes emiten a nombre de la empresa. Apruébelos o recházelos comercialmente.</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-50 font-mono uppercase tracking-wider text-slate-400 dark:bg-slate-800/40">
            <tr>
              <th className="px-4 py-3">Emisor</th>
              <th className="px-4 py-3">e-NCF</th>
              <th className="px-4 py-3 text-right">Total</th>
              <th className="px-4 py-3">Recibido</th>
              <th className="px-4 py-3">Estado</th>
              <th className="px-4 py-3 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
            {loading && rows.length === 0 && <TableSkeleton rows={5} columns={6} />}
            {rows.map(row => (
              <tr key={row.id} className="text-slate-600 dark:text-slate-400">
                <td className="px-4 py-3"><p className="font-medium text-slate-800 dark:text-slate-200">{row.supplierName || 'Emisor'}</p><p className="font-mono text-[11px] text-slate-400">{row.rncEmisor}</p></td>
                <td className="px-4 py-3 font-mono">{row.eNcf}</td>
                <td className="px-4 py-3 text-right font-mono">{money(row.total)}</td>
                <td className="px-4 py-3">{dateTime(row.receivedAt)}</td>
                <td className="px-4 py-3"><span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${INBOX_STATUS[row.status]?.style}`}>{INBOX_STATUS[row.status]?.label || row.status}</span></td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-3">
                    <button type="button" onClick={() => download(row)} aria-label={`Descargar XML de ${row.eNcf}`} className="cursor-pointer text-slate-400 hover:text-slate-600"><Download className="h-4 w-4" /></button>
                    {row.status === 'RECIBIDO' && (
                      <>
                        <button type="button" onClick={() => setTarget({ row, approved: true })} className="cursor-pointer text-[11px] font-semibold text-emerald-600 hover:text-emerald-700">Aprobar</button>
                        <button type="button" onClick={() => setTarget({ row, approved: false })} className="cursor-pointer text-[11px] font-semibold text-rose-600 hover:text-rose-700">Rechazar</button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {!loading && rows.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-400">{error || 'No ha recibido comprobantes electrónicos todavía.'}</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <Pagination page={page} pageSize={pageSize} total={total} onPageChange={setPage} onPageSizeChange={setPageSize} noun="comprobantes" />

      <Modal isOpen={!!target} onClose={() => !busy && setTarget(null)} title={target?.approved ? 'Aprobar comprobante' : 'Rechazar comprobante'} maxWidth="sm">
        {target && (
          <form onSubmit={respond} className="space-y-4">
            <p className="text-sm text-slate-600 dark:text-slate-300">
              {target.row.eNcf} de {target.row.supplierName || target.row.rncEmisor} por <strong>{money(target.row.total)}</strong>. La respuesta se envía a la DGII y al emisor y no se puede cambiar.
            </p>
            {!target.approved && (
              <Field id="inbox-reason" label="Motivo del rechazo">
                <input id="inbox-reason" value={reason} onChange={e => setReason(e.target.value)} maxLength={250} required className={inputClass} />
              </Field>
            )}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setTarget(null)} disabled={busy} className={secondaryButtonClass}>Cancelar</button>
              <button type="submit" disabled={busy} className={`${primaryButtonClass} inline-flex items-center gap-2 ${target.approved ? '' : '!bg-rose-600 hover:!bg-rose-700'}`}>
                {busy && <Loader2 className="h-4 w-4 animate-spin" />} {target.approved ? 'Aprobar' : 'Rechazar'}
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}

/* -------------------------------- Numeración --------------------------------- */

function NumberingTab() {
  const [rows, setRows] = useState(null);
  const [target, setTarget] = useState(null);
  const [to, setTo] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setRows(await api.ecf.sequences());
    } catch (err) {
      notify.error(err.message);
      setRows([]);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const nextNumber = row => row.current + 1;
  const submit = async event => {
    event.preventDefault();
    try {
      setBusy(true);
      const result = await api.ecf.voidRanges([{ ecfType: target.ecfType, from: nextNumber(target), to: Number(to) }]);
      notify.success(`${result.voided} números anulados en la DGII`);
      setTarget(null);
      setTo('');
      load();
    } catch (err) {
      notify.error(err.message || 'No se pudo anular el rango');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">Numeración autorizada</h3>
      <p className="mb-4 text-xs text-slate-400">Para dar de baja números que no se van a usar (por ejemplo antes de que venza un rango). Solo se anulan los que siguen al último usado.</p>
      {rows === null ? (
        <Skeleton className="h-24" />
      ) : (
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {rows.map(row => (
            <li key={row.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-xs">
              <div>
                <p className="font-semibold text-slate-800 dark:text-slate-100">{row.ecfType} <span className="font-mono font-normal text-slate-500">{row.rangeFrom.toLocaleString('es-DO')} – {row.rangeTo.toLocaleString('es-DO')}</span></p>
                <p className="text-slate-400">Quedan {row.remaining.toLocaleString('es-DO')} · {row.validUntil ? `vence ${new Date(row.validUntil).toLocaleDateString('es-DO')}` : 'sin vencimiento'}{row.expired ? ' (vencido)' : ''}</p>
              </div>
              {row.active && row.remaining > 0 && (
                <button type="button" onClick={() => { setTarget(row); setTo(String(nextNumber(row))); }} className="cursor-pointer text-[11px] font-semibold text-rose-600 hover:text-rose-700">Anular rango</button>
              )}
            </li>
          ))}
          {rows.length === 0 && <li className="py-6 text-center text-slate-400">No hay rangos registrados. Agréguelos en Configuración → Facturación electrónica.</li>}
        </ul>
      )}

      <Modal isOpen={!!target} onClose={() => !busy && setTarget(null)} title="Anular rango de e-NCF" maxWidth="sm">
        {target && (
          <form onSubmit={submit} className="space-y-4">
            <p className="text-sm text-slate-600 dark:text-slate-300">Se anularán en la DGII los {target.ecfType} desde el <strong className="font-mono">{nextNumber(target)}</strong>. <strong>No se puede deshacer.</strong></p>
            <Field id="void-to" label="Hasta el número" hint={`Máximo ${target.rangeTo.toLocaleString('es-DO')}`}>
              <input id="void-to" type="number" min={nextNumber(target)} max={target.rangeTo} value={to} onChange={e => setTo(e.target.value)} required className={inputClass} />
            </Field>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setTarget(null)} disabled={busy} className={secondaryButtonClass}>Cancelar</button>
              <button type="submit" disabled={busy} className={`${primaryButtonClass} inline-flex items-center gap-2 !bg-rose-600 hover:!bg-rose-700`}>{busy && <Loader2 className="h-4 w-4 animate-spin" />} Anular</button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}

/* ---------------------------------- Pantalla --------------------------------- */

export default function EcfDashboard({ onOpenSettings }) {
  const [tab, setTab] = useState('SENT');
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      setError('');
      setSummary(await api.ecf.summary());
    } catch (err) {
      setError(err.message || 'No se pudo cargar el resumen');
    }
  }, []);
  useEffect(() => {
    load();
    const timer = setInterval(load, 30000);
    return () => clearInterval(timer);
  }, [load]);

  if (error) return <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-600">{error}</div>;
  if (!summary) return <div className="space-y-4" aria-busy="true">{[0, 1].map(i => <Skeleton key={i} className="h-28 rounded-xl" />)}</div>;

  return (
    <div className="space-y-5" id="ecf-dashboard">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4 dark:border-slate-800">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-800 dark:text-slate-100">Facturación electrónica</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">Estado de sus comprobantes ante la DGII.</p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${summary.mode === 'OFF' ? 'bg-slate-100 text-slate-600' : summary.mode === 'PROD' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{MODE_LABELS[summary.mode]}</span>
          {onOpenSettings && <button type="button" onClick={onOpenSettings} className={`${secondaryButtonClass} !h-9 text-xs`}>Configurar</button>}
        </div>
      </div>

      {summary.mode === 'OFF' && (
        <div className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-800/40 dark:text-slate-300">
          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <p>La facturación electrónica está apagada: las ventas se emiten con comprobantes de papel (serie B). Actívela en Configuración cuando la DGII habilite a la empresa.</p>
        </div>
      )}

      {summary.alerts.map(alert => (
        <div key={alert.code + alert.message} role="alert" className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-xs ${alert.level === 'error' ? 'border-red-200 bg-red-50 text-red-700 dark:border-red-900/50 dark:bg-red-950/20 dark:text-red-400' : 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-300'}`}>
          <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" /> {alert.message}
        </div>
      ))}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi label="Aceptados (30 d)" value={summary.last30Days.accepted} icon={BadgeCheck} tone="emerald" />
        <Kpi label="En proceso" value={summary.last30Days.pending} icon={Clock3} tone="blue" hint="Por enviar o esperando a la DGII" />
        <Kpi label="Con error" value={summary.last30Days.error} icon={CircleAlert} tone="amber" hint="Se reintentan solos" />
        <Kpi label="Rechazados" value={summary.last30Days.rejected} icon={ShieldAlert} tone="rose" hint="Requieren revisión" />
      </div>

      <div role="tablist" aria-label="Comprobantes electrónicos" className="flex gap-1">
        {TABS.map(item => (
          <button key={item.id} type="button" role="tab" aria-selected={tab === item.id} onClick={() => setTab(item.id)} className={`inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg px-3 text-[13px] font-semibold transition active:scale-[0.97] ${tab === item.id ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800'}`}>
            <item.icon className="h-4 w-4" aria-hidden="true" /> {item.label}
          </button>
        ))}
      </div>
      <div role="tabpanel">
        {tab === 'SENT' && <IssuedTab />}
        {tab === 'INBOX' && <InboxTab />}
        {tab === 'NUMBERING' && <NumberingTab />}
      </div>
    </div>
  );
}
