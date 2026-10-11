import { prisma } from '../../config/db.js';
import { round2 } from '../../shared/utils/helpers.js';
import { dayKey, monthKey, weekKey, hourOf, weekdayOf, addDays, diffDays, resolveRange, startOfDayUtc } from '../../shared/utils/tz.js';

/**
 * Reportes analíticos. Todas las fechas se agrupan en hora dominicana (ver shared/utils/tz.js) y todas las
 * consultas pasan por `prisma`, así que el aislamiento por empresa es automático.
 *
 * Las notas de crédito (ncfType B04) se guardan con montos y cantidades negativos, así que restan solas al sumar.
 */

const CREDIT_NOTE = 'B04';
const CONSUMER_DOC = '000000000';
const NCF_LABELS = {
  B01: 'Crédito fiscal',
  B02: 'Consumo',
  B03: 'Nota de débito',
  B04: 'Nota de crédito',
  B11: 'Comprobante de compras',
  B12: 'Registro único de ingresos',
  B13: 'Gastos menores',
  B14: 'Regímenes especiales',
  B15: 'Gubernamental',
  B16: 'Exportaciones',
  E31: 'Crédito fiscal (e-CF)',
  E32: 'Consumo (e-CF)',
  E34: 'Nota de crédito (e-CF)',
};

const pct = (cur, prev) => (prev > 0 ? round2(((cur - prev) / prev) * 100) : null);
const margin = (profit, revenue) => (revenue !== 0 ? round2((profit / revenue) * 100) : 0);

/* ------------------------------------------------------------------ */
/* Carga y normalización de ventas                                     */
/* ------------------------------------------------------------------ */

async function loadSales({ gte, lte }) {
  const sales = await prisma.sale.findMany({
    where: { createdAt: { gte, lte } },
    select: {
      id: true,
      invoiceNumber: true,
      ncfType: true,
      ecfType: true,
      customerId: true,
      userId: true,
      userName: true,
      subtotal: true,
      tax: true,
      discount: true,
      total: true,
      paymentMethod: true,
      terminalId: true,
      createdAt: true,
      details: {
        select: {
          productId: true,
          productName: true,
          quantity: true,
          subtotal: true,
          unitCost: true,
          product: { select: { costPrice: true, category: { select: { id: true, name: true } } } },
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  });

  let missingCost = 0;
  const rows = sales.map(s => {
    const isCredit = s.ncfType === CREDIT_NOTE;
    let cost = 0;
    const lines = s.details.map(d => {
      const unitCost = Number(d.unitCost) || Number(d.product?.costPrice) || 0;
      if (!unitCost) missingCost += 1;
      const lineCost = unitCost * d.quantity;
      cost += lineCost;
      return {
        productId: d.productId,
        name: d.productName,
        category: d.product?.category?.name || 'Sin categoría',
        quantity: d.quantity,
        revenue: Number(d.subtotal),
        cost: lineCost,
      };
    });
    const total = Number(s.total);
    return {
      id: s.id,
      invoiceNumber: s.invoiceNumber,
      ncfType: s.ecfType || s.ncfType, // tipo con el que se emitió (e-CF o serie B)
      isCredit,
      customerId: s.customerId,
      userId: s.userId,
      userName: s.userName,
      terminalId: s.terminalId,
      paymentMethod: s.paymentMethod,
      createdAt: s.createdAt,
      subtotal: Number(s.subtotal),
      tax: Number(s.tax),
      discount: Number(s.discount),
      total,
      cost,
      profit: Number(s.subtotal) - Number(s.discount) - cost,
      lines,
    };
  });
  return { rows, missingCost };
}

function summarize(rows) {
  const invoices = rows.filter(r => !r.isCredit).length;
  const sum = key => rows.reduce((acc, r) => acc + r[key], 0);
  const total = sum('total');
  const profit = sum('profit');
  const netBase = sum('subtotal') - sum('discount');
  return {
    total: round2(total),
    invoices,
    creditNotes: rows.length - invoices,
    avgTicket: invoices > 0 ? round2(total / invoices) : 0,
    profit: round2(profit),
    margin: margin(profit, netBase),
    subtotal: round2(sum('subtotal')),
    tax: round2(sum('tax')),
    discount: round2(sum('discount')),
    cost: round2(sum('cost')),
  };
}

/** Serie por día/semana/mes con los períodos vacíos rellenos en 0 cuando la agrupación es por día. */
function buildSeries(rows, range, groupBy) {
  const keyOf = { day: dayKey, week: weekKey, month: monthKey }[groupBy] || dayKey;
  const map = new Map();
  const ensure = key => {
    if (!map.has(key)) map.set(key, { period: key, invoices: 0, total: 0, subtotal: 0, tax: 0, discount: 0, profit: 0, cost: 0 });
    return map.get(key);
  };
  if (groupBy === 'day') {
    for (let i = 0; i < range.days; i++) ensure(addDays(range.from, i));
  }
  rows.forEach(r => {
    const e = ensure(keyOf(r.createdAt));
    if (!r.isCredit) e.invoices += 1;
    e.total += r.total;
    e.subtotal += r.subtotal;
    e.tax += r.tax;
    e.discount += r.discount;
    e.profit += r.profit;
    e.cost += r.cost;
  });
  return Array.from(map.values())
    .sort((a, b) => (a.period < b.period ? -1 : 1))
    .map(e => ({
      ...e,
      total: round2(e.total),
      subtotal: round2(e.subtotal),
      tax: round2(e.tax),
      discount: round2(e.discount),
      profit: round2(e.profit),
      cost: round2(e.cost),
      avgTicket: e.invoices > 0 ? round2(e.total / e.invoices) : 0,
      margin: margin(e.profit, e.subtotal - e.discount),
    }));
}

function autoGranularity(days) {
  if (days <= 62) return 'day';
  if (days <= 200) return 'week';
  return 'month';
}

function groupRows(rows, keyFn, init = () => ({})) {
  const map = new Map();
  rows.forEach(r => {
    const key = keyFn(r);
    const e = map.get(key) || { key, invoices: 0, total: 0, ...init(r) };
    if (!r.isCredit) e.invoices += 1;
    e.total += r.total;
    map.set(key, e);
  });
  return Array.from(map.values()).map(e => ({ ...e, total: round2(e.total) }));
}

function productLines(rows) {
  const map = new Map();
  rows.forEach(r =>
    r.lines.forEach(l => {
      const e = map.get(l.productId) || { productId: l.productId, name: l.name, category: l.category, quantity: 0, revenue: 0, cost: 0 };
      e.quantity += l.quantity;
      e.revenue += l.revenue;
      e.cost += l.cost;
      map.set(l.productId, e);
    })
  );
  return Array.from(map.values()).map(p => ({
    ...p,
    revenue: round2(p.revenue),
    cost: round2(p.cost),
    profit: round2(p.revenue - p.cost),
    margin: margin(p.revenue - p.cost, p.revenue),
  }));
}

/* ------------------------------------------------------------------ */
/* A. Resumen ejecutivo                                                */
/* ------------------------------------------------------------------ */

export async function getOverview({ from, to }) {
  const range = resolveRange({ from, to });
  const [current, previous] = await Promise.all([loadSales(range), loadSales(range.previous)]);
  const cur = summarize(current.rows);
  const prev = summarize(previous.rows);

  const grid = Array.from({ length: 7 }, () => Array(24).fill(0));
  current.rows.forEach(r => {
    if (!r.isCredit) grid[weekdayOf(r.createdAt)][hourOf(r.createdAt)] += 1;
  });
  let peak = null;
  grid.forEach((hours, day) =>
    hours.forEach((count, hour) => {
      if (count > 0 && (!peak || count > peak.count)) peak = { weekday: day, hour, count };
    })
  );

  const payments = groupRows(current.rows, r => r.paymentMethod).map(p => ({ method: p.key, invoices: p.invoices, total: p.total }));
  const topProducts = productLines(current.rows).sort((a, b) => b.revenue - a.revenue).slice(0, 5);

  return {
    range: { from: range.from, to: range.to, days: range.days, previous: { from: range.previous.from, to: range.previous.to } },
    kpis: {
      total: { value: cur.total, previous: prev.total, change: pct(cur.total, prev.total) },
      profit: { value: cur.profit, previous: prev.profit, change: pct(cur.profit, prev.profit) },
      invoices: { value: cur.invoices, previous: prev.invoices, change: pct(cur.invoices, prev.invoices) },
      avgTicket: { value: cur.avgTicket, previous: prev.avgTicket, change: pct(cur.avgTicket, prev.avgTicket) },
      tax: { value: cur.tax, previous: prev.tax, change: pct(cur.tax, prev.tax) },
      discount: { value: cur.discount, previous: prev.discount, change: pct(cur.discount, prev.discount) },
    },
    margin: cur.margin,
    creditNotes: cur.creditNotes,
    granularity: autoGranularity(range.days),
    series: buildSeries(current.rows, range, autoGranularity(range.days)),
    previousSeries: buildSeries(previous.rows, { ...range.previous, days: range.days }, 'day').map(p => p.total),
    payments,
    heatmap: grid,
    peak,
    topProducts,
    warnings: { linesWithoutCost: current.missingCost },
  };
}

/* ------------------------------------------------------------------ */
/* B. Ventas                                                           */
/* ------------------------------------------------------------------ */

export async function getSalesBreakdown({ from, to, groupBy }) {
  const range = resolveRange({ from, to });
  const { rows } = await loadSales(range);
  const granularity = ['day', 'week', 'month'].includes(groupBy) ? groupBy : autoGranularity(range.days);

  const terminals = await prisma.terminal.findMany({ select: { id: true, name: true } });
  const terminalName = new Map(terminals.map(t => [t.id, t.name]));

  const summary = summarize(rows);
  return {
    range: { from: range.from, to: range.to, days: range.days },
    granularity,
    summary,
    discountRate: summary.subtotal > 0 ? round2((summary.discount / summary.subtotal) * 100) : 0,
    series: buildSeries(rows, range, granularity),
    byPayment: groupRows(rows, r => r.paymentMethod).map(p => ({ method: p.key, invoices: p.invoices, total: p.total })),
    byNcf: groupRows(rows, r => r.ncfType).map(p => ({ ncfType: p.key, label: NCF_LABELS[p.key] || p.key, invoices: p.invoices, total: p.total })),
    byTerminal: groupRows(rows, r => r.terminalId || 'none').map(p => ({
      terminalId: p.key,
      terminal: terminalName.get(p.key) || 'Sin caja',
      invoices: p.invoices,
      total: p.total,
    })),
  };
}

/* ------------------------------------------------------------------ */
/* C. Rentabilidad                                                     */
/* ------------------------------------------------------------------ */

export async function getProfitability({ from, to }) {
  const range = resolveRange({ from, to });
  const { rows, missingCost } = await loadSales(range);
  const products = productLines(rows);

  const catMap = new Map();
  products.forEach(p => {
    const e = catMap.get(p.category) || { category: p.category, products: 0, quantity: 0, revenue: 0, cost: 0 };
    e.products += 1;
    e.quantity += p.quantity;
    e.revenue += p.revenue;
    e.cost += p.cost;
    catMap.set(p.category, e);
  });
  const categories = Array.from(catMap.values())
    .map(c => ({ ...c, revenue: round2(c.revenue), cost: round2(c.cost), profit: round2(c.revenue - c.cost), margin: margin(c.revenue - c.cost, c.revenue) }))
    .sort((a, b) => b.profit - a.profit);

  const summary = summarize(rows);
  return {
    range: { from: range.from, to: range.to, days: range.days },
    summary: { revenue: round2(summary.total - summary.tax), cost: summary.cost, profit: summary.profit, margin: summary.margin },
    series: buildSeries(rows, range, autoGranularity(range.days)).map(s => ({ period: s.period, revenue: s.subtotal - s.discount, cost: s.cost, profit: s.profit, margin: s.margin })),
    categories,
    products: products.sort((a, b) => b.profit - a.profit).slice(0, 200),
    // Vendidos pero sin ganancia (precio por debajo del costo o sin costo)
    unprofitable: products.filter(p => p.revenue > 0 && p.profit <= 0).sort((a, b) => a.profit - b.profit).slice(0, 100),
    warnings: { linesWithoutCost: missingCost },
  };
}

/* ------------------------------------------------------------------ */
/* D. Fiscal (ITBIS / NCF)                                             */
/* ------------------------------------------------------------------ */

// B + 2 dígitos + 8 (papel) o E + 2 dígitos + 10 (electrónico)
const NCF_RE = /^([BE]\d{2})(\d{8}|\d{10})$/;

export async function getFiscalReport({ from, to }) {
  const range = resolveRange({ from, to });
  const sales = await prisma.sale.findMany({
    where: { createdAt: { gte: range.gte, lte: range.lte } },
    select: {
      id: true,
      invoiceNumber: true,
      ncfType: true,
      ecfType: true,
      ecfStatus: true,
      customerName: true,
      subtotal: true,
      discount: true,
      tax: true,
      total: true,
      createdAt: true,
      customer: { select: { documentId: true } },
    },
    orderBy: { createdAt: 'asc' },
    take: 10000,
  });

  const byType = new Map();
  let net = { base: 0, tax: 0, total: 0 };
  sales.forEach(s => {
    const base = Number(s.subtotal) - Number(s.discount);
    const kind = s.ecfType || s.ncfType;
    const e = byType.get(kind) || { ncfType: kind, label: NCF_LABELS[kind] || kind, count: 0, base: 0, tax: 0, total: 0 };
    e.count += 1;
    e.base += base;
    e.tax += Number(s.tax);
    e.total += Number(s.total);
    byType.set(kind, e);
    net = { base: net.base + base, tax: net.tax + Number(s.tax), total: net.total + Number(s.total) };
  });

  // Números saltados dentro del período, por tipo de comprobante
  const seqByType = new Map();
  sales.forEach(s => {
    const m = NCF_RE.exec(s.invoiceNumber);
    if (!m) return;
    const entry = seqByType.get(m[1]) || { width: m[2].length, numbers: [] };
    entry.numbers.push(Number(m[2]));
    seqByType.set(m[1], entry);
  });
  const gaps = [];
  seqByType.forEach(({ width, numbers }, type) => {
    const sorted = [...new Set(numbers)].sort((a, b) => a - b);
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i] - sorted[i - 1] > 1) {
        gaps.push({
          ncfType: type,
          from: `${type}${String(sorted[i - 1] + 1).padStart(width, '0')}`,
          to: `${type}${String(sorted[i] - 1).padStart(width, '0')}`,
          missing: sorted[i] - sorted[i - 1] - 1,
        });
      }
    }
  });

  return {
    range: { from: range.from, to: range.to, days: range.days },
    net: { base: round2(net.base), tax: round2(net.tax), total: round2(net.total) },
    byType: Array.from(byType.values()).map(e => ({ ...e, base: round2(e.base), tax: round2(e.tax), total: round2(e.total) })),
    gaps,
    vouchers: sales.map(s => ({
      id: s.id,
      invoiceNumber: s.invoiceNumber,
      ncfType: s.ecfType || s.ncfType,
      ecfStatus: s.ecfStatus || '',
      date: dayKey(s.createdAt),
      customerName: s.customerName,
      documentId: s.customer?.documentId === CONSUMER_DOC ? '' : s.customer?.documentId || '',
      base: round2(Number(s.subtotal) - Number(s.discount)),
      tax: round2(Number(s.tax)),
      total: round2(Number(s.total)),
    })),
    truncated: sales.length >= 10000,
  };
}

/* ------------------------------------------------------------------ */
/* E. Inventario                                                       */
/* ------------------------------------------------------------------ */

export async function getInventoryReport({ deadDays = 60, from, to }) {
  const range = resolveRange({ from, to });
  const now = new Date();
  const since30 = new Date(now.getTime() - 30 * 86400000);
  const sinceDead = new Date(now.getTime() - Number(deadDays) * 86400000);
  const notCredit = { ncfType: { not: CREDIT_NOTE } };

  const [products, sold30, soldDead, adjustments] = await Promise.all([
    prisma.product.findMany({
      where: { active: true },
      select: { id: true, code: true, name: true, stock: true, minStock: true, costPrice: true, salePrice: true, createdAt: true, category: { select: { name: true } } },
    }),
    prisma.saleDetail.groupBy({ by: ['productId'], where: { sale: { createdAt: { gte: since30 }, ...notCredit } }, _sum: { quantity: true } }),
    prisma.saleDetail.groupBy({ by: ['productId'], where: { sale: { createdAt: { gte: sinceDead }, ...notCredit } }, _sum: { quantity: true } }),
    prisma.inventoryLog.findMany({
      where: {
        createdAt: { gte: range.gte, lte: range.lte },
        type: { in: ['SALIDA', 'AJUSTE', 'DEVOLUCION', 'MERMA'] },
        NOT: { reason: { startsWith: 'Venta' } },
      },
      select: { id: true, productId: true, productName: true, type: true, quantity: true, totalCost: true, reason: true, userName: true, createdAt: true, product: { select: { costPrice: true } } },
      orderBy: { createdAt: 'desc' },
      take: 300,
    }),
  ]);

  const velocity = new Map(sold30.map(r => [r.productId, (r._sum.quantity || 0) / 30]));
  const soldRecently = new Set(soldDead.map(r => r.productId));

  let costValue = 0;
  let retailValue = 0;
  let units = 0;
  const cats = new Map();
  const reorder = [];
  const dead = [];
  const fast = [];

  products.forEach(p => {
    const stock = Math.max(0, p.stock);
    const cost = Number(p.costPrice) || 0;
    const price = Number(p.salePrice) || 0;
    costValue += stock * cost;
    retailValue += stock * price;
    units += stock;

    const c = cats.get(p.category?.name || 'Sin categoría') || { category: p.category?.name || 'Sin categoría', products: 0, units: 0, costValue: 0, retailValue: 0 };
    c.products += 1;
    c.units += stock;
    c.costValue += stock * cost;
    c.retailValue += stock * price;
    cats.set(c.category, c);

    const perDay = velocity.get(p.id) || 0;
    const coverDays = perDay > 0 ? round2(stock / perDay) : null;
    if (perDay > 0) fast.push({ id: p.id, code: p.code, name: p.name, stock: p.stock, soldLast30: Math.round(perDay * 30), perDay: round2(perDay), coverDays });

    if (p.stock <= p.minStock || (coverDays !== null && coverDays < 7)) {
      const target = Math.max(p.minStock * 2, Math.ceil(perDay * 30));
      reorder.push({
        id: p.id,
        code: p.code,
        name: p.name,
        category: p.category?.name || '-',
        stock: p.stock,
        minStock: p.minStock,
        soldLast30: Math.round(perDay * 30),
        coverDays,
        suggested: Math.max(0, target - p.stock),
        estimatedCost: round2(Math.max(0, target - p.stock) * cost),
      });
    }

    const isOldEnough = now.getTime() - new Date(p.createdAt).getTime() > Number(deadDays) * 86400000;
    if (stock > 0 && isOldEnough && !soldRecently.has(p.id)) {
      dead.push({ id: p.id, code: p.code, name: p.name, category: p.category?.name || '-', stock, costValue: round2(stock * cost), retailValue: round2(stock * price) });
    }
  });

  reorder.sort((a, b) => (a.coverDays ?? 9999) - (b.coverDays ?? 9999));
  dead.sort((a, b) => b.costValue - a.costValue);
  fast.sort((a, b) => b.perDay - a.perDay);

  return {
    deadDays: Number(deadDays),
    summary: {
      products: products.length,
      units,
      costValue: round2(costValue),
      retailValue: round2(retailValue),
      potentialProfit: round2(retailValue - costValue),
      outOfStock: products.filter(p => p.stock <= 0).length,
      lowStock: products.filter(p => p.stock > 0 && p.stock <= p.minStock).length,
      deadCount: dead.length,
      deadValue: round2(dead.reduce((s, d) => s + d.costValue, 0)),
    },
    byCategory: Array.from(cats.values())
      .map(c => ({ ...c, costValue: round2(c.costValue), retailValue: round2(c.retailValue) }))
      .sort((a, b) => b.costValue - a.costValue),
    reorder: reorder.slice(0, 200),
    dead: dead.slice(0, 200),
    fastMovers: fast.slice(0, 15),
    adjustments: adjustments.map(a => ({
      id: a.id,
      date: a.createdAt,
      productName: a.productName,
      type: a.type,
      quantity: a.quantity,
      reason: a.reason.replace(/^Ajuste:\s*/, ''),
      userName: a.userName,
      cost: a.type === 'MERMA' && a.totalCost != null ? round2(a.totalCost) : a.type === 'SALIDA' || a.type === 'MERMA' ? round2(a.quantity * (Number(a.product?.costPrice) || 0)) : null,
    })),
    range: { from: range.from, to: range.to },
  };
}

/** Movimientos de un producto (kardex). */
export async function getKardex({ productId, from, to }) {
  const range = resolveRange({ from, to });
  const [product, logs] = await Promise.all([
    prisma.product.findUnique({ where: { id: productId }, select: { id: true, code: true, name: true, stock: true, costPrice: true } }),
    prisma.inventoryLog.findMany({
      where: { productId, createdAt: { gte: range.gte, lte: range.lte } },
      orderBy: { createdAt: 'desc' },
      take: 500,
      select: { id: true, type: true, quantity: true, reason: true, userName: true, unitCost: true, supplier: true, createdAt: true },
    }),
  ]);
  return { product, movements: logs };
}

/* ------------------------------------------------------------------ */
/* F. Compras y proveedores                                            */
/* ------------------------------------------------------------------ */

export async function getPurchasesReport({ from, to }) {
  const range = resolveRange({ from, to });
  const logs = await prisma.inventoryLog.findMany({
    where: { createdAt: { gte: range.gte, lte: range.lte }, type: 'ENTRADA', totalCost: { not: null } },
    select: { id: true, productId: true, productName: true, quantity: true, unitCost: true, totalCost: true, supplier: true, supplierId: true, invoiceNumber: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  });

  const suppliers = new Map();
  const productsMap = new Map();
  let total = 0;
  let withoutSupplier = 0;

  logs.forEach(l => {
    const cost = Number(l.totalCost) || 0;
    total += cost;
    const name = l.supplier || 'Sin proveedor';
    if (!l.supplier && !l.supplierId) withoutSupplier += 1;
    const s = suppliers.get(name) || { supplier: name, entries: 0, units: 0, total: 0, lastPurchase: null, products: new Set() };
    s.entries += 1;
    s.units += l.quantity;
    s.total += cost;
    s.products.add(l.productId);
    if (!s.lastPurchase || l.createdAt > s.lastPurchase) s.lastPurchase = l.createdAt;
    suppliers.set(name, s);

    const p = productsMap.get(l.productId) || { productId: l.productId, name: l.productName, units: 0, total: 0, first: null, last: null, purchases: 0 };
    p.units += l.quantity;
    p.total += cost;
    p.purchases += 1;
    const unit = Number(l.unitCost) || 0;
    if (!p.first) p.first = unit;
    p.last = unit;
    productsMap.set(l.productId, p);
  });

  const supplierRows = Array.from(suppliers.values())
    .map(s => ({ supplier: s.supplier, entries: s.entries, units: s.units, total: round2(s.total), products: s.products.size, lastPurchase: s.lastPurchase, share: total > 0 ? round2((s.total / total) * 100) : 0 }))
    .sort((a, b) => b.total - a.total);

  const productRows = Array.from(productsMap.values()).map(p => ({
    productId: p.productId,
    name: p.name,
    units: p.units,
    total: round2(p.total),
    purchases: p.purchases,
    firstCost: round2(p.first || 0),
    lastCost: round2(p.last || 0),
    costChange: p.purchases > 1 && p.first > 0 ? round2(((p.last - p.first) / p.first) * 100) : null,
  }));

  const series = new Map();
  for (let i = 0; i < range.days && range.days <= 62; i++) series.set(addDays(range.from, i), 0);
  logs.forEach(l => {
    const key = range.days <= 62 ? dayKey(l.createdAt) : monthKey(l.createdAt);
    series.set(key, (series.get(key) || 0) + (Number(l.totalCost) || 0));
  });

  return {
    range: { from: range.from, to: range.to, days: range.days },
    summary: { total: round2(total), entries: logs.length, suppliers: suppliers.size, withoutSupplier },
    series: Array.from(series.entries()).sort(([a], [b]) => (a < b ? -1 : 1)).map(([period, value]) => ({ period, total: round2(value) })),
    suppliers: supplierRows,
    products: productRows.sort((a, b) => b.total - a.total).slice(0, 200),
    costIncreases: productRows.filter(p => p.costChange !== null && p.costChange > 0).sort((a, b) => b.costChange - a.costChange).slice(0, 20),
  };
}

/* ------------------------------------------------------------------ */
/* G. Cajas y cierres                                                  */
/* ------------------------------------------------------------------ */

export async function getCashReport({ from, to }) {
  const range = resolveRange({ from, to });
  const closes = await prisma.cashierClose.findMany({
    where: { openedAt: { gte: range.gte, lte: range.lte } },
    select: {
      id: true,
      openedAt: true,
      closedAt: true,
      openingBalance: true,
      expectedCash: true,
      declaredCash: true,
      difference: true,
      status: true,
      terminal: { select: { id: true, name: true } },
      user: { select: { id: true, fullName: true } },
    },
    orderBy: { openedAt: 'desc' },
  });

  const closed = closes.filter(c => c.status === 'CLOSED' && c.difference !== null);
  const group = keyFn => {
    const map = new Map();
    closed.forEach(c => {
      const k = keyFn(c);
      const e = map.get(k) || { name: k, closes: 0, difference: 0, shortages: 0, overages: 0, exact: 0 };
      e.closes += 1;
      const diff = Number(c.difference);
      e.difference += diff;
      if (Math.abs(diff) < 0.005) e.exact += 1;
      else if (diff < 0) e.shortages += 1;
      else e.overages += 1;
      map.set(k, e);
    });
    return Array.from(map.values()).map(e => ({ ...e, difference: round2(e.difference) })).sort((a, b) => a.difference - b.difference);
  };

  const totalShort = closed.reduce((s, c) => s + Math.min(0, Number(c.difference)), 0);
  const totalOver = closed.reduce((s, c) => s + Math.max(0, Number(c.difference)), 0);

  return {
    range: { from: range.from, to: range.to, days: range.days },
    summary: {
      closes: closes.length,
      open: closes.filter(c => c.status === 'OPEN').length,
      closed: closed.length,
      shortage: round2(totalShort),
      overage: round2(totalOver),
      net: round2(totalShort + totalOver),
      exact: closed.filter(c => Math.abs(Number(c.difference)) < 0.005).length,
    },
    byCashier: group(c => c.user?.fullName || 'Sin cajero'),
    byTerminal: group(c => c.terminal?.name || 'Sin caja'),
    closes: closes.map(c => ({
      id: c.id,
      openedAt: c.openedAt,
      closedAt: c.closedAt,
      terminal: c.terminal?.name || '-',
      cashier: c.user?.fullName || '-',
      openingBalance: round2(Number(c.openingBalance) || 0),
      expectedCash: c.expectedCash === null ? null : round2(Number(c.expectedCash)),
      declaredCash: c.declaredCash === null ? null : round2(Number(c.declaredCash)),
      difference: c.difference === null ? null : round2(Number(c.difference)),
      status: c.status,
    })),
  };
}

/* ------------------------------------------------------------------ */
/* H. Clientes                                                         */
/* ------------------------------------------------------------------ */

export async function getCustomerInsights({ from, to, inactiveDays = 60 }) {
  const range = resolveRange({ from, to });
  const today = dayKey(new Date());
  const notCredit = { ncfType: { not: CREDIT_NOTE } };

  const [allTime, inRange, registered] = await Promise.all([
    prisma.sale.groupBy({ by: ['customerId'], where: notCredit, _count: { _all: true }, _sum: { total: true }, _min: { createdAt: true }, _max: { createdAt: true } }),
    prisma.sale.groupBy({ by: ['customerId'], where: { ...notCredit, createdAt: { gte: range.gte, lte: range.lte } }, _count: { _all: true }, _sum: { total: true } }),
    prisma.customer.count({ where: { createdAt: { gte: range.gte, lte: range.lte } } }),
  ]);

  const allMap = new Map(allTime.map(r => [r.customerId, r]));
  const consumer = await prisma.customer.findFirst({ where: { documentId: CONSUMER_DOC }, select: { id: true } });
  const isConsumer = id => consumer && id === consumer.id;

  let newRev = 0;
  let recRev = 0;
  let newCount = 0;
  let recCount = 0;
  let anonymous = 0;
  const newIds = [];
  inRange.forEach(r => {
    if (isConsumer(r.customerId)) {
      anonymous += r._sum.total || 0;
      return;
    }
    const first = allMap.get(r.customerId)?._min.createdAt;
    if (first && first >= range.gte) {
      newCount += 1;
      newRev += r._sum.total || 0;
      newIds.push(r.customerId);
    } else {
      recCount += 1;
      recRev += r._sum.total || 0;
    }
  });

  const cutoff = startOfDayUtc(addDays(today, -Number(inactiveDays)));
  const inactiveRaw = allTime
    .filter(r => !isConsumer(r.customerId) && r._max.createdAt < cutoff)
    .sort((a, b) => (b._sum.total || 0) - (a._sum.total || 0))
    .slice(0, 100);

  const ids = [...new Set([...inactiveRaw.map(r => r.customerId), ...newIds.slice(0, 50)])];
  const customers = await prisma.customer.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, documentId: true, phone: true } });
  const byId = new Map(customers.map(c => [c.id, c]));

  return {
    range: { from: range.from, to: range.to, days: range.days },
    inactiveDays: Number(inactiveDays),
    summary: {
      active: newCount + recCount,
      newCustomers: newCount,
      recurring: recCount,
      newRevenue: round2(newRev),
      recurringRevenue: round2(recRev),
      anonymousRevenue: round2(anonymous),
      registered,
      inactive: allTime.filter(r => !isConsumer(r.customerId) && r._max.createdAt < cutoff).length,
    },
    inactive: inactiveRaw.map(r => ({
      customerId: r.customerId,
      name: byId.get(r.customerId)?.name || 'Cliente',
      documentId: byId.get(r.customerId)?.documentId || '-',
      phone: byId.get(r.customerId)?.phone || '',
      orders: r._count._all,
      totalSpent: round2(r._sum.total || 0),
      lastPurchase: r._max.createdAt,
      daysSince: diffDays(dayKey(r._max.createdAt), today),
    })),
    newList: newIds.slice(0, 50).map(id => ({
      customerId: id,
      name: byId.get(id)?.name || 'Cliente',
      documentId: byId.get(id)?.documentId || '-',
      orders: inRange.find(r => r.customerId === id)?._count._all || 0,
      totalSpent: round2(inRange.find(r => r.customerId === id)?._sum.total || 0),
    })),
  };
}
