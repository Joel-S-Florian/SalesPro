import React from 'react';
import { Lock } from 'lucide-react';
import { FEATURES, planName } from '@factos/shared/plans.js';

/** Pantalla de una función que el plan actual no incluye. */
export default function PlanLocked({ feature, requiredPlan, onViewPlans }) {
  return (
    <div className="mx-auto max-w-lg rounded-2xl border border-slate-100 bg-white p-8 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <span className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-indigo-50 text-indigo-600 dark:bg-indigo-950/40">
        <Lock className="h-5 w-5" />
      </span>
      <h3 className="font-semibold text-slate-800 dark:text-slate-100">{FEATURES[feature]?.label || 'Esta función'}</h3>
      <p className="mt-1 text-sm text-slate-500">
        Está disponible desde el plan {planName(requiredPlan)}. Los planes de pago se activarán pronto; mientras tanto, escríbenos si la necesitas.
      </p>
      {onViewPlans && (
        <button type="button" onClick={onViewPlans} className="mt-4 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white cursor-pointer">
          Ver planes
        </button>
      )}
    </div>
  );
}
