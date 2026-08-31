import { prisma } from '../../config/db.js';
import { round2 } from '../../shared/utils/helpers.js';
import { TAX_RATE } from '@salespro/shared/constants.js';

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
      select: { total: true, createdAt: true, details: { select: { productId: true, productName: true, quantity: true, subtotal: true } } },
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

  if (startDate || endDate) {
    where.createdAt = {};
    if (startDate) where.createdAt.gte = new Date(startDate);
    if (endDate) where.createdAt.lte = new Date(endDate);
  }
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

  if (startDate || endDate) {
    where.sale = {};
    if (startDate) where.sale.createdAt = { ...where.sale.createdAt, gte: new Date(startDate) };
    if (endDate) where.sale.createdAt = { ...where.sale.createdAt, lte: new Date(endDate) };
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
    entry.cost += Number(d.product.costPrice) * d.quantity;
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

  if (startDate || endDate) {
    where.createdAt = {};
    if (startDate) where.createdAt.gte = new Date(startDate);
    if (endDate) where.createdAt.lte = new Date(endDate);
  }

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
 * Get tax report (ITBIS)
 */
export async function getTaxReport({ startDate, endDate }) {
  const where = {};

  if (startDate || endDate) {
    where.createdAt = {};
    if (startDate) where.createdAt.gte = new Date(startDate);
    if (endDate) where.createdAt.lte = new Date(endDate);
  }

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