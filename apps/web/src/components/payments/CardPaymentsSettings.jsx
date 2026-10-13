import React, { useEffect, useState } from 'react';
import { CreditCard, Loader2, Save } from 'lucide-react';
import { api } from '../../services/api';
import { notify } from '../../utils/notify';
import SmartSelect from '../ui/SmartSelect';

const cardClass = 'bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-xl p-5 shadow-sm space-y-4';
const inputClass =
  'w-full px-3.5 py-2 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-800 dark:text-slate-100 bg-transparent focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-xs';
const labelClass = 'block text-xs font-semibold text-slate-600 dark:text-slate-400';

const HINTS = {
  NONE: 'Al cobrar con tarjeta solo se marca el método de pago, como hasta ahora. No se pide ningún dato de la tarjeta.',
  MANUAL: 'El cajero cobra en su terminal independiente y escribe el código de aprobación y los últimos 4 dígitos del voucher. Queda registrado en la venta y en el cierre de caja.',
  SIMULATOR: 'Para probar el flujo sin tarjeta real: aprueba normalmente; un monto con centavos .13 se rechaza y con .99 simula un fallo del terminal.',
  AZUL: 'Integración con Azul (Banco Popular). Aún no está habilitada: falta el contrato, las credenciales y la documentación técnica del procesador.',
};

/** Configuración → Pagos con tarjeta (solo administradores). La clave del procesador nunca vuelve al navegador. */
export default function CardPaymentsSettings() {
  const [config, setConfig] = useState(null);
  const [form, setForm] = useState({ provider: 'NONE', mode: 'TEST', merchantId: '', terminalCode: '', secret: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.payments
      .cardConfig()
      .then(data => {
        setConfig(data);
        setForm({ provider: data.provider, mode: data.mode, merchantId: data.merchantId || '', terminalCode: data.terminalCode || '', secret: '' });
      })
      .catch(() => setConfig(false));
  }, []);

  if (config === null) return null;
  if (config === false) return null;

  const set = patch => setForm(prev => ({ ...prev, ...patch }));
  const selected = (config.providers || []).find(p => p.id === form.provider);

  const save = async event => {
    event.preventDefault();
    try {
      setSaving(true);
      const saved = await api.payments.saveCardConfig({
        provider: form.provider,
        mode: form.mode,
        merchantId: form.merchantId,
        terminalCode: form.terminalCode,
        ...(form.secret ? { secret: form.secret } : {}),
      });
      setConfig(saved);
      set({ secret: '' });
      notify.success('Pagos con tarjeta guardados');
    } catch (err) {
      notify.error(err.message || 'No se pudo guardar');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={save} className={cardClass} id="card-payments-settings">
      <h4 className="flex items-center gap-2 text-sm font-semibold text-slate-800 dark:text-slate-100">
        <CreditCard className="h-4 w-4" /> Pagos con tarjeta
      </h4>
      <p className="text-xs text-slate-400">Cómo se cobra cuando el cajero elige «Tarjeta» en el POS. Cada cobro aprobado queda ligado a su venta.</p>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="space-y-1.5">
          <label htmlFor="card-provider" className={labelClass}>Modo de cobro</label>
          <SmartSelect id="card-provider" value={form.provider} onChange={e => set({ provider: e.target.value })} className={inputClass}>
            {(config.providers || []).map(provider => (
              <option key={provider.id} value={provider.id} disabled={!provider.available}>
                {provider.label}
              </option>
            ))}
          </SmartSelect>
        </div>
        {form.provider === 'AZUL' || selected?.id === 'AZUL' ? (
          <div className="space-y-1.5">
            <label htmlFor="card-mode" className={labelClass}>Ambiente</label>
            <SmartSelect id="card-mode" value={form.mode} onChange={e => set({ mode: e.target.value })} className={inputClass}>
              <option value="TEST">Pruebas</option>
              <option value="PROD">Producción</option>
            </SmartSelect>
          </div>
        ) : null}
      </div>
      <p className="rounded-lg bg-slate-50 p-3 text-xs leading-relaxed text-slate-500 dark:bg-slate-800/50">{HINTS[form.provider]}</p>

      <fieldset disabled className="grid grid-cols-1 gap-4 border-t border-slate-100 pt-4 opacity-60 dark:border-slate-800 md:grid-cols-3">
        <legend className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Credenciales del procesador (Azul, próximamente)</legend>
        <div className="space-y-1.5">
          <label htmlFor="card-merchant" className={labelClass}>Comercio</label>
          <input id="card-merchant" value={form.merchantId} onChange={e => set({ merchantId: e.target.value })} className={inputClass} placeholder="Número de comercio" />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="card-terminal" className={labelClass}>Terminal</label>
          <input id="card-terminal" value={form.terminalCode} onChange={e => set({ terminalCode: e.target.value })} className={inputClass} placeholder="Código de terminal" />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="card-secret" className={labelClass}>Clave {config.hasSecret ? '(guardada)' : ''}</label>
          <input id="card-secret" type="password" autoComplete="new-password" value={form.secret} onChange={e => set({ secret: e.target.value })} className={inputClass} placeholder={config.hasSecret ? '••••••••' : 'Clave del comercio'} />
        </div>
      </fieldset>

      <button type="submit" disabled={saving} className="flex cursor-pointer items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50">
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Guardar pagos con tarjeta
      </button>
    </form>
  );
}
