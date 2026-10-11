import React from 'react';
import { Banknote, CalendarClock, PackageMinus, Percent, Scale, Skull, TimerReset } from 'lucide-react';
import { api } from '../../services/api';
import { dateTime, money } from '../../utils/format';
import ExpiryBadge from '../../components/inventory/ExpiryBadge';
import { BarList, Callout, Kpi, Panel, ReportState, ReportTable, TrendChart, num, pctText, periodLabel, shortDate, useReport } from './shared';

const qty = value => Number(value || 0).toLocaleString('es-DO', { maximumFractionDigits: 2 });

/* ----------------------- Vencimientos y mermas (perecederos) ----------------------- */

export function ExpiryArea({ range }) {
  const report = useReport(api.reports.expiry, range);

  return (
    <ReportState report={report}>
      {data => {
        const { risk, writeOffs, discounts } = data;
        const lotColumns = [
          { key: 'productName', label: 'Producto', bold: true },
          { key: 'batchNumber', label: 'Lote', mono: true },
          { key: 'expirationDate', label: 'Vence', render: r => shortDate(r.expirationDate), text: r => shortDate(r.expirationDate) },
          { key: 'status', label: 'Estado', render: r => <ExpiryBadge status={r.status} daysLeft={r.daysLeft} />, text: r => r.status },
          { key: 'currentStock', label: 'Existencias', type: 'number' },
          { key: 'cost', label: 'Costo en riesgo', type: 'money', bold: true },
          { key: 'discountPercent', label: 'Descuento', render: r => (r.discountPercent ? `${r.discountPercent}%` : '—'), text: r => (r.discountPercent ? `${r.discountPercent}%` : '') },
        ];
        const writeOffColumns = [
          { key: 'date', label: 'Fecha', render: r => dateTime(r.date), text: r => dateTime(r.date) },
          { key: 'productName', label: 'Producto', bold: true },
          { key: 'quantity', label: 'Cantidad', type: 'number' },
          { key: 'cost', label: 'Costo perdido', type: 'money', bold: true },
          { key: 'reason', label: 'Motivo' },
          { key: 'userName', label: 'Usuario' },
        ];
        const discountColumns = [
          { key: 'productName', label: 'Producto', bold: true },
          { key: 'quantity', label: 'Vendido con descuento', type: 'number' },
          { key: 'discount', label: 'Descuento dado', type: 'money' },
          { key: 'recovered', label: 'Ingreso salvado', type: 'money', bold: true },
        ];
        const atRisk = risk.expired + risk.red + risk.yellow;

        return (
          <>
            {!data.enabled && (
              <Callout>El módulo de perecederos está apagado. Actívalo en Configuración → Gestión de perecederos y lotes para controlar vencimientos.</Callout>
            )}
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <Kpi label="Lotes en riesgo" value={num(atRisk)} icon={CalendarClock} tone="amber" hint={`${risk.expired} vencidos · ${risk.red} críticos · ${risk.yellow} por vencer`} />
              <Kpi label="Costo en riesgo" value={money(risk.valueAtRisk)} icon={Skull} tone="rose" hint="Mercancía vencida o por vencer, al costo" />
              <Kpi label="Merma del período" value={money(writeOffs.total)} icon={PackageMinus} tone="rose" hint={`${qty(writeOffs.units)} unidades dadas de baja`} />
              <Kpi label="Ingreso salvado" value={money(discounts.recovered)} icon={TimerReset} tone="emerald" hint={`Vendido con ${money(discounts.total)} de descuento por vencimiento`} />
            </div>

            <div className="grid gap-5 lg:grid-cols-2">
              <Panel title="Descuentos por vencimiento por día" subtitle="Lo que se rebajó para vender antes de que venza">
                <TrendChart data={discounts.byDay.map(d => ({ label: periodLabel(d.day), value: d.amount }))} ariaLabel="Descuentos por vencimiento por día" />
              </Panel>
              <Panel title="Dónde se pierde más" subtitle="Costo de la merma por producto">
                <BarList items={writeOffs.byProduct.slice(0, 8).map(p => ({ label: p.productName, value: p.cost, sub: `${qty(p.quantity)} uds.` }))} empty="Sin mermas en este período" />
              </Panel>
            </div>

            <ReportTable
              title="Lotes en riesgo ahora"
              subtitle={`Vencidos, críticos (≤ ${data.thresholds.red} días) y por vencer (≤ ${data.thresholds.yellow} días), con existencias`}
              columns={lotColumns}
              rows={risk.lots}
              range={range}
              name="vencimientos_lotes"
              empty="Sin lotes en riesgo"
              rowKey={r => r.id}
            />
            <ReportTable title="Mermas del período" subtitle="Bajas por vencimiento, daño o pérdida" columns={writeOffColumns} rows={writeOffs.rows} range={range} name="vencimientos_mermas" empty="Sin mermas en este período" rowKey={r => r.id} />
            <ReportTable title="Ventas con descuento por vencimiento" subtitle="Productos que se vendieron rebajados por estar cerca de vencer" columns={discountColumns} rows={discounts.byProduct} range={range} name="vencimientos_descuentos" empty="Sin descuentos por vencimiento en este período" rowKey={r => r.productName} />
          </>
        );
      }}
    </ReportState>
  );
}

/* ------------------------ Granel y presentaciones ------------------------ */

export function BulkArea({ range }) {
  const report = useReport(api.reports.bulk, range);

  return (
    <ReportState report={report}>
      {data => {
        const { summary } = data;
        const unitColumns = [
          { key: 'label', label: 'Se vende por', bold: true },
          { key: 'quantity', label: 'Cantidad vendida', render: r => `${qty(r.quantity)} ${r.short}`, text: r => `${r.quantity} ${r.short}` },
          { key: 'amount', label: 'Ventas', type: 'money', bold: true },
        ];
        const bulkColumns = [
          { key: 'productName', label: 'Producto', bold: true },
          { key: 'quantity', label: 'Peso / volumen vendido', render: r => `${qty(r.quantity)} ${r.short}`, text: r => `${r.quantity} ${r.short}` },
          { key: 'avgPrice', label: 'Precio promedio', render: r => `${money(r.avgPrice)} / ${r.short}`, text: r => `${r.avgPrice}` },
          { key: 'sales', label: 'Ventas', type: 'number' },
          { key: 'amount', label: 'Importe', type: 'money', bold: true },
        ];
        const packColumns = [
          { key: 'productName', label: 'Producto', bold: true },
          { key: 'presentation', label: 'Presentación' },
          { key: 'packs', label: 'Vendidos', type: 'number' },
          { key: 'units', label: 'Unidades equivalentes', type: 'number' },
          { key: 'amount', label: 'Importe', type: 'money', bold: true },
        ];

        return (
          <>
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <Kpi label="Ventas a granel" value={money(summary.bulkRevenue)} icon={Scale} tone="emerald" hint={`${summary.bulkProducts} productos por peso o volumen`} />
              <Kpi label="% a granel" value={pctText(summary.bulkShare)} icon={Percent} tone="blue" hint="De las ventas del período" />
              <Kpi label="Ventas por presentación" value={money(summary.packRevenue)} icon={Banknote} tone="indigo" hint="Paquetes, cajas y similares" />
              <Kpi label="% por presentación" value={pctText(summary.packShare)} icon={Percent} tone="amber" hint="De las ventas del período" />
            </div>

            <div className="grid gap-5 lg:grid-cols-2">
              <Panel title="Lo más vendido por peso" subtitle="Importe por producto a granel">
                <BarList items={data.bulk.slice(0, 8).map(b => ({ label: b.productName, value: b.amount, sub: `${qty(b.quantity)} ${b.short}` }))} empty="Sin ventas a granel en este período" />
              </Panel>
              <Panel title="Presentaciones más vendidas" subtitle="Importe por paquete / caja">
                <BarList items={data.presentations.slice(0, 8).map(p => ({ label: `${p.productName} · ${p.presentation}`, value: p.amount, sub: `${qty(p.packs)} vendidos` }))} empty="Sin ventas por presentación en este período" />
              </Panel>
            </div>

            <ReportTable title="Ventas por unidad de medida" subtitle="Netas de devoluciones" columns={unitColumns} rows={data.byUnit} range={range} name="granel_unidades" rowKey={r => r.unit} />
            <ReportTable title="Productos a granel" columns={bulkColumns} rows={data.bulk} range={range} name="granel_productos" empty="Sin ventas a granel en este período" rowKey={r => r.productName} />
            <ReportTable title="Ventas por presentación" columns={packColumns} rows={data.presentations} range={range} name="granel_presentaciones" empty="Sin ventas por presentación en este período" rowKey={r => `${r.productName}|${r.presentation}`} />
          </>
        );
      }}
    </ReportState>
  );
}
