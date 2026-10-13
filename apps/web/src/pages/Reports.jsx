import React, { useEffect, useMemo, useState } from 'react';
import {
  BarChart3, Boxes, CalendarClock, CalendarRange, Scale, Crown, Landmark, LayoutDashboard, Package, Receipt, Truck, UserCheck, Users, Wallet, TrendingUp,
} from 'lucide-react';
import { CustomersArea, CashArea } from './reports/PeopleAreas';
import { FiscalArea, Overview, ProfitArea, SalesArea } from './reports/SalesAreas';
import { InventoryArea, PurchasesArea } from './reports/StockAreas';
import { BulkArea, ExpiryArea } from './reports/FoodAreas';
import { useConfigStore } from '../stores/configStore';
import LegacyReports from './reports/LegacyReports';
import { PRESETS, presetRange, periodText } from './reports/shared';
import SmartSelect from '../components/ui/SmartSelect';

const AREAS = [
  { id: 'OVERVIEW', label: 'Resumen', icon: LayoutDashboard, hint: 'Cómo va el negocio frente al período anterior' },
  { id: 'SALES', label: 'Ventas', icon: Receipt, hint: 'Ventas por período, pago, comprobante y caja' },
  { id: 'PROFIT', label: 'Rentabilidad', icon: TrendingUp, hint: 'Cuánto ganas por producto y categoría' },
  { id: 'INVENTORY', label: 'Inventario', icon: Boxes, hint: 'Valor, reposición y productos sin movimiento' },
  { id: 'EXPIRY', label: 'Vencimientos', icon: CalendarClock, hint: 'Lotes por vencer, mermas y descuentos por vencimiento', needsPerishable: true },
  { id: 'BULK', label: 'Granel y presentaciones', icon: Scale, hint: 'Ventas por peso, paquetes y cajas' },
  { id: 'PURCHASES', label: 'Compras', icon: Truck, hint: 'Qué compras, a quién y a qué costo' },
  { id: 'CASH', label: 'Cajas', icon: Wallet, hint: 'Cierres de caja y diferencias por cajero' },
  { id: 'FISCAL', label: 'Fiscal', icon: Landmark, hint: 'ITBIS y comprobantes emitidos' },
  { id: 'CUSTOMERS', label: 'Clientes', icon: Users, hint: 'Nuevos, recurrentes e inactivos' },
  { id: 'PRODUCTS', label: 'Productos', icon: Package, hint: 'Más vendidos, más rentables y por categoría' },
  { id: 'TOPS', label: 'Mejores clientes', icon: Crown, hint: 'Ranking por monto o frecuencia' },
  { id: 'STAFF', label: 'Personal', icon: UserCheck, hint: 'Rendimiento por caja y horas pico' },
];

const STORE_KEY = 'factos-reports-view';

function readStored() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORE_KEY) || '{}');
    return {
      area: AREAS.some(a => a.id === stored.area) ? stored.area : 'OVERVIEW',
      preset: PRESETS.some(p => p.id === stored.preset) ? stored.preset : 'month',
    };
  } catch {
    return { area: 'OVERVIEW', preset: 'month' };
  }
}

const dateInput =
  'h-9 rounded-lg border border-slate-200 bg-transparent px-3 text-xs text-slate-700 outline-none focus:ring-1 focus:ring-indigo-500 dark:border-slate-700 dark:text-slate-300';

export default function Reports() {
  const [{ area, preset }, setView] = useState(readStored);
  const [custom, setCustom] = useState(() => presetRange('month'));
  const perishableEnabled = useConfigStore(state => state.config.perishable?.enabled);
  // Vencimientos solo aparece si la empresa activó perecederos (si ya estaba abierto, se mantiene)
  const areas = AREAS.filter(a => !a.needsPerishable || perishableEnabled || a.id === area);

  useEffect(() => {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({ area, preset }));
    } catch {
      // almacenamiento no disponible
    }
  }, [area, preset]);

  const range = useMemo(() => (preset === 'custom' ? custom : presetRange(preset)), [preset, custom]);
  const validRange = range.from && range.to && range.from <= range.to;
  const active = AREAS.find(a => a.id === area);

  const renderArea = () => {
    if (!validRange) {
      return <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-center text-sm text-amber-700">Elige un rango de fechas válido (la fecha inicial no puede ser mayor que la final).</p>;
    }
    switch (area) {
      case 'OVERVIEW':
        return <Overview range={range} />;
      case 'SALES':
        return <SalesArea range={range} />;
      case 'PROFIT':
        return <ProfitArea range={range} />;
      case 'INVENTORY':
        return <InventoryArea range={range} />;
      case 'EXPIRY':
        return <ExpiryArea range={range} />;
      case 'BULK':
        return <BulkArea range={range} />;
      case 'PURCHASES':
        return <PurchasesArea range={range} />;
      case 'CASH':
        return <CashArea range={range} />;
      case 'FISCAL':
        return <FiscalArea range={range} />;
      case 'CUSTOMERS':
        return <CustomersArea range={range} />;
      case 'PRODUCTS':
        return <LegacyReports tab="PRODUCTS" range={range} />;
      case 'TOPS':
        return <LegacyReports tab="CUSTOMERS" range={range} />;
      default:
        return <LegacyReports tab="STAFF" range={range} />;
    }
  };

  return (
    <div className="space-y-5" id="reports-view">
      <div className="flex flex-col gap-4 border-b border-slate-100 pb-5 dark:border-slate-800 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="flex items-center gap-2 font-sans text-2xl font-bold tracking-tight text-slate-800 dark:text-slate-100">
            <BarChart3 className="h-6 w-6 text-indigo-500" /> Reportes
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">{active.hint}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Período del reporte">
          <CalendarRange className="h-4 w-4 text-indigo-500" aria-hidden="true" />
          <SmartSelect
            aria-label="Período"
            value={preset}
            onChange={e => setView(v => ({ ...v, preset: e.target.value }))}
            className={dateInput}
          >
            {PRESETS.map(p => (
              <option key={p.id} value={p.id} className="dark:bg-slate-950">{p.label}</option>
            ))}
          </SmartSelect>
          {preset === 'custom' && (
            <>
              <input type="date" aria-label="Desde" value={custom.from} max={custom.to || undefined} onChange={e => setCustom(c => ({ ...c, from: e.target.value }))} className={dateInput} />
              <input type="date" aria-label="Hasta" value={custom.to} min={custom.from || undefined} onChange={e => setCustom(c => ({ ...c, to: e.target.value }))} className={dateInput} />
            </>
          )}
          {validRange && <span className="font-mono text-[11px] text-slate-400">{periodText(range)}</span>}
        </div>
      </div>

      <div role="tablist" aria-label="Áreas de reportes" className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
        {areas.map(a => {
          const selected = a.id === area;
          return (
            <button
              key={a.id}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => setView(v => ({ ...v, area: a.id }))}
              className={`inline-flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg px-3 text-[13px] font-semibold transition active:scale-[0.97] ${
                selected
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200'
              }`}
            >
              <a.icon className="h-4 w-4" aria-hidden="true" /> {a.label}
            </button>
          );
        })}
      </div>

      <div role="tabpanel" key={area}>
        {renderArea()}
      </div>
    </div>
  );
}
