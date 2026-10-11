import React, { useCallback, useEffect, useState } from 'react';
import { Download, Loader2, RefreshCw } from 'lucide-react';
import { api } from '../../services/api';
import { useAuthStore } from '../../stores/authStore';
import { dateTime } from '../../utils/format';
import { notify } from '../../utils/notify';
import EcfStatusBadge from './EcfStatusBadge';

const TYPE_LABELS = { E31: 'Factura de crédito fiscal electrónica', E32: 'Factura de consumo electrónica', E34: 'Nota de crédito electrónica' };

/** Detalle del comprobante electrónico de una venta (en el detalle de la venta). Reintentar y bajar el XML: solo administradores. */
export default function SaleEcfPanel({ sale }) {
  const isAdmin = useAuthStore(state => state.user?.role === 'ADMINISTRADOR');
  const [detail, setDetail] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setDetail(await api.ecf.saleDetail(sale.id));
    } catch {
      setDetail(null);
    }
  }, [sale.id]);

  useEffect(() => {
    if (isAdmin && sale.eNcf) load();
  }, [isAdmin, sale.eNcf, load]);

  if (!sale.eNcf) return null;
  const status = detail?.sale?.ecfStatus || sale.ecfStatus;
  const docs = detail?.documents || [];
  const main = docs.find(d => d.kind === 'RFCE') || docs.find(d => d.kind === 'ECF');
  const delivery = docs.find(d => d.kind === 'DELIVERY');
  const approval = docs.find(d => d.kind === 'ACECF');
  const retryable = main && ['ERROR', 'CONTINGENCY', 'PENDING'].includes(main.status);

  const retry = async () => {
    try {
      setBusy(true);
      await api.ecf.retry(sale.id);
      notify.info('Reintentando el envío a la DGII…');
      setTimeout(load, 2500);
    } catch (err) {
      notify.error(err.message || 'No se pudo reintentar');
    } finally {
      setBusy(false);
    }
  };

  const download = async () => {
    try {
      const blob = await api.ecf.downloadXml(sale.id);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${sale.eNcf}.xml`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      notify.error(err.message || 'No se pudo descargar el XML');
    }
  };

  return (
    <section className="space-y-3 rounded-xl border border-slate-200 p-4 dark:border-slate-700" aria-label="Comprobante electrónico">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-sm font-bold text-slate-800 dark:text-slate-100">Comprobante electrónico</h4>
        <EcfStatusBadge status={status} />
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
        <div><dt className="text-slate-400">Tipo</dt><dd className="font-medium text-slate-700 dark:text-slate-200">{TYPE_LABELS[sale.ecfType] || sale.ecfType}</dd></div>
        <div><dt className="text-slate-400">e-NCF</dt><dd className="font-mono font-medium text-slate-700 dark:text-slate-200">{sale.eNcf}</dd></div>
        <div><dt className="text-slate-400">Código de seguridad</dt><dd className="font-mono text-slate-700 dark:text-slate-200">{sale.ecfSecurityCode}</dd></div>
        <div><dt className="text-slate-400">Firmado</dt><dd className="text-slate-700 dark:text-slate-200">{dateTime(sale.ecfSignedAt)}</dd></div>
        {(detail?.sale?.ecfTrackId || sale.ecfTrackId) && (
          <div className="col-span-2"><dt className="text-slate-400">TrackId (DGII)</dt><dd className="break-all font-mono text-slate-600 dark:text-slate-300">{detail?.sale?.ecfTrackId || sale.ecfTrackId}</dd></div>
        )}
      </dl>

      {delivery && (
        <p className="flex flex-wrap items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
          Entrega al comprador (emisor electrónico): <EcfStatusBadge status={delivery.status} />
          {delivery.lastError && <span className="text-rose-600">{delivery.lastError}</span>}
        </p>
      )}
      {approval && (
        <p className={`text-xs ${approval.status === 'ACCEPTED' ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-600'}`}>
          Aprobación comercial del cliente: {approval.status === 'ACCEPTED' ? 'aprobada' : `rechazada${approval.lastError ? ` (${approval.lastError})` : ''}`}.
        </p>
      )}
      {main?.lastError && (
        <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:bg-rose-950/30 dark:text-rose-300">
          {main.status === 'REJECTED' ? 'Motivo del rechazo: ' : 'Último error: '}
          {main.lastError}
        </p>
      )}
      {main?.messages?.length > 0 && !main.lastError && (
        <ul className="list-disc space-y-0.5 pl-4 text-xs text-slate-500">
          {main.messages.map((message, index) => <li key={index}>{message}</li>)}
        </ul>
      )}
      {main?.status === 'ERROR' && main.nextAttemptAt && <p className="text-xs text-slate-500">Próximo intento automático: {dateTime(main.nextAttemptAt)}.</p>}

      {isAdmin && (
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" onClick={download} className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
            <Download className="h-3.5 w-3.5" /> XML firmado
          </button>
          {retryable && (
            <button type="button" onClick={retry} disabled={busy} className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg bg-indigo-600 px-3 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-60">
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Reintentar envío
            </button>
          )}
        </div>
      )}
    </section>
  );
}
