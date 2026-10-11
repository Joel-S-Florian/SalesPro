import React, { useState } from 'react';
import { CircleCheck, Clock, Scale, TrendingDown, TrendingUp, UserMinus, UserPlus, Users } from 'lucide-react';
import { api } from '../../services/api';
import { dateTime, money } from '../../utils/format';
import { BarList, Callout, Kpi, Panel, ReportState, ReportTable, num, shortDate, useReport } from './shared';

const selectClass =
  'h-9 rounded-lg border border-slate-200 bg-transparent px-3 text-xs text-slate-700 outline-none focus:ring-1 focus:ring-indigo-500 dark:border-slate-700 dark:text-slate-300';

/** Diferencia de caja: faltante en rojo, sobrante en ámbar, exacto en verde. */
function Difference({ value }) {
  if (value === null || value === undefined) return <span className="text-slate-400">—</span>;
  if (Math.abs(value) < 0.005) return <span className="font-semibold text-emerald-600 dark:text-emerald-400">Exacto</span>;
  return (
    <span className={`font-semibold ${value < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-amber-600 dark:text-amber-400'}`}>
      {value < 0 ? 'Falta ' : 'Sobra '}
      {money(Math.abs(value))}
    </span>
  );
}

const diffText = r => (r.difference === null ? '' : Math.abs(r.difference) < 0.005 ? 'Exacto' : `${r.difference < 0 ? 'Falta' : 'Sobra'} ${money(Math.abs(r.difference))}`);

/* ----------------------------- G. Cajas ----------------------------- */

export function CashArea({ range }) {
  const report = useReport(api.reports.cash, range);
  return (
    <ReportState report={report}>
      {data => {
        const { summary } = data;
        const groupColumns = label => [
          { key: 'name', label, bold: true },
          { key: 'closes', label: 'Cierres', type: 'number' },
          { key: 'exact', label: 'Exactos', type: 'number' },
          { key: 'shortages', label: 'Con faltante', type: 'number' },
          { key: 'overages', label: 'Con sobrante', type: 'number' },
          { key: 'difference', label: 'Diferencia neta', type: 'money', bold: true },
        ];
        const closeColumns = [
          { key: 'openedAt', label: 'Apertura', render: r => dateTime(r.openedAt), text: r => dateTime(r.openedAt) },
          { key: 'terminal', label: 'Caja', bold: true },
          { key: 'cashier', label: 'Cajero' },
          { key: 'openingBalance', label: 'Fondo inicial', type: 'money' },
          { key: 'expectedCash', label: 'Esperado', type: 'money' },
          { key: 'declaredCash', label: 'Contado', type: 'money' },
          { key: 'difference', label: 'Diferencia', align: 'right', render: r => <Difference value={r.difference} />, text: diffText },
          { key: 'status', label: 'Estado', render: r => (r.status === 'OPEN' ? 'Abierto' : 'Cerrado'), text: r => (r.status === 'OPEN' ? 'Abierto' : 'Cerrado') },
        ];
        return (
          <>
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <Kpi label="Turnos" value={num(summary.closes)} icon={Clock} tone="indigo" hint={`${summary.closed} cerrados · ${summary.open} abiertos`} />
              <Kpi label="Faltantes" value={money(Math.abs(summary.shortage))} icon={TrendingDown} tone="rose" />
              <Kpi label="Sobrantes" value={money(summary.overage)} icon={TrendingUp} tone="amber" />
              <Kpi label="Cuadre exacto" value={`${num(summary.exact)} de ${num(summary.closed)}`} icon={CircleCheck} tone="emerald" />
            </div>
            {summary.closed === 0 && <Callout>No hay turnos cerrados en este período. Las diferencias aparecen al cerrar cada caja.</Callout>}
            <div className="grid gap-5 lg:grid-cols-2">
              <Panel title="Diferencia por cajero" subtitle="Negativo = faltó dinero">
                <BarList items={data.byCashier.map(c => ({ label: c.name, value: c.difference, sub: `${c.closes} cierres` }))} empty="Sin cierres" />
              </Panel>
              <Panel title="Diferencia por caja">
                <BarList items={data.byTerminal.map(c => ({ label: c.name, value: c.difference, sub: `${c.closes} cierres` }))} empty="Sin cierres" />
              </Panel>
            </div>
            <ReportTable title="Resumen por cajero" columns={groupColumns('Cajero')} rows={data.byCashier} range={range} name="cajas_por_cajero" rowKey={r => r.name} />
            <ReportTable title="Resumen por caja" columns={groupColumns('Caja')} rows={data.byTerminal} range={range} name="cajas_por_caja" rowKey={r => r.name} />
            <ReportTable title="Historial de turnos" columns={closeColumns} rows={data.closes} range={range} name="cajas_historial" rowKey={r => r.id} />
          </>
        );
      }}
    </ReportState>
  );
}

/* --------------------------- H. Clientes --------------------------- */

export function CustomersArea({ range }) {
  const [inactiveDays, setInactiveDays] = useState(60);
  const report = useReport(api.reports.customerInsights, { ...range, inactiveDays });
  return (
    <ReportState report={report}>
      {data => {
        const { summary } = data;
        const inactiveColumns = [
          { key: 'name', label: 'Cliente', bold: true },
          { key: 'documentId', label: 'Documento', mono: true },
          { key: 'phone', label: 'Teléfono', mono: true },
          { key: 'orders', label: 'Compras', type: 'number' },
          { key: 'totalSpent', label: 'Total gastado', type: 'money', bold: true },
          { key: 'lastPurchase', label: 'Última compra', render: r => shortDate(r.lastPurchase), text: r => shortDate(r.lastPurchase) },
          { key: 'daysSince', label: 'Días sin comprar', type: 'number' },
        ];
        const newColumns = [
          { key: 'name', label: 'Cliente', bold: true },
          { key: 'documentId', label: 'Documento', mono: true },
          { key: 'orders', label: 'Compras', type: 'number' },
          { key: 'totalSpent', label: 'Total gastado', type: 'money', bold: true },
        ];
        return (
          <>
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <Kpi label="Clientes con compras" value={num(summary.active)} icon={Users} tone="indigo" hint="Sin contar consumidor final" />
              <Kpi label="Nuevos" value={num(summary.newCustomers)} icon={UserPlus} tone="emerald" hint={`${money(summary.newRevenue)} en compras`} />
              <Kpi label="Recurrentes" value={num(summary.recurring)} icon={Scale} tone="blue" hint={`${money(summary.recurringRevenue)} en compras`} />
              <Kpi label="Sin comprar" value={num(summary.inactive)} icon={UserMinus} tone="rose" hint={`Más de ${data.inactiveDays} días`} />
            </div>
            <Panel title="¿De dónde viene la venta?" subtitle="Compras del período según el tipo de cliente">
              <BarList
                items={[
                  { label: 'Clientes recurrentes', value: summary.recurringRevenue },
                  { label: 'Clientes nuevos', value: summary.newRevenue },
                  { label: 'Consumidor final (sin identificar)', value: summary.anonymousRevenue },
                ]}
                format={money}
              />
              <p className="mt-3 text-[11px] text-slate-400">Registraste {summary.registered} clientes nuevos en este período.</p>
            </Panel>
            <Panel
              title="Clientes que dejaron de comprar"
              subtitle="Los de mayor gasto primero: buenos candidatos para una llamada o un mensaje"
              actions={
                <select aria-label="Días sin comprar" value={inactiveDays} onChange={e => setInactiveDays(Number(e.target.value))} className={selectClass}>
                  {[30, 60, 90, 180].map(d => <option key={d} value={d}>{d} días sin comprar</option>)}
                </select>
              }
            >
              <ReportTable columns={inactiveColumns} rows={data.inactive} range={range} name="clientes_inactivos" empty="Todos tus clientes han comprado recientemente" rowKey={r => r.customerId} />
            </Panel>
            <ReportTable title="Clientes nuevos del período" columns={newColumns} rows={data.newList} range={range} name="clientes_nuevos" empty="Sin clientes nuevos con compras" rowKey={r => r.customerId} />
          </>
        );
      }}
    </ReportState>
  );
}
