import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Archive, Download, FileSpreadsheet, Loader2, Lock, ShieldCheck, Trash2, X } from 'lucide-react';
import { api } from '../services/api';
import { notify } from '../utils/notify';
import SmartSelect from '../components/ui/SmartSelect';
import { PLANS, PLAN_IDS } from '@factos/shared/plans.js';

const cardClass = 'bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-xl p-4 shadow-sm';
const PLAN_NAMES = Object.fromEntries(PLAN_IDS.map(id => [id, PLANS[id].name]));
const ACTIVE = ['PENDING', 'RUNNING'];

const DESCRIPTIONS = {
  SALES: 'Todas las facturas y sus líneas (productos, cantidades, precios, ITBIS y descuentos).',
  PRODUCTS: 'Catálogo, categorías, proveedores, presentaciones, lotes y todos los movimientos de inventario.',
  CUSTOMERS: 'Tu cartera de clientes con documento, contacto y datos de comprobante electrónico.',
  FULL: 'Todo lo de tu empresa: usuarios (sin contraseñas), ventas, inventario, cajas y cierres, configuración, comprobantes electrónicos y auditoría.',
};

const STATUS = {
  PENDING: ['En espera', 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'],
  RUNNING: ['Generando', 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300'],
  DONE: ['Lista', 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'],
  FAILED: ['Falló', 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300'],
  CANCELLED: ['Cancelada', 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'],
  EXPIRED: ['Vencida', 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300'],
};

const formatSize = bytes => (bytes == null ? '—' : bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`);
const formatDate = value => (value ? new Date(value).toLocaleString('es-DO', { dateStyle: 'medium', timeStyle: 'short' }) : '—');

/**
 * Respaldo y exportaciones: pide los datos de la empresa, se generan en segundo plano (puede tardar) y se descargan
 * como un ZIP con enlace de corta vida. Solo ADMINISTRADOR. Los archivos se conservan un tiempo limitado.
 */
export default function Backup() {
  const [options, setOptions] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [format, setFormat] = useState('CSV');
  const [requesting, setRequesting] = useState('');
  const [error, setError] = useState('');
  const known = useRef(new Map()); // id → estado anterior, para avisar cuando una exportación termina

  const refresh = useCallback(async () => {
    try {
      const result = await api.exports.list();
      const list = result?.data || [];
      for (const job of list) {
        const before = known.current.get(job.id);
        if (before && ACTIVE.includes(before) && job.status === 'DONE') notify.success(`${job.label}: la exportación está lista para descargar`);
        if (before && ACTIVE.includes(before) && job.status === 'FAILED') notify.error(`${job.label}: no se pudo generar`);
        known.current.set(job.id, job.status);
      }
      setJobs(list);
      setError('');
    } catch (err) {
      setError(err.message || 'No se pudieron cargar las exportaciones');
    }
  }, []);

  useEffect(() => {
    api.exports.options().then(setOptions).catch(err => setError(err.message || 'No se pudieron cargar las opciones'));
    refresh();
  }, [refresh]);

  // Mientras haya una exportación en marcha, se consulta el avance cada 2 segundos
  const hasActive = jobs.some(job => ACTIVE.includes(job.status));
  useEffect(() => {
    if (!hasActive) return undefined;
    const timer = setInterval(refresh, 2000);
    return () => clearInterval(timer);
  }, [hasActive, refresh]);

  const request = async type => {
    try {
      setRequesting(type);
      await api.exports.create({ type, format });
      notify.info('Exportación en marcha. Puedes seguir trabajando: te avisaremos cuando esté lista.');
      await refresh();
    } catch (err) {
      notify.error(err.message || 'No se pudo iniciar la exportación');
    } finally {
      setRequesting('');
    }
  };

  const download = async job => {
    try {
      const { url } = await api.exports.link(job.id);
      // Descarga directa del navegador (en streaming): no pasa por la memoria de la página
      const link = document.createElement('a');
      link.href = url;
      link.download = job.fileName || 'exportacion.zip';
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err) {
      notify.error(err.message || 'No se pudo preparar la descarga');
    }
  };

  const remove = async job => {
    try {
      await api.exports.remove(job.id);
      notify.success(ACTIVE.includes(job.status) ? 'Exportación cancelada' : 'Exportación eliminada');
      await refresh();
    } catch (err) {
      notify.error(err.message || 'No se pudo completar la acción');
    }
  };

  return (
    <div className="space-y-4" id="backup-view">
      <div className={`${cardClass} space-y-1`}>
        <h3 className="flex items-center gap-2 font-semibold text-slate-800 dark:text-slate-100"><Archive className="h-4 w-4 text-indigo-500" /> Respaldo y exportaciones</h3>
        <p className="text-xs text-slate-500">
          Descarga una copia de los datos de <strong>tu empresa</strong> (solo la tuya). Se genera en segundo plano, puede tardar unos minutos si hay mucha información, y el archivo se conserva {options?.ttlHours || 48} horas.
        </p>
        <p className="flex items-center gap-1.5 text-[11px] text-slate-400">
          <ShieldCheck className="h-3.5 w-3.5" /> Nunca incluye contraseñas, certificados digitales ni claves de pasarelas de pago. Guárdalo en un lugar seguro: tiene datos personales y comerciales.
        </p>
      </div>

      {error && <p className="text-xs text-rose-500">{error}</p>}

      <div className="flex flex-wrap items-center gap-3 text-xs">
        <label htmlFor="export-format" className="font-semibold text-slate-600 dark:text-slate-400">Formato</label>
        <SmartSelect id="export-format" value={format} onChange={e => setFormat(e.target.value)} className="rounded-lg border border-slate-200 bg-transparent px-3 py-2 text-xs dark:border-slate-700">
          <option value="CSV">CSV (Excel)</option>
          <option value="JSON" disabled={options && !options.jsonAllowed}>
            {options && !options.jsonAllowed ? 'JSON (plan superior)' : 'JSON (datos completos)'}
          </option>
        </SmartSelect>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {(options?.types || []).map(item => (
          <div key={item.type} className={`${cardClass} flex flex-col gap-2`}>
            <div className="flex items-start justify-between gap-2">
              <h4 className="flex items-center gap-1.5 text-sm font-semibold text-slate-800 dark:text-slate-100">
                <FileSpreadsheet className="h-4 w-4 text-indigo-500" /> {item.label}
              </h4>
              {item.minPlan !== 'FREE' && (
                <span className="shrink-0 rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold text-indigo-600 dark:bg-indigo-950/40">
                  Plan {PLAN_NAMES[item.minPlan]}
                </span>
              )}
            </div>
            <p className="flex-1 text-xs text-slate-500">{DESCRIPTIONS[item.type]}</p>
            <button
              type="button"
              onClick={() => request(item.type)}
              disabled={!item.allowed || hasActive || !!requesting}
              className="flex items-center justify-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50 cursor-pointer"
            >
              {requesting === item.type ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : item.allowed ? <Download className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
              {item.allowed ? 'Generar' : `Disponible en ${PLAN_NAMES[item.minPlan]}`}
            </button>
          </div>
        ))}
      </div>

      <div className={cardClass}>
        <h4 className="mb-3 text-sm font-semibold text-slate-800 dark:text-slate-100">Mis exportaciones</h4>
        {jobs.length === 0 ? (
          <p className="py-6 text-center text-xs text-slate-400">Todavía no has generado ninguna.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-slate-400 uppercase">
                <tr>
                  <th className="px-3 py-2">Exportación</th>
                  <th className="px-3 py-2">Estado</th>
                  <th className="px-3 py-2">Tamaño</th>
                  <th className="px-3 py-2">Solicitada</th>
                  <th className="px-3 py-2">Vence</th>
                  <th className="px-3 py-2 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {jobs.map(job => {
                  const [label, tone] = STATUS[job.status] || [job.status, ''];
                  const active = ACTIVE.includes(job.status);
                  return (
                    <tr key={job.id}>
                      <td className="px-3 py-2.5">
                        <span className="block font-medium">{job.label}</span>
                        <span className="text-[11px] text-slate-400">{job.format} · {job.userName}</span>
                      </td>
                      <td className="min-w-40 px-3 py-2.5">
                        <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${tone}`}>{label}</span>
                        {active && (
                          <div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={job.progress} aria-label={`Avance de ${job.label}`} className="mt-1.5">
                            <div className="h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                              <div className="h-full rounded-full bg-indigo-600 transition-[width] duration-500" style={{ width: `${job.progress}%` }} />
                            </div>
                            <span className="text-[10px] text-slate-400">{job.rowsTotal ? `${job.rowsDone.toLocaleString('es-DO')} de ${job.rowsTotal.toLocaleString('es-DO')} filas` : 'Preparando...'}</span>
                          </div>
                        )}
                        {job.status === 'FAILED' && job.error && <span className="mt-1 block text-[11px] text-rose-500">{job.error}</span>}
                      </td>
                      <td className="px-3 py-2.5">{job.status === 'DONE' ? formatSize(job.fileSize) : '—'}</td>
                      <td className="px-3 py-2.5 text-slate-500">{formatDate(job.createdAt)}</td>
                      <td className="px-3 py-2.5 text-slate-500">{job.status === 'DONE' ? formatDate(job.expiresAt) : '—'}</td>
                      <td className="px-3 py-2.5">
                        <div className="flex justify-end gap-1">
                          {job.status === 'DONE' && (
                            <button type="button" onClick={() => download(job)} className="flex items-center gap-1 rounded-lg bg-slate-100 px-2.5 py-1.5 font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200 cursor-pointer">
                              <Download className="h-3.5 w-3.5" /> Descargar
                            </button>
                          )}
                          <button
                            type="button"
                            aria-label={active ? `Cancelar ${job.label}` : `Eliminar ${job.label}`}
                            title={active ? 'Cancelar' : 'Eliminar'}
                            onClick={() => remove(job)}
                            className="rounded p-1.5 text-slate-400 hover:text-rose-500 cursor-pointer"
                          >
                            {active ? <X className="h-4 w-4" /> : <Trash2 className="h-4 w-4" />}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
