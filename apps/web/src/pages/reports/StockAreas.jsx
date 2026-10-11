import React, { useState } from 'react';
import { AlertTriangle, Banknote, PackageX, Receipt, Tag, Truck, Users } from 'lucide-react';
import { api } from '../../services/api';
import Modal from '../../components/Modal';
import { dateTime, money } from '../../utils/format';
import { BarList, Callout, Kpi, Panel, ReportState, ReportTable, TrendChart, num, periodLabel, useReport } from './shared';

const selectClass =
  'h-9 rounded-lg border border-slate-200 bg-transparent px-3 text-xs text-slate-700 outline-none focus:ring-1 focus:ring-indigo-500 dark:border-slate-700 dark:text-slate-300';

const MOVEMENT_LABELS = { ENTRADA: 'Entrada', SALIDA: 'Salida', AJUSTE: 'Ajuste', DEVOLUCION: 'Devolución', MERMA: 'Merma' };

function KardexModal({ product, range, onClose }) {
  const report = useReport(p => api.reports.kardex(p.productId, { from: p.from, to: p.to }), { productId: product.id, ...range });
  const columns = [
    { key: 'createdAt', label: 'Fecha', render: r => dateTime(r.createdAt), text: r => dateTime(r.createdAt) },
    { key: 'type', label: 'Movimiento', bold: true, render: r => MOVEMENT_LABELS[r.type] || r.type, text: r => MOVEMENT_LABELS[r.type] || r.type },
    { key: 'quantity', label: 'Cantidad', type: 'number' },
    { key: 'unitCost', label: 'Costo unit.', type: 'money' },
    { key: 'reason', label: 'Detalle' },
    { key: 'userName', label: 'Usuario' },
  ];
  return (
    <Modal isOpen onClose={onClose} title={`Movimientos · ${product.name}`} maxWidth="2xl">
      <ReportState report={report} skeleton="table">
        {data => (
          <>
            <p className="text-xs text-slate-500">
              Existencia actual: <strong className="text-slate-800 dark:text-slate-200">{num(data.product?.stock)}</strong> · Costo: {money(data.product?.costPrice)}
            </p>
            <ReportTable columns={columns} rows={data.movements} empty="Sin movimientos en el período" rowKey={r => r.id} />
          </>
        )}
      </ReportState>
    </Modal>
  );
}

/* ----------------------------- E. Inventario ----------------------------- */

export function InventoryArea({ range }) {
  const [deadDays, setDeadDays] = useState(60);
  const [kardex, setKardex] = useState(null);
  const report = useReport(api.reports.inventory, { ...range, deadDays });

  const viewButton = row => (
    <button type="button" onClick={() => setKardex({ id: row.id, name: row.name })} className="cursor-pointer text-[11px] font-semibold text-indigo-500 hover:text-indigo-600">
      Ver movimientos
    </button>
  );

  return (
    <>
      <ReportState report={report}>
        {data => {
          const { summary } = data;
          const reorderColumns = [
            { key: 'name', label: 'Producto', bold: true },
            { key: 'category', label: 'Categoría' },
            { key: 'stock', label: 'Existencia', type: 'number' },
            { key: 'minStock', label: 'Mínimo', type: 'number' },
            { key: 'soldLast30', label: 'Vendido 30 d', type: 'number' },
            { key: 'coverDays', label: 'Alcanza (días)', type: 'number' },
            { key: 'suggested', label: 'Pedir', type: 'number', bold: true },
            { key: 'estimatedCost', label: 'Costo estimado', type: 'money' },
            { key: 'actions', label: '', render: viewButton, text: () => '' },
          ];
          const deadColumns = [
            { key: 'name', label: 'Producto', bold: true },
            { key: 'category', label: 'Categoría' },
            { key: 'stock', label: 'Existencia', type: 'number' },
            { key: 'costValue', label: 'Dinero parado (costo)', type: 'money', bold: true },
            { key: 'retailValue', label: 'A precio de venta', type: 'money' },
            { key: 'actions', label: '', render: viewButton, text: () => '' },
          ];
          const categoryColumns = [
            { key: 'category', label: 'Categoría', bold: true },
            { key: 'products', label: 'Productos', type: 'number' },
            { key: 'units', label: 'Unidades', type: 'number' },
            { key: 'costValue', label: 'Valor al costo', type: 'money', bold: true },
            { key: 'retailValue', label: 'Valor de venta', type: 'money' },
          ];
          const fastColumns = [
            { key: 'name', label: 'Producto', bold: true },
            { key: 'perDay', label: 'Unidades por día', type: 'number' },
            { key: 'stock', label: 'Existencia', type: 'number' },
            { key: 'coverDays', label: 'Alcanza (días)', type: 'number' },
            { key: 'actions', label: '', render: viewButton, text: () => '' },
          ];
          const adjustmentColumns = [
            { key: 'date', label: 'Fecha', render: r => dateTime(r.date), text: r => dateTime(r.date) },
            { key: 'productName', label: 'Producto', bold: true },
            { key: 'type', label: 'Tipo', render: r => MOVEMENT_LABELS[r.type] || r.type, text: r => MOVEMENT_LABELS[r.type] || r.type },
            { key: 'quantity', label: 'Cantidad', type: 'number' },
            { key: 'cost', label: 'Valor perdido', type: 'money' },
            { key: 'reason', label: 'Motivo' },
            { key: 'userName', label: 'Usuario' },
          ];
          return (
            <>
              <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                <Kpi label="Inventario al costo" value={money(summary.costValue)} icon={Banknote} tone="indigo" hint={`${num(summary.units)} unidades · ${num(summary.products)} productos`} />
                <Kpi label="Valor de venta" value={money(summary.retailValue)} icon={Tag} tone="blue" hint={`Ganancia potencial ${money(summary.potentialProfit)}`} />
                <Kpi label="Por reponer" value={num(data.reorder.length)} icon={AlertTriangle} tone="amber" hint={`${summary.outOfStock} agotados · ${summary.lowStock} bajo mínimo`} />
                <Kpi label="Sin movimiento" value={money(summary.deadValue)} icon={PackageX} tone="rose" hint={`${summary.deadCount} productos sin vender en ${data.deadDays} días`} />
              </div>

              <div className="grid gap-5 lg:grid-cols-2">
                <Panel title="Valor del inventario por categoría" subtitle="A precio de costo">
                  <BarList items={data.byCategory.slice(0, 8).map(c => ({ label: c.category, value: c.costValue, sub: `${num(c.units)} uds.` }))} />
                </Panel>
                <Panel title="Lo que más rota" subtitle="Unidades vendidas por día (últimos 30 días)">
                  <BarList
                    format={v => `${v.toLocaleString('es-DO', { maximumFractionDigits: 1 })} /día`}
                    items={data.fastMovers.slice(0, 8).map(p => ({ label: p.name, value: p.perDay, sub: p.coverDays !== null ? `alcanza ${p.coverDays} d` : '' }))}
                    empty="Aún no hay ventas en los últimos 30 días"
                  />
                </Panel>
              </div>

              <ReportTable
                title="Reposición sugerida"
                subtitle="Bajo el mínimo o con menos de 7 días de venta. Sugerido: cubrir 30 días de venta (o el doble del mínimo)."
                columns={reorderColumns}
                rows={data.reorder}
                range={range}
                name="inventario_reposicion"
                empty="Nada urgente por reponer"
                rowKey={r => r.id}
              />

              <Panel
                title="Productos sin movimiento"
                subtitle="Con existencia y sin ventas en el plazo elegido: dinero parado en estantería"
                actions={
                  <select aria-label="Días sin venta" value={deadDays} onChange={e => setDeadDays(Number(e.target.value))} className={selectClass}>
                    {[30, 60, 90, 180].map(d => <option key={d} value={d}>{d} días sin vender</option>)}
                  </select>
                }
              >
                <ReportTable columns={deadColumns} rows={data.dead} empty="Todo lo que tienes en existencia se ha vendido" rowKey={r => r.id} />
              </Panel>

              <ReportTable title="Valor por categoría" columns={categoryColumns} rows={data.byCategory} range={range} name="inventario_categorias" rowKey={r => r.category} />
              <ReportTable title="Mermas y ajustes del período" subtitle="Salidas manuales, ajustes y devoluciones (no incluye ventas)" columns={adjustmentColumns} rows={data.adjustments} range={range} name="inventario_ajustes" empty="Sin ajustes en este período" rowKey={r => r.id} />
              <ReportTable title="Productos de mayor rotación" columns={fastColumns} rows={data.fastMovers} range={range} name="inventario_rotacion" rowKey={r => r.id} exportable={false} />
            </>
          );
        }}
      </ReportState>
      {kardex && <KardexModal product={kardex} range={range} onClose={() => setKardex(null)} />}
    </>
  );
}

/* ------------------------------ F. Compras ------------------------------ */

export function PurchasesArea({ range }) {
  const report = useReport(api.reports.purchases, range);
  return (
    <ReportState report={report}>
      {data => {
        const { summary } = data;
        const supplierColumns = [
          { key: 'supplier', label: 'Proveedor', bold: true },
          { key: 'entries', label: 'Compras', type: 'number' },
          { key: 'products', label: 'Productos', type: 'number' },
          { key: 'units', label: 'Unidades', type: 'number' },
          { key: 'total', label: 'Total comprado', type: 'money', bold: true },
          { key: 'share', label: '% del total', type: 'percent' },
          { key: 'lastPurchase', label: 'Última compra', render: r => (r.lastPurchase ? new Date(r.lastPurchase).toLocaleDateString('es-DO') : '—'), text: r => (r.lastPurchase ? new Date(r.lastPurchase).toLocaleDateString('es-DO') : '') },
        ];
        const productColumns = [
          { key: 'name', label: 'Producto', bold: true },
          { key: 'purchases', label: 'Compras', type: 'number' },
          { key: 'units', label: 'Unidades', type: 'number' },
          { key: 'total', label: 'Total', type: 'money', bold: true },
          { key: 'firstCost', label: 'Primer costo', type: 'money' },
          { key: 'lastCost', label: 'Último costo', type: 'money' },
          { key: 'costChange', label: 'Cambio', type: 'percent' },
        ];
        return (
          <>
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <Kpi label="Total comprado" value={money(summary.total)} icon={Banknote} tone="indigo" />
              <Kpi label="Entradas registradas" value={num(summary.entries)} icon={Receipt} tone="blue" />
              <Kpi label="Proveedores" value={num(summary.suppliers)} icon={Truck} tone="emerald" />
              <Kpi label="Sin proveedor" value={num(summary.withoutSupplier)} icon={Users} tone="amber" hint="Entradas sin proveedor asignado" />
            </div>
            {summary.withoutSupplier > 0 && (
              <Callout>
                {summary.withoutSupplier} {summary.withoutSupplier === 1 ? 'compra no tiene' : 'compras no tienen'} proveedor (por ejemplo, las que vienen de una importación). Asignarlo permite ver cuánto le compras a cada uno.
              </Callout>
            )}
            <Panel title="Compras por período">
              <TrendChart data={data.series.map(s => ({ label: periodLabel(s.period), value: s.total }))} ariaLabel="Compras por período" />
            </Panel>
            {data.costIncreases.length > 0 && (
              <Panel title="Productos cuyo costo subió" subtitle="Compara la primera y la última compra del período">
                <BarList
                  format={v => `+${v.toLocaleString('es-DO', { maximumFractionDigits: 1 })}%`}
                  items={data.costIncreases.slice(0, 8).map(p => ({ label: p.name, value: p.costChange, sub: `${money(p.firstCost)} → ${money(p.lastCost)}` }))}
                />
              </Panel>
            )}
            <ReportTable title="Compras por proveedor" columns={supplierColumns} rows={data.suppliers} range={range} name="compras_proveedores" rowKey={r => r.supplier} />
            <ReportTable title="Compras por producto" columns={productColumns} rows={data.products} range={range} name="compras_productos" rowKey={r => r.productId} />
          </>
        );
      }}
    </ReportState>
  );
}
