import React, { useState } from 'react';
import { ChevronDown, Funnel, Hourglass, Rocket, Store, UserX } from 'lucide-react';
import { api } from '../services/api';
import { BarList, Kpi, Panel, ReportState, ReportTable, TrendChart, num, pctText, periodLabel, useReport } from '../pages/reports/shared';

const PLAN_LABELS = { FREE: 'Gratis', STARTER: 'Starter', BUSINESS: 'Business', PRO: 'Pro', ENTERPRISE: 'Enterprise' };

function Insights() {
  const report = useReport(() => api.platform.analytics(), {});
  return (
    <ReportState report={report}>
      {data => {
        const { summary, funnel } = data;
        return (
          <>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Kpi label="Empresas activas" value={num(summary.active)} icon={Store} tone="indigo" hint={`${summary.suspended} suspendidas`} />
              <Kpi label="Con ventas (30 d)" value={`${num(summary.withSales30)} de ${num(summary.active)}`} icon={Rocket} tone="emerald" hint="Las que realmente usan el sistema" />
              <Kpi label="Altas (30 d)" value={num(summary.signupsLast30)} icon={Funnel} tone="blue" />
              <Kpi label="Solicitudes" value={num(funnel.leads)} icon={Funnel} tone="amber" hint={`${funnel.new} nuevas · ${pctText(funnel.approvalRate)} aprobadas`} />
            </div>

            <div className="grid gap-4 lg:grid-cols-3">
              <Panel title="Altas por semana" subtitle="Últimas 12 semanas" className="lg:col-span-2">
                <TrendChart format={v => `${v} ${v === 1 ? 'empresa' : 'empresas'}`} data={data.signups.map(s => ({ label: periodLabel(s.week), value: s.count }))} ariaLabel="Altas por semana" />
              </Panel>
              <div className="space-y-4">
                <Panel title="Empresas por plan">
                  <BarList format={num} items={data.byPlan.map(p => ({ label: PLAN_LABELS[p.plan] || p.plan, value: p.count }))} />
                </Panel>
                <Panel title="Cómo llegan" subtitle="Registro propio vs. solicitud aprobada">
                  <BarList format={num} items={[{ label: 'Registro propio', value: funnel.selfSignup }, { label: 'Solicitudes aprobadas', value: funnel.approved }]} />
                </Panel>
              </div>
            </div>

            <ReportTable
              title="Empresas que más venden (30 días)"
              columns={[
                { key: 'name', label: 'Empresa', bold: true },
                { key: 'plan', label: 'Plan', render: r => PLAN_LABELS[r.plan] || r.plan, text: r => PLAN_LABELS[r.plan] || r.plan },
                { key: 'invoices', label: 'Facturas', type: 'number' },
                { key: 'total', label: 'Vendido', type: 'money', bold: true },
              ]}
              rows={data.topCompanies}
              name="plataforma_top_empresas"
              empty="Aún no hay ventas"
              rowKey={r => r.id}
            />

            <div className="grid gap-4 lg:grid-cols-2">
              <Panel title="Sin ventas todavía" subtitle="Activas con más de 7 días y 0 ventas en 30: candidatas a un mensaje de ayuda">
                {data.inactive.length === 0 ? (
                  <p className="py-4 text-center text-sm text-slate-400">Todas las empresas activas han vendido</p>
                ) : (
                  <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                    {data.inactive.map(c => (
                      <li key={c.id} className="flex items-center justify-between gap-3 py-2 text-xs">
                        <span className="flex items-center gap-2 font-medium text-slate-700 dark:text-slate-300"><UserX className="h-3.5 w-3.5 text-rose-400" /> {c.name}</span>
                        <span className="font-mono text-slate-400">{c.daysSinceSignup} días · {PLAN_LABELS[c.plan] || c.plan}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
              <Panel title="Pruebas por vencer" subtitle="En los próximos 7 días (o ya vencidas)">
                {data.trialsEnding.length === 0 ? (
                  <p className="py-4 text-center text-sm text-slate-400">No hay pruebas por vencer</p>
                ) : (
                  <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                    {data.trialsEnding.map(c => (
                      <li key={c.id} className="flex items-center justify-between gap-3 py-2 text-xs">
                        <span className="flex items-center gap-2 font-medium text-slate-700 dark:text-slate-300"><Hourglass className="h-3.5 w-3.5 text-amber-500" /> {c.name}</span>
                        <span className={`font-mono ${c.daysLeft < 0 ? 'text-rose-500' : 'text-slate-400'}`}>{c.daysLeft < 0 ? 'vencida' : `${c.daysLeft} d`} · {PLAN_LABELS[c.plan] || c.plan}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
            </div>
          </>
        );
      }}
    </ReportState>
  );
}

/** Métricas de la plataforma (solo SUPERADMIN): crecimiento, embudo y salud de las empresas. Se carga al abrir. */
export default function PlatformInsights() {
  const [open, setOpen] = useState(false);
  return (
    <section className="rounded-xl border border-slate-100 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(o => !o)}
        className="flex w-full cursor-pointer items-center justify-between gap-3 p-4 text-left"
      >
        <span>
          <span className="block font-semibold text-slate-800 dark:text-slate-100">Métricas de la plataforma</span>
          <span className="block text-xs text-slate-400">Crecimiento, solicitudes, planes y empresas que no están usando el sistema</span>
        </span>
        <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="border-t border-slate-100 p-4 dark:border-slate-800">
          <Insights />
        </div>
      )}
    </section>
  );
}
