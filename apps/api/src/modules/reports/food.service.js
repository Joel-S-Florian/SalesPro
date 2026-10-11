import { prisma } from '../../config/db.js';
import { round2 } from '../../shared/utils/helpers.js';
import { dayKey, resolveRange } from '../../shared/utils/tz.js';
import { getExpiringBatches } from '../inventory/batches.service.js';
import { unitInfo } from '../../shared/utils/units.js';

/**
 * Reportes de alimentos: vencimientos/mermas (perecederos) y venta a granel / presentaciones.
 * Las notas de crédito se guardan con cantidades e importes negativos, así que restan solas.
 */

/** Vencimientos: riesgo actual, mermas del período y descuentos por vencimiento otorgados. */
export async function getExpiryReport({ from, to }) {
  const range = resolveRange({ from, to });

  const [risk, writeOffLogs, discounted] = await Promise.all([
    getExpiringBatches({ status: 'ALL', page: 1, limit: 500 }),
    prisma.inventoryLog.findMany({
      where: { type: 'MERMA', createdAt: { gte: range.gte, lte: range.lte } },
      orderBy: { createdAt: 'desc' },
      select: { id: true, productId: true, productName: true, quantity: true, totalCost: true, reason: true, userName: true, createdAt: true },
      take: 1000,
    }),
    prisma.saleBatchDetail.findMany({
      where: { discountAmount: { gt: 0 }, saleDetail: { sale: { createdAt: { gte: range.gte, lte: range.lte } } } },
      select: {
        quantity: true,
        discountAmount: true,
        batch: { select: { batchNumber: true, expirationDate: true } },
        saleDetail: { select: { productId: true, productName: true, unit: true, unitPrice: true, sale: { select: { createdAt: true } } } },
      },
    }),
  ]);

  // Mermas
  const writeOffs = writeOffLogs.map(l => ({
    id: l.id,
    date: l.createdAt,
    productName: l.productName,
    quantity: l.quantity,
    cost: round2(Number(l.totalCost) || 0),
    reason: l.reason.replace(/^Ajuste:\s*/, ''),
    userName: l.userName,
  }));
  const writeOffByProduct = new Map();
  for (const w of writeOffLogs) {
    const e = writeOffByProduct.get(w.productId) || { productName: w.productName, quantity: 0, cost: 0 };
    e.quantity += w.quantity;
    e.cost += Number(w.totalCost) || 0;
    writeOffByProduct.set(w.productId, e);
  }

  // Descuentos por vencimiento: lo que se dio de descuento y lo que se logró vender en vez de perderlo
  const byProduct = new Map();
  const byDay = new Map();
  let totalDiscount = 0;
  let recovered = 0;
  let units = 0;
  for (const row of discounted) {
    const d = row.saleDetail;
    const gross = Number(d.unitPrice) * row.quantity;
    const net = gross - row.discountAmount;
    totalDiscount += row.discountAmount;
    recovered += net;
    units += row.quantity;
    const p = byProduct.get(d.productId) || { productName: d.productName, unit: d.unit, quantity: 0, discount: 0, recovered: 0 };
    p.quantity += row.quantity;
    p.discount += row.discountAmount;
    p.recovered += net;
    byProduct.set(d.productId, p);
    const day = dayKey(d.sale.createdAt);
    byDay.set(day, round2((byDay.get(day) || 0) + row.discountAmount));
  }

  const writeOffTotal = writeOffs.reduce((a, w) => a + w.cost, 0);
  return {
    enabled: risk.enabled,
    thresholds: risk.thresholds,
    risk: {
      ...risk.summary,
      lots: risk.data.map(b => ({
        id: b.id,
        productName: b.product.name,
        productCode: b.product.code,
        batchNumber: b.batchNumber,
        expirationDate: b.expirationDate,
        daysLeft: b.daysLeft,
        status: b.status,
        currentStock: b.currentStock,
        cost: round2(b.currentStock * Number(b.costPrice || b.product.costPrice || 0)),
        discountPercent: b.discountPercent,
      })),
    },
    writeOffs: {
      total: round2(writeOffTotal),
      units: round2(writeOffs.reduce((a, w) => a + w.quantity, 0)),
      rows: writeOffs,
      byProduct: [...writeOffByProduct.values()].map(e => ({ ...e, quantity: round2(e.quantity), cost: round2(e.cost) })).sort((a, b) => b.cost - a.cost),
    },
    discounts: {
      total: round2(totalDiscount),
      recovered: round2(recovered),
      units: round2(units),
      byProduct: [...byProduct.values()].map(e => ({ ...e, quantity: round2(e.quantity), discount: round2(e.discount), recovered: round2(e.recovered) })).sort((a, b) => b.discount - a.discount),
      byDay: [...byDay.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([day, amount]) => ({ day, amount })),
    },
    range: { from: range.from, to: range.to },
  };
}

/** Venta a granel (por peso/volumen) y por presentaciones (paquete, caja) en el período, netas de devoluciones. */
export async function getBulkReport({ from, to }) {
  const range = resolveRange({ from, to });
  const details = await prisma.saleDetail.findMany({
    where: { sale: { createdAt: { gte: range.gte, lte: range.lte } } },
    select: { productId: true, productName: true, unit: true, quantity: true, subtotal: true, presentationName: true, presentationQty: true },
  });

  const byUnit = new Map();
  const bulk = new Map();
  const packs = new Map();
  let total = 0;
  let bulkRevenue = 0;
  let packRevenue = 0;

  for (const d of details) {
    const amount = Number(d.subtotal) || 0;
    total += amount;
    const info = unitInfo(d.unit);
    const u = byUnit.get(d.unit) || { unit: d.unit, label: info.label, short: info.short, quantity: 0, amount: 0, lines: 0 };
    u.quantity += d.quantity;
    u.amount += amount;
    u.lines += d.quantity > 0 ? 1 : 0;
    byUnit.set(d.unit, u);

    if (d.unit !== 'UND') {
      bulkRevenue += amount;
      const b = bulk.get(d.productId) || { productName: d.productName, unit: d.unit, short: info.short, quantity: 0, amount: 0, sales: 0 };
      b.quantity += d.quantity;
      b.amount += amount;
      b.sales += d.quantity > 0 ? 1 : 0;
      bulk.set(d.productId, b);
    }
    if (d.presentationName && d.presentationQty) {
      packRevenue += amount;
      const key = `${d.productId}|${d.presentationName}`;
      const p = packs.get(key) || { productName: d.productName, presentation: d.presentationName, packs: 0, units: 0, amount: 0 };
      p.packs += d.presentationQty;
      p.units += d.quantity;
      p.amount += amount;
      packs.set(key, p);
    }
  }

  const round = list => list.map(e => Object.fromEntries(Object.entries(e).map(([k, v]) => [k, typeof v === 'number' ? round2(v) : v])));
  return {
    summary: {
      total: round2(total),
      bulkRevenue: round2(bulkRevenue),
      bulkShare: total > 0 ? round2((bulkRevenue / total) * 100) : 0,
      packRevenue: round2(packRevenue),
      packShare: total > 0 ? round2((packRevenue / total) * 100) : 0,
      bulkProducts: bulk.size,
    },
    byUnit: round([...byUnit.values()]).sort((a, b) => b.amount - a.amount),
    bulk: round([...bulk.values()]).map(b => ({ ...b, avgPrice: b.quantity ? round2(b.amount / b.quantity) : 0 })).sort((a, b) => b.amount - a.amount),
    presentations: round([...packs.values()]).sort((a, b) => b.amount - a.amount),
    range: { from: range.from, to: range.to },
  };
}
