import React, { useEffect } from 'react';
import { Store } from 'lucide-react';
import SmartSelect from '../ui/SmartSelect';
import { useBranches } from '../../hooks/queries';
import { useBranchStore } from '../../stores/branchStore';

/** Filtro de sucursal para las pantallas de reportes, ventas, cierres y finanzas (Todas o una). */
export function ReportBranchFilter() {
  const { data: branches = [] } = useBranches();
  const reportBranchId = useBranchStore(state => state.reportBranchId);
  const setReportBranch = useBranchStore(state => state.setReportBranch);
  if (branches.length < 2) return null;
  return (
    <div className="flex items-center gap-1.5" title="Filtra esta pantalla por sucursal">
      <Store className="h-4 w-4 text-emerald-500" aria-hidden="true" />
      <SmartSelect
        aria-label="Filtrar por sucursal"
        value={reportBranchId || ''}
        onChange={e => setReportBranch(e.target.value || null)}
        className="rounded-lg border border-slate-200 bg-transparent px-2.5 py-1 text-xs font-semibold text-slate-700 outline-none dark:border-slate-700 dark:text-slate-200"
      >
        <option value="">Todas las sucursales</option>
        {branches.map(b => (
          <option key={b.id} value={b.id}>{b.name}</option>
        ))}
      </SmartSelect>
    </div>
  );
}

/**
 * Sucursal de trabajo del administrador (inventario, compras, lotes, movimientos). Solo aparece cuando la empresa tiene
 * más de una sucursal activa. Al cambiarla, la página actual se vuelve a cargar con los datos de esa sucursal.
 */
export default function BranchSwitcher() {
  const { data: branches = [] } = useBranches();
  const activeBranchId = useBranchStore(state => state.activeBranchId);
  const setActiveBranch = useBranchStore(state => state.setActiveBranch);
  const current = branches.find(b => b.id === activeBranchId) || branches.find(b => b.isMain) || branches[0];

  // La sucursal guardada pudo desactivarse o borrarse: se vuelve a la Principal
  useEffect(() => {
    if (branches.length && activeBranchId && !branches.some(b => b.id === activeBranchId)) setActiveBranch(null);
  }, [branches, activeBranchId, setActiveBranch]);

  if (branches.length < 2) return null;
  return (
    <div className="flex items-center gap-1.5" title="Sucursal con la que trabajas: inventario, compras y lotes">
      <Store className="h-4 w-4 text-indigo-500" aria-hidden="true" />
      <SmartSelect
        aria-label="Sucursal de trabajo"
        value={current?.id || ''}
        onChange={e => setActiveBranch(e.target.value === branches.find(b => b.isMain)?.id ? null : e.target.value)}
        className="rounded-lg border border-slate-200 bg-transparent px-2.5 py-1 text-xs font-semibold text-slate-700 outline-none dark:border-slate-700 dark:text-slate-200"
      >
        {branches.map(b => (
          <option key={b.id} value={b.id}>{b.name}</option>
        ))}
      </SmartSelect>
    </div>
  );
}
