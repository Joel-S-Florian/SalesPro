import React from 'react';

const inputClass =
  'w-full px-3.5 py-2 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-800 dark:text-slate-100 bg-transparent focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-xs font-mono';
const labelClass = 'block text-xs font-semibold text-slate-600 dark:text-slate-400';

/** Lote y fecha de vencimiento: se piden al recibir mercancía de un producto perecedero. */
export default function BatchFields({ idPrefix, batchNumber, expirationDate, onChange }) {
  return (
    <div className="col-span-1 grid grid-cols-1 gap-3 rounded-lg border border-amber-200 bg-amber-50/50 p-3 dark:border-amber-900/50 dark:bg-amber-950/10 md:col-span-2 md:grid-cols-2">
      <p className="text-[11px] font-medium text-amber-700 dark:text-amber-300 md:col-span-2">
        Producto perecedero: registre el lote y su vencimiento. Si el lote ya existe, se suma a él.
      </p>
      <div className="space-y-1.5">
        <label htmlFor={`${idPrefix}-batch`} className={labelClass}>Número de lote *</label>
        <input
          id={`${idPrefix}-batch`}
          type="text"
          required
          maxLength={50}
          placeholder="Ej. L-2410"
          value={batchNumber}
          onChange={e => onChange({ batchNumber: e.target.value })}
          className={inputClass}
        />
      </div>
      <div className="space-y-1.5">
        <label htmlFor={`${idPrefix}-expiry`} className={labelClass}>Fecha de vencimiento *</label>
        <input
          id={`${idPrefix}-expiry`}
          type="date"
          required
          value={expirationDate}
          onChange={e => onChange({ expirationDate: e.target.value })}
          className={inputClass}
        />
      </div>
    </div>
  );
}
