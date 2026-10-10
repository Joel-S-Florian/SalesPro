import React from 'react';

/** Clases compartidas por los campos de formulario del POS (mismo radio, borde y foco en toda la app). */
export const inputClass =
  'w-full h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-800 dark:text-slate-100 placeholder:text-slate-400 outline-none disabled:opacity-50 disabled:cursor-not-allowed';

export const secondaryButtonClass =
  'h-10 px-4 rounded-lg border border-slate-200 dark:border-slate-700 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer';

export const primaryButtonClass =
  'h-10 px-4 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-sm font-semibold text-white disabled:opacity-50 cursor-pointer';

/** Etiqueta + control + pista/ error, enlazados por id. */
export function Field({ id, label, hint, className = '', children }) {
  return (
    <div className={`space-y-1.5 ${className}`}>
      <label htmlFor={id} className="block text-[13px] font-medium text-slate-600 dark:text-slate-400">
        {label}
      </label>
      {children}
      {hint && <p className="text-xs text-slate-500 dark:text-slate-400">{hint}</p>}
    </div>
  );
}
