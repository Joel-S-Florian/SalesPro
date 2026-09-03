import { prisma } from '../../config/db.js';
import { round2, applyCreatedAtRange } from '../../shared/utils/helpers.js';
import { TAX_RATE } from '../../../../../packages/shared/constants.js';

/**
 * Get dashboard statistics
 */
export async function getDashboardStats() {
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();

  const [allSales, allProducts, allCustomers] = await Promise.all([
    prisma.sale.findMany({
      select: { id: true, invoiceNumber: true, customerName: true, total: true, paymentMethod: true, createdAt: true, details: { select: { productId: true, productName: true, quantity: true, subtotal: true } } },
    }),
    prisma.product.findMany({
      where: { active: true },
      select: { id: true, name: true, stock: true, minStock: true, costPrice: true, salePrice: true },
    }),
    prisma.customer.count(),
  ]);

  let salesToday = 0, revenueToday = 0;
  let salesMonth = 0, revenueMonth = 0;

  allSales.forEach(s => {
    const saleDate = s.createdAt instanceof Date ? s.createdAt : new Date(s.createdAt);
    const saleDateStr = saleDate.toISOString().split('T')[0];

    if (saleDateStr === todayStr) {
      salesToday += 1;
      revenueToday += Number(s.total);
    }

    if (saleDate.getMonth() === currentMonth && saleDate.getFullYear() === currentYear) {
      salesMonth += 1;
      revenueMonth += Number(s.total);
    }
  });

  const lowStockProducts = allProducts
    .filter(p => p.stock <= p.minStock)
    .map(p => ({ id: p.id, name: p.name, stock: p.stock, minStock: p.minStock }));

  // Top selling products
  const salesMap = new Map();
  allSales.forEach(s => {
    s.details.forEach(d => {
      const entry = salesMap.get(d.productName) || { quantity: 0, revenue: 0 };
      entry.quantity += d.quantity;
      entry.revenue += Number(d.subtotal);
      salesMap.set(d.productName, entry);
    });
  });

  const topSellingProducts = Array.from(salesMap.entries())
    .map(([name, stat]) => ({ name, quantity: stat.quantity, revenue: round2(stat.revenue) }))
    .sort((a, b) => b.quantity - a.quantity)
    .slice(0, 5);

  // Recent sales
  const recentSales = [...allSales]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 5)
    .map(s => ({
      id: s.id,
      invoiceNumber: s.invoiceNumber,
      customerName: s.customerName,
      total: Number(s.total),
      paymentMethod: s.paymentMethod,
      createdAt: s.createdAt,
    }));

  // Sales by day (last 7 days)
  const last7Days = {};
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(now.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];
    last7Days[dateStr] = { amount: 0, count: 0 };
  }

  allSales.forEach(s => {
    const saleDate = s.createdAt instanceof Date ? s.createdAt : new Date(s.createdAt);
    const dateStr = saleDate.toISOString().split('T')[0];
    if (last7Days[dateStr] !== undefined) {
      last7Days[dateStr].amount += Number(s.total);
      last7Days[dateStr].count += 1;
    }
  });

  const salesByDay = Object.entries(last7Days).map(([day, stat]) => {
    const [y, m, d] = day.split('-');
    return {
      day: `${d}/${m}`,
      amount: round2(stat.amount),
      count: stat.count,
    };
  });

  return {
    salesToday,
    salesMonth,
    revenueToday: round2(revenueToday),
    revenueMonth: round2(revenueMonth),
    totalProducts: allProducts.length,
    totalCustomers: allCustomers,
    lowStockCount: lowStockProducts.length,
    lowStockProducts,
    topSellingProducts,
    recentSales,
    salesByDay,
  };
}

/**
 * Get sales report with filters
 */
export async function getSalesReport({ startDate, endDate, customerId, userId, paymentMethod, groupBy = 'day' }) {
  const where = {};

  applyCreatedAtRange(where, startDate, endDate);
  if (customerId) where.customerId = customerId;
  if (userId) where.userId = userId;
  if (paymentMethod) where.paymentMethod = paymentMethod;

  const sales = await prisma.sale.findMany({
    where,
    include: {
      customer: { select: { id: true, name: true, documentId: true } },
      user: { select: { id: true, fullName: true } },
      details: {
        include: { product: { select: { id: true, code: true, name: true, costPrice: true } } },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  // Group by period
  const grouped = {};
  sales.forEach(s => {
    const date = new Date(s.createdAt);
    let key;
    switch (groupBy) {
      case 'day': key = date.toISOString().split('T')[0]; break;
      case 'week': key = `${date.getFullYear()}-W${String(Math.ceil(date.getDate() / 7)).padStart(2, '0')}`; break;
      case 'month': key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`; break;
      default: key = date.toISOString().split('T')[0];
    }

    if (!grouped[key]) {
      grouped[key] = { count: 0, subtotal: 0, tax: 0, discount: 0, total: 0 };
    }
    grouped[key].count += 1;
    grouped[key].subtotal += Number(s.subtotal);
    grouped[key].tax += Number(s.tax);
    grouped[key].discount += Number(s.discount);
    grouped[key].total += Number(s.total);
  });

  return Object.entries(grouped).map(([period, stats]) => ({
    period,
    ...stats,
    subtotal: round2(stats.subtotal),
    tax: round2(stats.tax),
    discount: round2(stats.discount),
    total: round2(stats.total),
  }));
}

/**
 * Get product sales report
 */
export async function getProductSalesReport({ startDate, endDate, categoryId, limit = 20 }) {
  const where = {};

  const saleDateRange = {};
  applyCreatedAtRange(saleDateRange, startDate, endDate);
  if (saleDateRange.createdAt) {
    where.sale = { createdAt: saleDateRange.createdAt };
  }

  if (categoryId) {
    where.product = { categoryId };
  }

  const details = await prisma.saleDetail.findMany({
    where,
    include: {
      product: { select: { id: true, code: true, name: true, costPrice: true, category: { select: { name: true } } } },
      sale: { select: { createdAt: true } },
    },
  });

  const productMap = new Map();
  details.forEach(d => {
    const key = d.productId;
    const entry = productMap.get(key) || {
      product: d.product,
      quantity: 0,
      revenue: 0,
      cost: 0,
    };
    entry.quantity += d.quantity;
    entry.revenue += Number(d.subtotal);
    entry.cost += Number(d.unitCost ?? d.product.costPrice) * d.quantity;
    productMap.set(key, entry);
  });

  return Array.from(productMap.values())
    .map(p => ({
      ...p,
      revenue: round2(p.revenue),
      cost: round2(p.cost),
      profit: round2(p.revenue - p.cost),
      margin: p.revenue > 0 ? round2(((p.revenue - p.cost) / p.revenue) * 100) : 0,
    }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, limit);
}

/**
 * Get customer sales report
 */
export async function getCustomerSalesReport({ startDate, endDate, limit = 20 }) {
  const where = {};

  applyCreatedAtRange(where, startDate, endDate);

  const sales = await prisma.sale.findMany({
    where,
    include: {
      customer: { select: { id: true, name: true, documentId: true } },
    },
  });

  const customerMap = new Map();
  sales.forEach(s => {
    const key = s.customerId;
    const entry = customerMap.get(key) || {
      customer: s.customer,
      orders: 0,
      totalSpent: 0,
      lastPurchase: null,
    };
    entry.orders += 1;
    entry.totalSpent += Number(s.total);
    if (!entry.lastPurchase || new Date(s.createdAt) > new Date(entry.lastPurchase)) {
      entry.lastPurchase = s.createdAt;
    }
    customerMap.set(key, entry);
  });

  return Array.from(customerMap.values())
    .map(c => ({
      ...c,
      totalSpent: round2(c.totalSpent),
    }))
    .sort((a, b) => b.totalSpent - a.totalSpent)
    .slice(0, limit);
}

/**
 * Get low stock alert
 */
export async function getLowStockAlert() {
  const products = await prisma.product.findMany({
    where: { active: true },
    select: {
      id: true,
      code: true,
      name: true,
      stock: true,
      minStock: true,
      category: { select: { name: true } },
    },
    orderBy: { stock: 'asc' },
  });

  return products
    .filter(p => p.stock <= p.minStock)
    .map(p => ({
      ...p,
      deficit: p.minStock - p.stock,
    }));
}

/**
 * Get tax report (ITBIS)
 */
export async function getTaxReport({ startDate, endDate }) {
  const where = {};

  applyCreatedAtRange(where, startDate, endDate);

  const sales = await prisma.sale.findMany({
    where,
    select: { subtotal: true, tax: true, discount: true, total: true, createdAt: true },
  });

  const totalSubtotal = sales.reduce((sum, s) => sum + Number(s.subtotal), 0);
  const totalTax = sales.reduce((sum, s) => sum + Number(s.tax), 0);
  const totalDiscount = sales.reduce((sum, s) => sum + Number(s.discount), 0);
  const totalSales = sales.reduce((sum, s) => sum + Number(s.total), 0);

  return {
    period: { startDate, endDate },
    totalSales: round2(totalSales),
    totalSubtotal: round2(totalSubtotal),
    totalDiscount: round2(totalDiscount),
    taxableBase: round2(totalSubtotal - totalDiscount),
    totalTax: round2(totalTax),
    taxRate: TAX_RATE * 100,
    salesCount: sales.length,
  };
}

function buildSaleDetailWhere({ from, to, categoryId }) {
  const where = {};
  const saleRange = {};
  applyCreatedAtRange(saleRange, from, to);
  if (saleRange.createdAt) {
    where.sale = { createdAt: saleRange.createdAt };
  }
  if (categoryId) {
    where.product = { categoryId };
  }
  return where;
}

async function getProductAggregates({ from, to, categoryId }) {
  const details = await prisma.saleDetail.findMany({
    where: buildSaleDetailWhere({ from, to, categoryId }),
    include: {
      product: { select: { id: true, code: true, name: true, costPrice: true, category: { select: { id: true, name: true } } } },
      sale: { select: { createdAt: true } },
    },
  });

  const map = new Map();
  details.forEach(d => {
    const entry = map.get(d.productId) || {
      productId: d.productId,
      code: d.product?.code || '-',
      name: d.productName || d.product?.name || 'Producto',
      category: d.product?.category?.name || '-',
      quantity: 0,
      revenue: 0,
      cost: 0,
    };
    entry.quantity += d.quantity;
    entry.revenue += Number(d.subtotal);
    entry.cost += Number(d.unitCost ?? d.product?.costPrice ?? 0) * d.quantity;
    map.set(d.productId, entry);
  });

  return Array.from(map.values()).map(p => ({
    ...p,
    revenue: round2(p.revenue),
    cost: round2(p.cost),
    profit: round2(p.revenue - p.cost),
    margin: p.revenue > 0 ? round2(((p.revenue - p.cost) / p.revenue) * 100) : 0,
  }));
}

/**
 * Top selling products by quantity
 */
export async function getTopSoldProducts({ from, to, categoryId, limit = 10 }) {
  const rows = await getProductAggregates({ from, to, categoryId });
  const sorted = rows.sort((a, b) => b.quantity - a.quantity).slice(0, limit);
  return {
    totalSold: rows.reduce((sum, r) => sum + r.quantity, 0),
    topProduct: sorted[0] || null,
    data: sorted,
  };
}

/**
 * Most profitable products by gross profit
 */
export async function getMostProfitableProducts({ from, to, categoryId, limit = 10 }) {
  const rows = await getProductAggregates({ from, to, categoryId });
  const sorted = rows.sort((a, b) => b.profit - a.profit).slice(0, limit);
  const avgMargin = rows.length > 0
    ? round2(rows.reduce((sum, r) => sum + r.margin, 0) / rows.length)
    : 0;
  return {
    mostProfitable: sorted[0] || null,
    averageMargin: avgMargin,
    data: sorted,
  };
}

/**
 * Products with lowest margin (below threshold)
 */
export async function getLowMarginProducts({ from, to, minMargin = 20 }) {
  const rows = await getProductAggregates({ from, to });
  return rows
    .filter(r => r.margin < Number(minMargin))
    .sort((a, b) => a.margin - b.margin);
}

/**
 * Product performance grouped by category
 */
export async function getProductsByCategory({ from, to }) {
  const rows = await getProductAggregates({ from, to });
  const map = new Map();
  rows.forEach(r => {
    const entry = map.get(r.category) || { category: r.category, quantity: 0, revenue: 0, profit: 0, products: 0 };
    entry.quantity += r.quantity;
    entry.revenue += r.revenue;
    entry.profit += r.profit;
    entry.products += 1;
    map.set(r.category, entry);
  });
  return Array.from(map.values())
    .map(c => ({
      ...c,
      revenue: round2(c.revenue),
      profit: round2(c.profit),
      margin: c.revenue > 0 ? round2((c.profit / c.revenue) * 100) : 0,
    }))
    .sort((a, b) => b.revenue - a.revenue);
}

function buildSaleWhere({ from, to, userId, paymentMethod }) {
  const where = {};
  applyCreatedAtRange(where, from, to);
  if (userId) where.userId = userId;
  if (paymentMethod) where.paymentMethod = paymentMethod;
  return where;
}

async function getCustomerAggregates({ from, to, docType, search }) {
  const where = {};
  applyCreatedAtRange(where, from, to);

  const sales = await prisma.sale.findMany({
    where,
    include: {
      customer: { select: { id: true, name: true, documentId: true, createdAt: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  const map = new Map();
  sales.forEach(s => {
    if (!s.customerId) return;
    const doc = s.customer?.documentId || '';
    const digits = doc.replace(/\D/g, '');
    const type = digits.length === 9 ? 'RNC' : digits.length === 11 ? 'CEDULA' : 'OTRO';
    if (docType && type !== docType) return;
    if (search) {
      const q = search.toLowerCase();
      const hay = `${s.customer?.name || ''} ${doc}`.toLowerCase();
      if (!hay.includes(q)) return;
    }
    const entry = map.get(s.customerId) || {
      customerId: s.customerId,
      name: s.customer?.name || 'Cliente Desconocido',
      documentId: doc || '-',
      documentType: type,
      orders: 0,
      totalSpent: 0,
      lastPurchase: null,
      firstPurchase: null,
    };
    entry.orders += 1;
    entry.totalSpent += Number(s.total);
    if (!entry.lastPurchase || new Date(s.createdAt) > new Date(entry.lastPurchase)) {
      entry.lastPurchase = s.createdAt;
    }
    if (!entry.firstPurchase || new Date(s.createdAt) < new Date(entry.firstPurchase)) {
      entry.firstPurchase = s.createdAt;
    }
    map.set(s.customerId, entry);
  });

  return Array.from(map.values()).map(c => ({
    ...c,
    totalSpent: round2(c.totalSpent),
    averageTicket: c.orders > 0 ? round2(c.totalSpent / c.orders) : 0,
  }));
}

/**
 * Top customers by total amount
 */
export async function getTopCustomersByAmount({ from, to, docType, search, limit = 10 }) {
  const rows = await getCustomerAggregates({ from, to, docType, search });
  const sorted = rows.sort((a, b) => b.totalSpent - a.totalSpent).slice(0, limit);
  return {
    uniqueCustomers: rows.length,
    topCustomer: sorted[0] || null,
    averageTicket: rows.length > 0
      ? round2(rows.reduce((sum, r) => sum + r.totalSpent, 0) / rows.reduce((sum, r) => sum + r.orders, 0))
      : 0,
    data: sorted,
  };
}

/**
 * Top customers by purchase frequency
 */
export async function getTopCustomersByFrequency({ from, to, docType, search, limit = 10 }) {
  const rows = await getCustomerAggregates({ from, to, docType, search });
  return rows.sort((a, b) => b.orders - a.orders).slice(0, limit);
}

/**
 * Purchase history for a specific customer
 */
export async function getCustomerHistory(customerId, { from, to } = {}) {
  const where = { customerId };
  applyCreatedAtRange(where, from, to);

  const [customer, sales] = await Promise.all([
    prisma.customer.findUnique({ where: { id: customerId } }),
    prisma.sale.findMany({
      where,
      include: {
        user: { select: { fullName: true } },
        details: { include: { product: { select: { name: true } } } },
      },
      orderBy: { createdAt: 'desc' },
    }),
  ]);

  if (!customer) {
    const { AppError } = await import('../../shared/exceptions/AppError.js');
    throw AppError.notFound('Cliente no encontrado');
  }

  return {
    customer,
    totalSpent: round2(sales.reduce((sum, s) => sum + Number(s.total), 0)),
    orders: sales.length,
    sales: sales.map(s => ({
      id: s.id,
      invoiceNumber: s.invoiceNumber,
      total: Number(s.total),
      paymentMethod: s.paymentMethod,
      sellerName: s.user?.fullName || s.userName,
      createdAt: s.createdAt,
      items: s.details.length,
    })),
  };
}

/**
 * Staff performance (sales by user/cashier)
 */
export async function getStaffPerformance({ from, to, userId, paymentMethod }) {
  const sales = await prisma.sale.findMany({
    where: buildSaleWhere({ from, to, userId, paymentMethod }),
    include: { user: { select: { id: true, username: true, fullName: true } } },
  });

  const map = new Map();
  sales.forEach(s => {
    const key = s.userId;
    const entry = map.get(key) || {
      userId: s.userId,
      username: s.user?.username || '-',
      fullName: s.user?.fullName || s.userName,
      transactions: 0,
      total: 0,
    };
    entry.transactions += 1;
    entry.total += Number(s.total);
    map.set(key, entry);
  });

  const rows = Array.from(map.values()).map(r => ({
    ...r,
    total: round2(r.total),
    averageTicket: r.transactions > 0 ? round2(r.total / r.transactions) : 0,
  })).sort((a, b) => b.total - a.total);

  return {
    bestPerformer: rows[0] || null,
    totalTransactions: sales.length,
    data: rows,
  };
}

/**
 * Payment methods breakdown by staff
 */
export async function getStaffPaymentMethods({ from, to, userId }) {
  const sales = await prisma.sale.findMany({
    where: buildSaleWhere({ from, to, userId }),
    select: { userId: true, paymentMethod: true, total: true, createdAt: true },
  });

  const byUser = new Map();
  sales.forEach(s => {
    const entry = byUser.get(s.userId) || { userId: s.userId, EFECTIVO: 0, TARJETA: 0, cashCount: 0, cardCount: 0 };
    if (s.paymentMethod === 'EFECTIVO') {
      entry.EFECTIVO += Number(s.total);
      entry.cashCount += 1;
    } else {
      entry.TARJETA += Number(s.total);
      entry.cardCount += 1;
    }
    byUser.set(s.userId, entry);
  });

  const users = await prisma.user.findMany({
    where: { id: { in: Array.from(byUser.keys()) } },
    select: { id: true, username: true, fullName: true },
  });
  const userMap = new Map(users.map(u => [u.id, u]));

  const byHour = {};
  sales.forEach(s => {
    const hour = new Date(s.createdAt).getHours();
    const key = `${String(hour).padStart(2, '0')}:00`;
    byHour[key] = (byHour[key] || 0) + 1;
  });
  const peakHours = Object.entries(byHour)
    .map(([hour, count]) => ({ hour, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  return {
    byUser: Array.from(byUser.entries()).map(([userId, stats]) => ({
      userId,
      username: userMap.get(userId)?.username || '-',
      fullName: userMap.get(userId)?.fullName || '-',
      cashTotal: round2(stats.EFECTIVO),
      cardTotal: round2(stats.TARJETA),
      cashCount: stats.cashCount,
      cardCount: stats.cardCount,
      total: round2(stats.EFECTIVO + stats.TARJETA),
    })),
    peakHours,
  };
}