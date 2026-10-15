import React, { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowLeft, ArrowRight, Check, Eye, EyeOff, Loader2 } from 'lucide-react';
import { api } from '../../services/api';
import { DocumentType, formatDocument, validateDocument } from '../../utils/documents';
import { MIN_PASSWORD_LENGTH, passwordProblem } from '../../utils/passwordPolicy';
import { Field, inputClass } from '../ui/form';
import SmartSelect from '../ui/SmartSelect';
import Logo from '../ui/Logo';

const STEPS = ['Plan', 'Tu cuenta', 'Tu negocio', 'Configuración', 'Confirmar'];

const PLANS = [
  { id: 'FREE', name: 'Gratis', price: 'RD$ 0', note: 'Durante la beta', available: true, features: ['Todas las funciones', 'Sin tarjeta de crédito', 'Sin fecha de vencimiento por ahora'] },
  { id: 'STARTER', name: 'Starter', price: 'RD$ 1,500', note: 'por mes', features: ['Hasta 500 ventas al mes'] },
  { id: 'BUSINESS', name: 'Business', price: 'RD$ 3,500', note: 'por mes', features: ['Hasta 5,000 ventas al mes'] },
  { id: 'PRO', name: 'Pro', price: 'RD$ 6,500', note: 'por mes', features: ['Ventas ilimitadas'] },
];

const BUSINESS_TYPES = ['Colmado o minimarket', 'Ferretería', 'Tienda de ropa o calzado', 'Farmacia o perfumería', 'Supermercado', 'Otro'];
const RECEIPT_OPTIONS = [
  ['A4', 'Carta (A4)', 'Factura completa en hoja'],
  ['TICKET', 'Ticket 80 mm', 'Para impresora térmica'],
  ['BOTH', 'Ambos', 'Genera los dos formatos'],
];

const passwordRules = (password, email) => [
  [`Al menos ${MIN_PASSWORD_LENGTH} caracteres`, password.length >= MIN_PASSWORD_LENGTH],
  ['Una letra', /[A-Za-z]/.test(password)],
  ['Un número', /\d/.test(password)],
  ['Que no sea común ni contenga tu correo', password.length > 0 && passwordProblem(password, { email }) === null],
];

/**
 * Registro autónomo: plan → cuenta → negocio → configuración → confirmar. Al terminar crea la empresa y
 * devuelve la sesión iniciada (`onDone`), así el usuario entra directo al sistema ya configurado.
 */
export default function SignupWizard({ onDone, onBackToLogin }) {
  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [plan, setPlan] = useState('FREE');
  const [account, setAccount] = useState({ fullName: '', email: '', password: '' });
  const [company, setCompany] = useState({ name: '', businessType: BUSINESS_TYPES[0], rnc: '', phone: '', address: '' });
  const [settings, setSettings] = useState({ taxPercent: '18', cash: true, card: true, receiptFormat: 'A4', terminalName: 'Caja 1' });

  const rules = useMemo(() => passwordRules(account.password, account.email), [account.password, account.email]);
  const methods = [settings.cash && 'EFECTIVO', settings.card && 'TARJETA'].filter(Boolean);

  const go = next => {
    setDirection(next > step ? 1 : -1);
    setError('');
    setStep(next);
  };

  // Valida el paso actual; devuelve el mensaje de error o '' si todo está bien
  const validate = () => {
    if (step === 1) {
      if (!rules.every(([, ok]) => ok)) return 'La contraseña no cumple los requisitos.';
    }
    if (step === 2 && company.rnc && !validateDocument(DocumentType.RNC, company.rnc)) {
      return 'El RNC no es válido. Déjalo vacío si aún no lo tienes.';
    }
    if (step === 3) {
      const tax = Number(settings.taxPercent);
      if (Number.isNaN(tax) || tax < 0 || tax > 100) return 'El ITBIS debe estar entre 0 y 100.';
      if (methods.length === 0) return 'Elige al menos un método de pago.';
    }
    return '';
  };

  const next = event => {
    event.preventDefault();
    const problem = validate();
    if (problem) return setError(problem);
    if (step < STEPS.length - 1) return go(step + 1);
    return submit();
  };

  const submit = async () => {
    try {
      setBusy(true);
      setError('');
      const session = await api.public.signup({
        plan,
        account,
        company: { ...company, rnc: company.rnc || '' },
        settings: {
          taxRate: Number(settings.taxPercent) / 100,
          paymentMethods: methods,
          receiptFormat: settings.receiptFormat,
          terminalName: settings.terminalName.trim() || 'Caja 1',
        },
      });
      onDone(session);
    } catch (err) {
      setError(err.message || 'No se pudo crear la cuenta. Intenta de nuevo.');
      // Un correo repetido se corrige en el paso de la cuenta
      if (/correo/i.test(err.message || '')) setStep(1);
      else if (/RNC/.test(err.message || '')) setStep(2);
    } finally {
      setBusy(false);
    }
  };

  const input = (id, label, props = {}, set, value, extra = {}) => (
    <Field id={id} label={label} hint={extra.hint} className={extra.className}>
      <input
        id={id}
        value={value}
        onChange={e => set(e.target.value)}
        className={`${inputClass} ${extra.mono ? 'font-mono' : ''}`}
        {...props}
      />
    </Field>
  );

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden p-4" id="signup-screen">
      <div className="pointer-events-none absolute inset-0 -z-0 bg-[#f4f6fa] dark:bg-[#090d16]" aria-hidden="true">
        <div className="absolute -left-[10%] -top-[10%] h-[50%] w-[50%] rounded-full bg-indigo-200/40 blur-[120px] dark:bg-indigo-950/20" />
        <div className="absolute -bottom-[10%] -right-[10%] h-[60%] w-[60%] rounded-full bg-purple-200/30 blur-[120px] dark:bg-purple-950/15" />
      </div>

      <div className="relative z-10 w-full max-w-xl space-y-5">
        <div className="flex items-center justify-between">
          <Logo />
          <button type="button" onClick={onBackToLogin} className="text-sm font-medium text-slate-600 hover:text-indigo-600 dark:text-slate-300 cursor-pointer">
            Ya tengo cuenta
          </button>
        </div>

        <ol className="flex items-center gap-1.5" aria-label="Progreso del registro">
          {STEPS.map((label, i) => (
            <li key={label} className="flex flex-1 flex-col gap-1.5" aria-current={i === step ? 'step' : undefined}>
              <span className={`h-1 rounded-full transition-colors ${i <= step ? 'bg-indigo-600' : 'bg-slate-200 dark:bg-slate-800'}`} />
              <span className={`hidden text-[11px] font-medium sm:block ${i === step ? 'text-indigo-600' : 'text-slate-400'}`}>{label}</span>
            </li>
          ))}
        </ol>
        <p className="text-sm text-slate-500 sm:hidden">
          Paso {step + 1} de {STEPS.length}: <strong className="text-slate-700 dark:text-slate-200">{STEPS[step]}</strong>
        </p>

        <form onSubmit={next} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <AnimatePresence mode="wait" initial={false} custom={direction}>
            <motion.div
              key={step}
              custom={direction}
              initial={{ opacity: 0, x: direction * 16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: direction * -16, transition: { duration: 0.1 } }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              className="space-y-5 p-6 sm:p-8"
            >
              {step === 0 && (
                <>
                  <div>
                    <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">Elige tu plan</h1>
                    <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Empieza gratis. Los planes de pago se activarán más adelante.</p>
                  </div>
                  <div role="radiogroup" aria-label="Plan" className="grid gap-3 sm:grid-cols-2">
                    {PLANS.map(item => {
                      const selected = plan === item.id;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          role="radio"
                          aria-checked={selected}
                          disabled={!item.available}
                          onClick={() => setPlan(item.id)}
                          className={`relative rounded-xl border p-4 text-left ${
                            item.available
                              ? selected
                                ? 'border-indigo-600 bg-indigo-50/60 ring-1 ring-indigo-600 dark:bg-indigo-950/30'
                                : 'border-slate-200 hover:border-slate-300 dark:border-slate-700'
                              : 'cursor-not-allowed border-slate-200 opacity-55 dark:border-slate-800'
                          } ${item.available ? 'sm:col-span-2' : ''} cursor-pointer disabled:cursor-not-allowed`}
                        >
                          <div className="flex items-baseline justify-between gap-3">
                            <span className="text-base font-semibold text-slate-900 dark:text-white">{item.name}</span>
                            {item.available ? (
                              selected && <Check className="h-4 w-4 text-indigo-600" strokeWidth={3} />
                            ) : (
                              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500 dark:bg-slate-800">Próximamente</span>
                            )}
                          </div>
                          <p className="mt-1 text-xl font-semibold tabular-nums text-slate-900 dark:text-white">
                            {item.price} <span className="text-sm font-normal text-slate-500">{item.note}</span>
                          </p>
                          <ul className="mt-2 space-y-1 text-sm text-slate-600 dark:text-slate-300">
                            {item.features.map(feature => (
                              <li key={feature}>· {feature}</li>
                            ))}
                          </ul>
                        </button>
                      );
                    })}
                  </div>
                </>
              )}

              {step === 1 && (
                <>
                  <div>
                    <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">Crea tu cuenta</h1>
                    <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Serás el administrador de tu empresa. Tu correo es tu usuario de acceso.</p>
                  </div>
                  {input('su-name', 'Tu nombre completo', { required: true, autoComplete: 'name', autoFocus: true }, v => setAccount({ ...account, fullName: v }), account.fullName)}
                  {input('su-email', 'Correo electrónico', { required: true, type: 'email', autoComplete: 'email', spellCheck: false }, v => setAccount({ ...account, email: v }), account.email)}
                  <Field id="su-password" label="Contraseña">
                    <div className="relative">
                      <input
                        id="su-password"
                        type={showPassword ? 'text' : 'password'}
                        required
                        autoComplete="new-password"
                        value={account.password}
                        onChange={e => setAccount({ ...account, password: e.target.value })}
                        className={`${inputClass} pr-11`}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(v => !v)}
                        aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                        className="absolute right-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-slate-400 hover:text-slate-600 cursor-pointer"
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    <ul className="flex flex-wrap gap-x-4 gap-y-1 pt-1 text-xs">
                      {rules.map(([label, ok]) => (
                        <li key={label} className={ok ? 'text-emerald-600' : 'text-slate-400'}>
                          {ok ? '✓' : '○'} {label}
                        </li>
                      ))}
                    </ul>
                  </Field>
                </>
              )}

              {step === 2 && (
                <>
                  <div>
                    <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">Cuéntanos de tu negocio</h1>
                    <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Estos datos salen en tus facturas. Puedes cambiarlos después en Configuración.</p>
                  </div>
                  {input('su-company', 'Nombre comercial', { required: true, autoComplete: 'organization', autoFocus: true }, v => setCompany({ ...company, name: v }), company.name)}
                  <Field id="su-type" label="Tipo de negocio">
                    <SmartSelect id="su-type" value={company.businessType} onChange={e => setCompany({ ...company, businessType: e.target.value })} className={inputClass}>
                      {BUSINESS_TYPES.map(type => (
                        <option key={type}>{type}</option>
                      ))}
                    </SmartSelect>
                  </Field>
                  <div className="grid gap-4 sm:grid-cols-2">
                    {input('su-rnc', 'RNC (opcional)', { inputMode: 'numeric', maxLength: 11, placeholder: '000-00000-0' }, v => setCompany({ ...company, rnc: formatDocument(DocumentType.RNC, v) }), company.rnc, { mono: true })}
                    {input('su-phone', 'Teléfono (opcional)', { type: 'tel', autoComplete: 'tel' }, v => setCompany({ ...company, phone: v }), company.phone)}
                  </div>
                  {input('su-address', 'Dirección (opcional)', { autoComplete: 'street-address' }, v => setCompany({ ...company, address: v }), company.address)}
                </>
              )}

              {step === 3 && (
                <>
                  <div>
                    <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">Configura tu punto de venta</h1>
                    <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Valores iniciales; todos se pueden ajustar luego.</p>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    {input('su-tax', 'ITBIS (%)', { type: 'number', min: 0, max: 100, step: '0.01', inputMode: 'decimal', required: true }, v => setSettings({ ...settings, taxPercent: v }), settings.taxPercent)}
                    {input('su-terminal', 'Nombre de tu primera caja', { required: true, maxLength: 60 }, v => setSettings({ ...settings, terminalName: v }), settings.terminalName)}
                  </div>
                  <fieldset className="space-y-2">
                    <legend className="text-[13px] font-medium text-slate-600 dark:text-slate-400">Métodos de pago que aceptas</legend>
                    <div className="flex gap-5">
                      {[['cash', 'Efectivo'], ['card', 'Tarjeta']].map(([key, label]) => (
                        <label key={key} className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200 cursor-pointer">
                          <input type="checkbox" checked={settings[key]} onChange={e => setSettings({ ...settings, [key]: e.target.checked })} />
                          {label}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                  <fieldset className="space-y-2">
                    <legend className="text-[13px] font-medium text-slate-600 dark:text-slate-400">Formato de tus facturas</legend>
                    <div className="grid gap-2 sm:grid-cols-3">
                      {RECEIPT_OPTIONS.map(([value, label, hint]) => (
                        <label
                          key={value}
                          className={`cursor-pointer rounded-xl border p-3 text-sm ${
                            settings.receiptFormat === value ? 'border-indigo-600 bg-indigo-50/60 ring-1 ring-indigo-600 dark:bg-indigo-950/30' : 'border-slate-200 dark:border-slate-700'
                          }`}
                        >
                          <input type="radio" name="receipt" value={value} checked={settings.receiptFormat === value} onChange={() => setSettings({ ...settings, receiptFormat: value })} className="sr-only" />
                          <span className="block font-medium text-slate-900 dark:text-white">{label}</span>
                          <span className="block text-xs text-slate-500">{hint}</span>
                        </label>
                      ))}
                    </div>
                  </fieldset>
                </>
              )}

              {step === 4 && (
                <>
                  <div>
                    <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">Todo listo para crear tu cuenta</h1>
                    <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Revisa y entra. Tendrás tu negocio configurado y podrás vender desde el primer minuto.</p>
                  </div>
                  <dl className="divide-y divide-slate-100 rounded-xl border border-slate-200 text-sm dark:divide-slate-800 dark:border-slate-700">
                    {[
                      ['Plan', PLANS.find(p => p.id === plan)?.name],
                      ['Administrador', `${account.fullName} · ${account.email}`],
                      ['Negocio', `${company.name} (${company.businessType})`],
                      ['ITBIS', `${settings.taxPercent}%`],
                      ['Pagos', methods.map(m => (m === 'EFECTIVO' ? 'Efectivo' : 'Tarjeta')).join(' y ')],
                      ['Primera caja', settings.terminalName || 'Caja 1'],
                    ].map(([label, value]) => (
                      <div key={label} className="flex justify-between gap-4 px-4 py-2.5">
                        <dt className="text-slate-500">{label}</dt>
                        <dd className="text-right font-medium text-slate-900 dark:text-white">{value}</dd>
                      </div>
                    ))}
                  </dl>
                </>
              )}

              {error && (
                <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300">
                  {error}
                </p>
              )}
            </motion.div>
          </AnimatePresence>

          <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/60 px-6 py-4 dark:border-slate-800 dark:bg-slate-900/60 sm:px-8">
            <button
              type="button"
              onClick={() => go(step - 1)}
              disabled={step === 0 || busy}
              className="inline-flex h-10 items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:invisible dark:text-slate-300 dark:hover:bg-slate-800 cursor-pointer"
            >
              <ArrowLeft className="h-4 w-4" /> Atrás
            </button>
            <button
              type="submit"
              disabled={busy}
              className="inline-flex h-11 items-center gap-2 rounded-xl bg-indigo-600 px-5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60 cursor-pointer"
            >
              {busy ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Creando tu cuenta…
                </>
              ) : step === STEPS.length - 1 ? (
                <>Crear cuenta y entrar</>
              ) : (
                <>
                  Continuar <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </div>
        </form>

        <p className="text-center text-xs text-slate-500">Al crear tu cuenta aceptas usar FACTOS de forma legítima para tu negocio.</p>
      </div>
    </div>
  );
}
