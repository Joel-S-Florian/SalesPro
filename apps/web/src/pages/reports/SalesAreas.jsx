import React, { useState } from 'react';
import { Banknote, Landmark, Percent, Receipt, Tag, TrendingUp, Wallet } from 'lucide-react';
import { api } from '../../services/api';
import { money } from '../../utils/format';
import { ECF_STATUS } from '../../components/ecf/EcfStatusBadge';
import { BarList, Callout, Heatmap, Kpi, Panel, PAYMENT_LABELS, ReportState, ReportTable, TrendChart, WEEKDAYS, num, pctText, periodLabel, useReport } from './shared';

const GROUPS = [
  ['', 'Automático'],
  ['day', 'Por día'],
  ['week', 'Por semana'],
  ['month', 'Por mes'],
];

const selectClass =
  'h-9 rounded-lg border border-slate-200 bg-transparent px-3 text-xs text-slate-700 outline-none focus:ring-1 focus:ring-indigo-500 dark:border-slate-700 dark:text-slate-300';

/* ----------------------------- A. Resumen ----------------------------- */

export function Overview({ range }) {
  const report = useReport(api.reports.overview, range);
  return (
    <ReportState report={report}>
      {data => {
        const { kpis } = data;
        const comparable = data.granularity === 'day' && data.previousSeries.length === data.series.length;
        const chart = data.series.map((s, i) => ({
          label: periodLabel(s.period),
          value: s.total,
          ...(comparable ? { prev: data.previousSeries[i] } : {}),
        }));
        return (
          <>
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
              <Kpi label="Ventas" value={money(kpis.total.value)} icon={Banknote} tone="indigo" change={kpis.total.change} />
              <Kpi label="Ganancia bruta" value={money(kpis.profit.value)} icon={TrendingUp} tone="emerald" change={kpis.profit.change} />
              <Kpi label="Facturas" value={num(kpis.invoices.value)} icon={Receipt} tone="blue" change={kpis.invoices.change} />
              <Kpi label="Ticket promedio" value={money(kpis.avgTicket.value)} icon={Tag} tone="amber" change={kpis.avgTicket.change} />
              <Kpi label="ITBIS" value={money(kpis.tax.value)} icon={Landmark} tone="indigo" change={kpis.tax.change} />
              <Kpi label="Descuentos" value={money(kpis.discount.value)} icon={Percent} tone="rose" change={kpis.discount.change} invert />
            </div>

            <Panel title="Ventas por período" subtitle={`Margen bruto del período: ${pctText(data.margin)}`}>
              <TrendChart data={chart} ariaLabel="Ventas por período" />
            </Panel>

            <div className="grid gap-5 lg:grid-cols-2">
              <Panel title="Métodos de pago">
                <BarList
                  items={data.payments.map(p => ({ label: PAYMENT_LABELS[p.method] || p.method, value: p.total, sub: `${p.invoices} fact.` }))}
                  empty="Sin ventas en este período"
                />
              </Panel>
              <Panel title="Productos que más ingresos dejan">
                <BarList items={data.topProducts.map(p => ({ label: p.name, value: p.revenue, sub: `${p.quantity} uds.` }))} empty="Sin ventas en este período" />
              </Panel>
            </div>

            <Panel
              title="¿Cuándo vendes más?"
              subtitle={data.peak ? `Pico: ${WEEKDAYS[data.peak.weekday]} a las ${String(data.peak.hour).padStart(2, '0')}:00 (${data.peak.count} ventas)` : 'Cantidad de facturas por día y hora'}
            >
              <Heatmap grid={data.heatmap} peak={data.peak} />
            </Panel>

            {data.warnings.linesWithoutCost > 0 && (
              <Callout>
                {data.warnings.linesWithoutCost} {data.warnings.linesWithoutCost === 1 ? 'línea vendida no tiene' : 'líneas vendidas no tienen'} costo registrado: la ganancia de esas ventas aparece al 100 %.
                Completa el costo de esos productos para ver márgenes reales.
              </Callout>
            )}
            {data.creditNotes > 0 && (
              <Callout>Este período incluye {data.creditNotes} {data.creditNotes === 1 ? 'nota de crédito' : 'notas de crédito'}; sus montos se restan de las ventas.</Callout>
            )}
          </>
        );
      }}
    </ReportState>
  );
}

/* ------------------------------ B. Ventas ------------------------------ */

export function SalesArea({ range }) {
  const [groupBy, setGroupBy] = useState('');
  const report = useReport(api.reports.salesBreakdown, { ...range, groupBy });
  return (
    <ReportState report={report}>
      {data => {
        const { summary } = data;
        const columns = [
          { key: 'period', label: 'Período', bold: true, render: r => periodLabel(r.period), text: r => r.period },
          { key: 'invoices', label: 'Facturas', type: 'number' },
          { key: 'subtotal', label: 'Subtotal', type: 'money' },
          { key: 'discount', label: 'Descuento', type: 'money' },
          { key: 'tax', label: 'ITBIS', type: 'money' },
          { key: 'total', label: 'Total', type: 'money', bold: true },
          { key: 'avgTicket', label: 'Ticket prom.', type: 'money' },
        ];
        return (
          <>
            <div className="flex items-center gap-2">
              <label htmlFor="sales-group" className="text-xs font-semibold text-slate-600 dark:text-slate-400">Agrupar</label>
              <select id="sales-group" value={groupBy} onChange={e => setGroupBy(e.target.value)} className={selectClass}>
                {GROUPS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <Kpi label="Total vendido" value={money(summary.total)} icon={Banknote} tone="indigo" />
              <Kpi label="Facturas" value={num(summary.invoices)} icon={Receipt} tone="blue" hint={summary.creditNotes ? `${summary.creditNotes} notas de crédito` : undefined} />
              <Kpi label="Ticket promedio" value={money(summary.avgTicket)} icon={Tag} tone="amber" />
              <Kpi label="Descuentos" value={money(summary.discount)} icon={Percent} tone="rose" hint={`${pctText(data.discountRate)} del subtotal`} />
            </div>
            <Panel title="Ventas" subtitle="Total vendido en cada período">
              <TrendChart data={data.series.map(s => ({ label: periodLabel(s.period), value: s.total }))} ariaLabel="Ventas por período" />
            </Panel>
            <div className="grid gap-5 lg:grid-cols-3">
              <Panel title="Por método de pago">
                <BarList items={data.byPayment.map(p => ({ label: PAYMENT_LABELS[p.method] || p.method, value: p.total, sub: `${p.invoices} fact.` }))} />
              </Panel>
              <Panel title="Por tipo de comprobante">
                <BarList items={data.byNcf.map(p => ({ label: `${p.ncfType} · ${p.label}`, value: p.total, sub: `${p.invoices} fact.` }))} />
              </Panel>
              <Panel title="Por caja">
                <BarList items={data.byTerminal.map(p => ({ label: p.terminal, value: p.total, sub: `${p.invoices} fact.` }))} />
              </Panel>
            </div>
            <ReportTable title="Detalle por período" columns={columns} rows={data.series} range={range} name="ventas_por_periodo" rowKey={r => r.period} />
          </>
        );
      }}
    </ReportState>
  );
}

/* --------------------------- C. Rentabilidad --------------------------- */

export function ProfitArea({ range }) {
  const report = useReport(api.reports.profitability, range);
  return (
    <ReportState report={report}>
      {data => {
        const { summary } = data;
        const productColumns = [
          { key: 'name', label: 'Producto', bold: true },
          { key: 'category', label: 'Categoría' },
          { key: 'quantity', label: 'Unidades', type: 'number' },
          { key: 'revenue', label: 'Ingresos', type: 'money' },
          { key: 'cost', label: 'Costo', type: 'money' },
          { key: 'profit', label: 'Ganancia', type: 'money', bold: true },
          { key: 'margin', label: 'Margen', type: 'percent' },
        ];
        const categoryColumns = [
          { key: 'category', label: 'Categoría', bold: true },
          { key: 'products', label: 'Productos', type: 'number' },
          { key: 'quantity', label: 'Unidades', type: 'number' },
          { key: 'revenue', label: 'Ingresos', type: 'money' },
          { key: 'profit', label: 'Ganancia', type: 'money', bold: true },
          { key: 'margin', label: 'Margen', type: 'percent' },
        ];
        return (
          <>
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <Kpi label="Ingresos (sin ITBIS)" value={money(summary.revenue)} icon={Banknote} tone="indigo" />
              <Kpi label="Costo de lo vendido" value={money(summary.cost)} icon={Wallet} tone="amber" />
              <Kpi label="Ganancia bruta" value={money(summary.profit)} icon={TrendingUp} tone="emerald" />
              <Kpi label="Margen" value={pctText(summary.margin)} icon={Percent} tone="blue" />
            </div>
            {data.warnings.linesWithoutCost > 0 && (
              <Callout>
                {data.warnings.linesWithoutCost} {data.warnings.linesWithoutCost === 1 ? 'línea vendida no tiene' : 'líneas vendidas no tienen'} costo: se muestran con margen del 100 %.
              </Callout>
            )}
            <Panel title="Ganancia por período">
              <TrendChart data={data.series.map(s => ({ label: periodLabel(s.period), value: s.profit }))} ariaLabel="Ganancia por período" />
            </Panel>
            <ReportTable title="Rentabilidad por categoría" columns={categoryColumns} rows={data.categories} range={range} name="rentabilidad_categorias" rowKey={r => r.category} />
            {data.unprofitable.length > 0 && (
              <ReportTable
                title="Se venden pero no dejan ganancia"
                subtitle="Precio igual o menor al costo: revisa el precio de venta"
                columns={productColumns}
                rows={data.unprofitable}
                range={range}
                name="productos_sin_ganancia"
                rowKey={r => r.productId}
              />
            )}
            <ReportTable title="Rentabilidad por producto" columns={productColumns} rows={data.products} range={range} name="rentabilidad_productos" rowKey={r => r.productId} />
          </>
        );
      }}
    </ReportState>
  );
}

/* ------------------------------ D. Fiscal ------------------------------ */

export function FiscalArea({ range }) {
  const report = useReport(api.reports.fiscal, range);
  return (
    <ReportState report={report}>
      {data => {
        const typeColumns = [
          { key: 'ncfType', label: 'Tipo', bold: true },
          { key: 'label', label: 'Comprobante' },
          { key: 'count', label: 'Cantidad', type: 'number' },
          { key: 'base', label: 'Base', type: 'money' },
          { key: 'tax', label: 'ITBIS', type: 'money' },
          { key: 'total', label: 'Total', type: 'money', bold: true },
        ];
        const voucherColumns = [
          { key: 'date', label: 'Fecha', mono: true },
          { key: 'invoiceNumber', label: 'Comprobante (NCF)', bold: true, mono: true },
          { key: 'ncfType', label: 'Tipo' },
          { key: 'ecfStatus', label: 'Estado DGII', render: r => (r.ecfStatus ? ECF_STATUS[r.ecfStatus]?.label || r.ecfStatus : '—'), text: r => (r.ecfStatus ? ECF_STATUS[r.ecfStatus]?.label || r.ecfStatus : '') },
          { key: 'customerName', label: 'Cliente' },
          { key: 'documentId', label: 'RNC / Cédula', mono: true },
          { key: 'base', label: 'Base', type: 'money' },
          { key: 'tax', label: 'ITBIS', type: 'money' },
          { key: 'total', label: 'Total', type: 'money', bold: true },
        ];
        const gapColumns = [
          { key: 'ncfType', label: 'Tipo', bold: true },
          { key: 'from', label: 'Desde', mono: true },
          { key: 'to', label: 'Hasta', mono: true },
          { key: 'missing', label: 'Números', type: 'number' },
        ];
        return (
          <>
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <Kpi label="Base imponible" value={money(data.net.base)} icon={Banknote} tone="indigo" />
              <Kpi label="ITBIS cobrado" value={money(data.net.tax)} icon={Landmark} tone="amber" />
              <Kpi label="Total facturado" value={money(data.net.total)} icon={Receipt} tone="emerald" />
              <Kpi label="Comprobantes" value={num(data.vouchers.length)} icon={Tag} tone="blue" />
            </div>
            <Callout>
              Este reporte es una base de trabajo para tu contador (las notas de crédito restan). No sustituye el formato oficial 607 de la DGII.
            </Callout>
            <ReportTable title="Por tipo de comprobante" columns={typeColumns} rows={data.byType} range={range} name="fiscal_por_tipo" rowKey={r => r.ncfType} />
            {data.gaps.length > 0 ? (
              <ReportTable
                title="Números de comprobante saltados"
                subtitle="Dentro del período hay secuencias con huecos: revisa si fueron anulados o se perdieron"
                columns={gapColumns}
                rows={data.gaps}
                range={range}
                name="fiscal_numeros_saltados"
                rowKey={r => r.from}
              />
            ) : (
              <p className="rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-700 dark:bg-emerald-950/20 dark:text-emerald-400">
                Sin números saltados en las secuencias de este período.
              </p>
            )}
            {data.truncated && <Callout>Se muestran los primeros 10,000 comprobantes. Acota el período para ver el resto.</Callout>}
            <ReportTable title="Comprobantes emitidos" columns={voucherColumns} rows={data.vouchers} range={range} name="fiscal_comprobantes" rowKey={r => r.id} />
          </>
        );
      }}
    </ReportState>
  );
}
