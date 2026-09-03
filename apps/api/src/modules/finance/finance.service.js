import { prisma } from '../../config/db.js';
import { round2, applyCreatedAtRange } from '../../shared/utils/helpers.js';

export async function getCashflow({ from, to } = {}) {
  const where = {};
  applyCreatedAtRange(where, from, to);

  const [sales, purchases] = await Promise.all([
    prisma.sale.findMany({
      where,
      select: { id: true, invoiceNumber: true, total: true, paymentMethod: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.inventoryLog.findMany({
      where: {
        ...where,
        type: 'ENTRADA',
        totalCost: { not: null, gt: 0 },
      },
      select: { id: true, supplier: true, totalCost: true, invoiceNumber: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    }),
  ]);

  const transactions = [
    ...sales.map(s => ({
      id: `sale-${s.id}`,
      type: 'INCOME',
      source: `Venta ${s.invoiceNumber}`,
      amount: Number(s.total),
      date: s.createdAt,
      method: s.paymentMethod,
    })),
    ...purchases.map(p => ({
      id: `purchase-${p.id}`,
      type: 'EXPENSE',
      source: `Compra - ${p.supplier || 'Proveedor'}`,
      amount: Number(p.totalCost),
      date: p.createdAt,
      invoiceNumber: p.invoiceNumber,
    })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const income = sales.reduce((sum, s) => sum + Number(s.total), 0);
  const expenses = purchases.reduce((sum, p) => sum + Number(p.totalCost), 0);

  return {
    summary: {
      income: round2(income),
      expenses: round2(expenses),
      balance: round2(income - expenses),
    },
    transactions,
  };
}
