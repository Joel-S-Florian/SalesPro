import React, { useCallback, useEffect, useState } from 'react';
import { api } from '../../services/api';
import { notify } from '../../utils/notify';
import SmartSelect from '../ui/SmartSelect';
import PaymentHistory from './PaymentHistory';
import { printSubscriptionReceipt } from '../../utils/subscriptionReceiptPdf';
import { PLANS } from '@factos/shared/plans.js';

const inputClass = 'w-full px-3 py-2 border border-slate-200 dark:border-slate-800 rounded-lg bg-transparent text-xs outline-none focus:ring-1 focus:ring-indigo-500';
const labelClass = 'block text-xs font-semibold text-slate-600 dark:text-slate-400';
const needsReference = method => ['TRANSFER', 'DEPOSIT'].includes(method);
// Monto de lista del plan por los meses elegidos (se puede cambiar: un descuento es válido)
const suggest = (plan, months) => String(Math.round((PLANS[plan]?.priceMonthlyDop || 0) * (Number(months) || 1)));

/**
 * Cobros de la suscripción de UNA empresa (solo SUPERADMIN): registra una transferencia ya recibida, que extiende el plan y la fecha
 * pagada; muestra el historial, anula pagos registrados por error e imprime recibos. El cobro con tarjeta (Azul) aún no está habilitado.
 */
export default function PaymentsPanel({ company, onChanged }) {
  const [payments, setPayments] = useState([]);
  const [form, setForm] = useState({ plan: 'STARTER', amount: suggest('STARTER', 1), method: 'TRANSFER', reference: '', months: '1', note: '' });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [voiding, setVoiding] = useState(null);
  const [reason, setReason] = useState('');

  const load = useCallback(async () => {
    try {
      setPayments((await api.platform.payments(company.id)).data || []);
    } catch (err) {
      setError(err.message || 'No se pudo cargar el historial de pagos');
    }
  }, [company.id]);
  useEffect(() => {
    load();
  }, [load]);

  const set = (key, value) => setForm(f => ({ ...f, [key]: value }));

  const submit = async e => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      const payment = await api.platform.recordPayment(company.id, {
        plan: form.plan,
        amount: Number(form.amount),
        method: form.method,
        months: Number(form.months),
        ...(form.reference.trim() ? { reference: form.reference.trim() } : {}),
        ...(form.note.trim() ? { note: form.note.trim() } : {}),
      });
      notify.success(`Pago registrado: recibo ${payment.receiptCode}`);
      setForm(f => ({ ...f, reference: '', note: '' }));
      await load();
      onChanged?.();
    } catch (err) {
      setError(err.details?.[0]?.message || err.message || 'No se pudo registrar el pago');
    } finally {
      setSaving(false);
    }
  };

  const confirmVoid = async e => {
    e.preventDefault();
    try {
      await api.platform.voidPayment(company.id, voiding.id, reason.trim());
      notify.success(`Pago ${voiding.receiptCode} anulado`);
      setVoiding(null);
      setReason('');
      await load();
      onChanged?.();
    } catch (err) {
      notify.error(err.details?.[0]?.message || err.message || 'No se pudo anular');
    }
  };

  const showReceipt = async p => {
    try {
      printSubscriptionReceipt(await api.platform.receipt(company.id, p.id));
    } catch (err) {
      notify.error(err.message || 'No se pudo abrir el recibo');
    }
  };

  return (
    <div className="space-y-3 border-t border-slate-100 pt-4 dark:border-slate-800">
      <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Pagos de la suscripción</h4>
      <p className="text-[11px] text-slate-400">Registra una transferencia o depósito ya recibido: fija el plan y extiende la fecha pagada (si ya venció, cuenta desde hoy). El cobro con tarjeta (Azul) todavía no está habilitado.</p>
      <form onSubmit={submit} className="grid gap-3 sm:grid-cols-3">
        <div>
          <label htmlFor="pay-plan" className={labelClass}>Plan</label>
          <SmartSelect id="pay-plan" value={form.plan} onChange={e => setForm(f => ({ ...f, plan: e.target.value, amount: suggest(e.target.value, f.months) }))} className={inputClass}>
            <option value="STARTER">{PLANS.STARTER.name}</option>
            <option value="BUSINESS">{PLANS.BUSINESS.name}</option>
          </SmartSelect>
        </div>
        <div>
          <label htmlFor="pay-months" className={labelClass}>Meses</label>
          <input id="pay-months" type="number" min="1" max="24" value={form.months} onChange={e => setForm(f => ({ ...f, months: e.target.value, amount: suggest(f.plan, e.target.value) }))} className={inputClass} />
        </div>
        <div>
          <label htmlFor="pay-amount" className={labelClass}>Monto (RD$)</label>
          <input id="pay-amount" type="number" min="1" step="0.01" value={form.amount} onChange={e => set('amount', e.target.value)} className={inputClass} required />
        </div>
        <div>
          <label htmlFor="pay-method" className={labelClass}>Método</label>
          <SmartSelect id="pay-method" value={form.method} onChange={e => set('method', e.target.value)} className={inputClass}>
            <option value="TRANSFER">Transferencia</option>
            <option value="DEPOSIT">Depósito</option>
            <option value="CASH">Efectivo</option>
            <option value="OTHER">Otro</option>
          </SmartSelect>
        </div>
        <div>
          <label htmlFor="pay-ref" className={labelClass}>Referencia {needsReference(form.method) ? '' : '(opcional)'}</label>
          <input id="pay-ref" value={form.reference} onChange={e => set('reference', e.target.value)} maxLength={80} placeholder="N.º de la transferencia" className={inputClass} required={needsReference(form.method)} />
        </div>
        <div>
          <label htmlFor="pay-note" className={labelClass}>Nota (opcional)</label>
          <input id="pay-note" value={form.note} onChange={e => set('note', e.target.value)} maxLength={300} className={inputClass} />
        </div>
        <div className="flex items-center justify-end gap-3 sm:col-span-3">
          {error && <p className="flex-1 text-xs text-rose-500">{error}</p>}
          <button type="submit" disabled={saving} className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white disabled:opacity-50 cursor-pointer">
            {saving ? 'Registrando...' : 'Registrar pago'}
          </button>
        </div>
      </form>

      {voiding && (
        <form onSubmit={confirmVoid} className="flex flex-wrap items-end gap-2 rounded-lg bg-rose-50 p-3 dark:bg-rose-950/20">
          <div className="min-w-48 flex-1">
            <label htmlFor="void-reason" className={labelClass}>Motivo para anular {voiding.receiptCode}</label>
            <input id="void-reason" value={reason} onChange={e => setReason(e.target.value)} minLength={3} maxLength={200} className={inputClass} required />
          </div>
          <button type="submit" className="rounded-lg bg-rose-600 px-3 py-2 text-xs font-semibold text-white cursor-pointer">Anular pago</button>
          <button type="button" onClick={() => setVoiding(null)} className="rounded-lg border border-slate-200 px-3 py-2 text-xs dark:border-slate-700 cursor-pointer">Cancelar</button>
        </form>
      )}

      <PaymentHistory
        payments={payments}
        onReceipt={showReceipt}
        onVoid={p => {
          setVoiding(p);
          setReason('');
        }}
      />
    </div>
  );
}
