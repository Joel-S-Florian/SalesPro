import React, { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, CreditCard, Loader2 } from 'lucide-react';
import Modal from '../Modal';
import SmartSelect from '../ui/SmartSelect';
import { api } from '../../services/api';
import { notify } from '../../utils/notify';

const money = value => `RD$ ${Number(value || 0).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const inputClass =
  'w-full px-3.5 py-2 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-800 dark:text-slate-100 bg-transparent focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-sm font-mono';
const BRANDS = ['VISA', 'MASTERCARD', 'AMEX', 'OTRA'];

/**
 * Cobro con tarjeta antes de registrar la venta.
 * - provider MANUAL: el cajero cobra en su terminal y captura aprobación + últimos 4 dígitos del voucher.
 * - provider SIMULATOR / AZUL (interactivo): el sistema envía el monto al terminal y espera la respuesta.
 * `onApproved(payment)` entrega el cobro aprobado; `onCancel()` vuelve al carrito sin cobrar.
 */
export default function CardPaymentModal({ isOpen, amount, provider, terminalId, onApproved, onCancel }) {
  const manual = provider === 'MANUAL';
  const [phase, setPhase] = useState('idle'); // idle | charging | declined | error
  const [message, setMessage] = useState('');
  const [form, setForm] = useState({ authCode: '', last4: '', brand: 'VISA' });

  useEffect(() => {
    if (isOpen) {
      setPhase('idle');
      setMessage('');
      setForm({ authCode: '', last4: '', brand: 'VISA' });
    }
  }, [isOpen]);

  const charge = async event => {
    event?.preventDefault();
    if (phase === 'charging') return;
    setPhase('charging');
    setMessage('');
    try {
      const payment = await api.payments.chargeCard({
        amount: Number(amount),
        ...(terminalId ? { terminalId } : {}),
        ...(manual ? { manual: { authCode: form.authCode, last4: form.last4, brand: form.brand } } : {}),
      });
      if (payment.status === 'APPROVED') {
        onApproved(payment);
        return;
      }
      setPhase(payment.status === 'DECLINED' ? 'declined' : 'error');
      setMessage(payment.message || (payment.status === 'DECLINED' ? 'La tarjeta fue rechazada' : 'No se pudo completar el cobro'));
    } catch (err) {
      setPhase('idle');
      notify.error(err.message || 'No se pudo cobrar con la tarjeta');
    }
  };

  const charging = phase === 'charging';

  return (
    <Modal isOpen={isOpen} onClose={charging ? undefined : onCancel} title="Cobro con tarjeta" maxWidth="sm">
      <form onSubmit={charge} className="space-y-4">
        <div className="rounded-xl bg-slate-50 p-4 text-center dark:bg-slate-800/50">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Monto a cobrar</p>
          <p className="mt-1 font-mono text-3xl font-bold tabular-nums text-slate-900 dark:text-white">{money(amount)}</p>
        </div>

        {phase === 'declined' || phase === 'error' ? (
          <div role="alert" className="flex gap-2 rounded-lg bg-rose-50 p-3 text-xs text-rose-700 dark:bg-rose-950/30 dark:text-rose-300">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="font-semibold">{phase === 'declined' ? 'Tarjeta rechazada' : 'No se pudo completar el cobro'}</p>
              <p>{message}</p>
              <p className="mt-1 text-[11px] opacity-80">Puede reintentar, usar otra tarjeta o cancelar y cobrar en efectivo.</p>
            </div>
          </div>
        ) : manual ? (
          <>
            <p className="text-xs leading-relaxed text-slate-500">Cobre en su terminal y escriba los datos del voucher.</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label htmlFor="card-auth" className="block text-xs font-semibold text-slate-600 dark:text-slate-400">Aprobación *</label>
                <input id="card-auth" required autoFocus autoComplete="off" maxLength={12} value={form.authCode} onChange={e => setForm({ ...form, authCode: e.target.value.toUpperCase() })} className={inputClass} placeholder="AB1234" />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="card-last4" className="block text-xs font-semibold text-slate-600 dark:text-slate-400">Últimos 4 dígitos *</label>
                <input id="card-last4" required inputMode="numeric" autoComplete="off" maxLength={4} pattern="\d{4}" value={form.last4} onChange={e => setForm({ ...form, last4: e.target.value.replace(/\D/g, '') })} className={inputClass} placeholder="1234" />
              </div>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="card-brand" className="block text-xs font-semibold text-slate-600 dark:text-slate-400">Marca</label>
              <SmartSelect id="card-brand" value={form.brand} onChange={e => setForm({ ...form, brand: e.target.value })} className={inputClass}>
                {BRANDS.map(brand => (
                  <option key={brand} value={brand}>{brand}</option>
                ))}
              </SmartSelect>
            </div>
          </>
        ) : (
          <p className="flex items-center justify-center gap-2 text-center text-xs leading-relaxed text-slate-500">
            <CreditCard className="h-4 w-4 shrink-0" />
            {charging ? 'Esperando la respuesta del terminal…' : 'Pulse «Cobrar» para enviar el monto al terminal; el cliente pasa o inserta su tarjeta.'}
          </p>
        )}

        <div className="flex gap-3 pt-1">
          <button type="button" onClick={onCancel} disabled={charging} className="w-full cursor-pointer rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 disabled:opacity-50 dark:border-slate-800 dark:text-slate-300">
            Cancelar
          </button>
          <button type="submit" disabled={charging} className="flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-lg bg-indigo-600 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:bg-indigo-400">
            {charging ? <><Loader2 className="h-4 w-4 animate-spin" /> Cobrando…</> : phase === 'declined' || phase === 'error' ? 'Reintentar' : manual ? <><CheckCircle2 className="h-4 w-4" /> Confirmar cobro</> : 'Cobrar'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
