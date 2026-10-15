import React from 'react';
import { FileText } from 'lucide-react';
import { METHOD_LABELS } from '../../utils/subscriptionReceiptPdf';

const money = (value, currency) => `${currency === 'DOP' ? 'RD$' : currency} ${Number(value || 0).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const day = value => (value ? new Date(value).toLocaleDateString('es-DO', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');

/**
 * Tabla del historial de pagos de la suscripción. La usan el administrador de la empresa (solo lectura) y el SUPERADMIN
 * (que además puede anular con `onVoid`). `onReceipt(payment)` abre el recibo imprimible.
 */
export default function PaymentHistory({ payments, onReceipt, onVoid }) {
  if (!payments?.length) return <p className="py-4 text-center text-xs text-slate-400">Todavía no hay pagos registrados.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-xs">
        <thead className="text-slate-400 uppercase">
          <tr>
            <th className="px-2 py-2">Recibo</th>
            <th className="px-2 py-2">Plan</th>
            <th className="px-2 py-2">Período</th>
            <th className="px-2 py-2">Método</th>
            <th className="px-2 py-2 text-right">Monto</th>
            <th className="px-2 py-2 text-right">Acciones</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
          {payments.map(p => (
            <tr key={p.id} className={p.status === 'VOIDED' ? 'text-slate-400 line-through' : ''}>
              <td className="whitespace-nowrap px-2 py-2 font-mono">
                {p.receiptCode}
                {p.status === 'VOIDED' && <span className="ml-1 text-[10px] font-semibold text-rose-500 no-underline">ANULADO</span>}
              </td>
              <td className="px-2 py-2">{p.planName}</td>
              <td className="px-2 py-2">{day(p.periodStart)} al {day(p.periodEnd)}</td>
              <td className="px-2 py-2">
                {METHOD_LABELS[p.method] || p.method}
                {p.reference && <span className="block text-[11px] text-slate-400">{p.reference}</span>}
              </td>
              <td className="whitespace-nowrap px-2 py-2 text-right font-medium">{money(p.amount, p.currency)}</td>
              <td className="whitespace-nowrap px-2 py-2">
                <div className="flex justify-end gap-1">
                  <button type="button" onClick={() => onReceipt(p)} title="Recibo imprimible" aria-label={`Recibo ${p.receiptCode}`} className="flex items-center gap-1 rounded-lg bg-slate-100 px-2 py-1 font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200 cursor-pointer">
                    <FileText className="h-3.5 w-3.5" /> Recibo
                  </button>
                  {onVoid && p.status === 'PAID' && (
                    <button type="button" onClick={() => onVoid(p)} className="rounded-lg px-2 py-1 font-semibold text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 cursor-pointer">
                      Anular
                    </button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
