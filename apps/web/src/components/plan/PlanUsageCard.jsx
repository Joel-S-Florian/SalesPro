import React from 'react';
import { Check, Lock, MessageCircle } from 'lucide-react';
import { FEATURES, PLANS, PLAN_IDS, RESOURCES, planFeatureLines, planName } from '@factos/shared/plans.js';
import { useContact, usePlanUsage } from '../../hooks/queries';

const STATUS_TEXT = {
  TRIAL: usage => `Prueba: ${usage.daysLeft === 1 ? 'queda 1 día' : `quedan ${usage.daysLeft} días`}`,
  PAID: usage => `Suscripción pagada: ${usage.daysLeft === 1 ? 'queda 1 día' : `quedan ${usage.daysLeft} días`}`,
  GRACE: usage => `Gracia: ${usage.graceDaysLeft === 1 ? 'queda 1 día' : `quedan ${usage.graceDaysLeft} días`}`,
  EXPIRED: () => 'Prueba terminada',
  ACTIVE: () => 'Activo',
};

const barTone = (level, exceeded) => (exceeded || level === 'FULL' ? 'bg-rose-500' : level === 'WARN' ? 'bg-amber-500' : 'bg-indigo-600');
const cardClass = 'rounded-xl border border-slate-100 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900';

/** Configuración → Plan y uso: plan actual, estado de la prueba, uso contra los límites y funciones por plan. */
export default function PlanUsageCard() {
  const { data: usage, isLoading, error, refetch } = usePlanUsage();
  const { data: contact } = useContact();
  if (isLoading) return <div className="h-40 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800/50" />;
  if (error || !usage) {
    return (
      <p className="text-xs text-rose-500">
        No se pudo cargar el plan.{' '}
        <button type="button" className="underline cursor-pointer" onClick={() => refetch()}>
          Reintentar
        </button>
      </p>
    );
  }

  return (
    <div className="space-y-4" id="plan-usage">
      <div className={`${cardClass} space-y-2`}>
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-semibold text-slate-800 dark:text-slate-100">Plan {usage.planName}</h3>
          <span className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-[11px] font-semibold text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300">{STATUS_TEXT[usage.status](usage)}</span>
          {usage.downgraded && <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-[11px] font-semibold text-amber-700">Se aplican los límites del plan {usage.effectivePlanName}</span>}
        </div>
        <p className="text-xs text-slate-500">
          Los planes de pago todavía no se cobran. Nunca se borran tus datos y puedes exportarlos en cualquier momento. Las ventas jamás se bloquean: el límite mensual es solo informativo.
        </p>
      </div>

      <div className={cardClass}>
        <h4 className="mb-3 text-sm font-semibold text-slate-800 dark:text-slate-100">Uso</h4>
        <div className="grid gap-4 md:grid-cols-2">
          {Object.entries(usage.usage).map(([resource, u]) => {
            const pct = u.limit ? Math.min(100, Math.round((u.current / u.limit) * 100)) : 0;
            const label = RESOURCES[resource].plural;
            return (
              <div key={resource} className="space-y-1">
                <div className="flex items-baseline justify-between text-xs">
                  <span className="font-medium capitalize text-slate-700 dark:text-slate-200">{label}</span>
                  <span className={u.exceeded ? 'font-semibold text-rose-600' : 'text-slate-500'}>
                    {u.current.toLocaleString('es-DO')} de {u.limit === null ? 'sin tope' : u.limit.toLocaleString('es-DO')}
                  </span>
                </div>
                {u.limit !== null && (
                  <div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={`Uso de ${label}`} className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                    <div className={`h-full rounded-full ${barTone(u.level, u.exceeded)}`} style={{ width: `${pct}%` }} />
                  </div>
                )}
                {resource === 'salesPerMonth' && <p className="text-[11px] text-slate-400">Informativo: nunca bloquea una venta.</p>}
                {resource === 'branches' && <p className="text-[11px] text-slate-400">El módulo de sucursales todavía no está disponible.</p>}
                {u.exceeded && resource !== 'salesPerMonth' && <p className="text-[11px] text-rose-500">Por encima del tope: no se desactivó nada, pero no podrás agregar más.</p>}
              </div>
            );
          })}
        </div>
      </div>

      <div className={cardClass}>
        <h4 className="mb-3 text-sm font-semibold text-slate-800 dark:text-slate-100">Funciones</h4>
        <ul className="grid gap-2 text-xs md:grid-cols-2">
          {Object.entries(FEATURES).map(([feature, { label }]) => {
            const f = usage.features[feature];
            return (
              <li key={feature} className="flex items-center gap-2">
                {f.allowed ? <Check className="h-4 w-4 text-emerald-500" /> : <Lock className="h-4 w-4 text-slate-400" />}
                <span className={f.allowed ? 'text-slate-700 dark:text-slate-200' : 'text-slate-400'}>{label}</span>
                {!f.allowed && <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold text-indigo-600 dark:bg-indigo-950/40">Disponible en {planName(f.requiredPlan)}</span>}
              </li>
            );
          })}
        </ul>
      </div>

      <div className={cardClass}>
        <h4 className="mb-1 text-sm font-semibold text-slate-800 dark:text-slate-100">Planes</h4>
        <p className="mb-3 text-[11px] text-slate-400">Precios provisionales (no se están cobrando). ¿Necesitas más? Escríbenos y armamos un plan a tu medida.
          {contact?.link && (
            <a href={contact.link} target="_blank" rel="noreferrer" className="ml-2 inline-flex items-center gap-1 font-semibold text-emerald-600 hover:underline">
              <MessageCircle className="h-3 w-3" /> Escribir por WhatsApp
            </a>
          )}
        </p>
        <div className="grid gap-3 md:grid-cols-3">
          {PLAN_IDS.map(id => (
            <div key={id} className={`rounded-lg border p-3 text-xs ${id === usage.plan ? 'border-indigo-400 bg-indigo-50/50 dark:bg-indigo-950/20' : 'border-slate-100 dark:border-slate-800'}`}>
              <p className="font-semibold text-slate-800 dark:text-slate-100">
                {PLANS[id].name} {id === usage.plan && <span className="ml-1 text-[10px] font-normal text-indigo-600">tu plan</span>}
              </p>
              <p className="mb-2 text-slate-500">RD$ {PLANS[id].priceMonthlyDop.toLocaleString('es-DO')} al mes</p>
              <ul className="space-y-1 text-slate-600 dark:text-slate-300">
                {planFeatureLines(id).map(line => (
                  <li key={line}>· {line}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
