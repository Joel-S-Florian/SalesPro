import express from 'express';
import { z } from 'zod';
import ExcelJS from 'exceljs';
import * as reportsController from './reports.controller.js';
import * as analytics from './analytics.service.js';
import * as food from './food.service.js';
import { authenticate } from '../../shared/middleware/auth.js';
import { authorize } from '../../shared/middlewares/authorize.js';
import { validate } from '../../shared/middleware/validate.js';
import { asyncHandler } from '../../shared/utils/asyncHandler.js';
import { basePrisma } from '../../config/db.js';
import { getTenantId } from '../../config/tenant.js';

const router = express.Router();

/**
 * @route GET /api/reports/dashboard
 * @description Get dashboard statistics
 * @access Private (Admin)
 */
router.get('/dashboard', authenticate, authorize('ADMINISTRADOR'), reportsController.getDashboard);

/**
 * @route GET /api/reports/sales
 * @description Get sales report with filters
 * @access Private (Admin)
 */
router.get('/sales', authenticate, authorize('ADMINISTRADOR'), reportsController.getSalesReport);

/**
 * @route GET /api/reports/products
 * @description Get product sales report
 * @access Private (Admin)
 */
router.get('/products', authenticate, authorize('ADMINISTRADOR'), reportsController.getProductSalesReport);

/**
 * @route GET /api/reports/customers
 * @description Get customer sales report
 * @access Private (Admin)
 */
router.get('/customers', authenticate, authorize('ADMINISTRADOR'), reportsController.getCustomerSalesReport);

/**
 * @route GET /api/reports/tax
 * @description Get tax report (ITBIS)
 * @access Private (Admin)
 */
router.get('/tax', authenticate, authorize('ADMINISTRADOR'), reportsController.getTaxReport);

/**
 * @route GET /api/reports/low-stock
 * @description Get low stock alert
 * @access Private (Admin)
 */
router.get('/low-stock', authenticate, authorize('ADMINISTRADOR'), reportsController.getLowStockAlert);

/**
 * @route GET /api/reports/products/top-sold
 * @description Top selling products by quantity
 * @access Private (Admin)
 */
router.get('/products/top-sold', authenticate, authorize('ADMINISTRADOR'), reportsController.getTopSoldProducts);

/**
 * @route GET /api/reports/products/most-profitable
 * @description Most profitable products by gross profit
 * @access Private (Admin)
 */
router.get('/products/most-profitable', authenticate, authorize('ADMINISTRADOR'), reportsController.getMostProfitableProducts);

/**
 * @route GET /api/reports/products/low-margin
 * @description Products below margin threshold
 * @access Private (Admin)
 */
router.get('/products/low-margin', authenticate, authorize('ADMINISTRADOR'), reportsController.getLowMarginProducts);

/**
 * @route GET /api/reports/products/by-category
 * @description Product performance grouped by category
 * @access Private (Admin)
 */
router.get('/products/by-category', authenticate, authorize('ADMINISTRADOR'), reportsController.getProductsByCategory);

/**
 * @route GET /api/reports/customers/top-by-amount
 * @description Top customers by total spent
 * @access Private (Admin)
 */
router.get('/customers/top-by-amount', authenticate, authorize('ADMINISTRADOR'), reportsController.getTopCustomersByAmount);

/**
 * @route GET /api/reports/customers/top-by-frequency
 * @description Top customers by purchase frequency
 * @access Private (Admin)
 */
router.get('/customers/top-by-frequency', authenticate, authorize('ADMINISTRADOR'), reportsController.getTopCustomersByFrequency);

/**
 * @route GET /api/reports/customers/:id/history
 * @description Purchase history for a specific customer
 * @access Private (Admin)
 */
router.get('/customers/:id/history', authenticate, authorize('ADMINISTRADOR'), reportsController.getCustomerHistory);

/**
 * @route GET /api/reports/staff/performance
 * @description Sales performance by cashier/user
 * @access Private (Admin)
 */
router.get('/staff/performance', authenticate, authorize('ADMINISTRADOR'), reportsController.getStaffPerformance);

/**
 * @route GET /api/reports/staff/payment-methods
 * @description Payment method breakdown by cashier plus peak hours
 * @access Private (Admin)
 */
router.get('/staff/payment-methods', authenticate, authorize('ADMINISTRADOR'), reportsController.getStaffPaymentMethods);

/* ---- Reportes analíticos (resumen, ventas, rentabilidad, fiscal, inventario, compras, cajas, clientes) ---- */
const rangeQuery = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});
const admin = [authenticate, authorize('ADMINISTRADOR')];

router.get('/overview', ...admin, validate({ query: rangeQuery }), asyncHandler(async (req, res) => {
  res.json(await analytics.getOverview(req.query));
}));

router.get('/sales-breakdown', ...admin, validate({ query: rangeQuery.extend({ groupBy: z.enum(['day', 'week', 'month']).optional() }) }), asyncHandler(async (req, res) => {
  res.json(await analytics.getSalesBreakdown(req.query));
}));

router.get('/profitability', ...admin, validate({ query: rangeQuery }), asyncHandler(async (req, res) => {
  res.json(await analytics.getProfitability(req.query));
}));

router.get('/fiscal', ...admin, validate({ query: rangeQuery }), asyncHandler(async (req, res) => {
  res.json(await analytics.getFiscalReport(req.query));
}));

router.get('/inventory', ...admin, validate({ query: rangeQuery.extend({ deadDays: z.coerce.number().int().min(7).max(365).default(60) }) }), asyncHandler(async (req, res) => {
  res.json(await analytics.getInventoryReport(req.query));
}));

router.get('/expiry', ...admin, validate({ query: rangeQuery }), asyncHandler(async (req, res) => {
  res.json(await food.getExpiryReport(req.query));
}));

router.get('/bulk', ...admin, validate({ query: rangeQuery }), asyncHandler(async (req, res) => {
  res.json(await food.getBulkReport(req.query));
}));

router.get('/kardex/:productId', ...admin, validate({ query: rangeQuery }), asyncHandler(async (req, res) => {
  res.json(await analytics.getKardex({ productId: req.params.productId, ...req.query }));
}));

router.get('/purchases', ...admin, validate({ query: rangeQuery }), asyncHandler(async (req, res) => {
  res.json(await analytics.getPurchasesReport(req.query));
}));

router.get('/cash', ...admin, validate({ query: rangeQuery }), asyncHandler(async (req, res) => {
  res.json(await analytics.getCashReport(req.query));
}));

router.get('/customer-insights', ...admin, validate({ query: rangeQuery.extend({ inactiveDays: z.coerce.number().int().min(7).max(730).default(60) }) }), asyncHandler(async (req, res) => {
  res.json(await analytics.getCustomerInsights(req.query));
}));

/** Excel real (.xlsx): el navegador envía lo que está viendo y recibe el archivo con formato. */
const exportSchema = z.object({
  title: z.string().min(1).max(120),
  subtitle: z.string().max(200).optional(),
  columns: z.array(z.object({
    key: z.string().min(1).max(60),
    label: z.string().min(1).max(80),
    type: z.enum(['text', 'number', 'money', 'percent']).default('text'),
  })).min(1).max(40),
  rows: z.array(z.record(z.string(), z.any())).max(20000),
});

router.post('/export/xlsx', ...admin, validate({ body: exportSchema }), asyncHandler(async (req, res) => {
  const { title, subtitle, columns, rows } = req.body;
  const company = await basePrisma.company.findUnique({ where: { id: getTenantId() }, select: { name: true } });

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'FACTOS';
  const sheet = workbook.addWorksheet(title.slice(0, 31).replace(/[\\/*?:[\]]/g, ' '));

  sheet.addRow([company?.name || 'FACTOS']).font = { bold: true, size: 14 };
  sheet.addRow([title]).font = { bold: true, size: 12 };
  if (subtitle) sheet.addRow([subtitle]).font = { color: { argb: 'FF64748B' } };
  sheet.addRow([]);

  const header = sheet.addRow(columns.map(c => c.label));
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F46E5' } };

  const FORMAT = { money: '#,##0.00', number: '#,##0', percent: '0.00"%"' };
  rows.forEach(row => {
    sheet.addRow(columns.map(c => {
      const value = row[c.key];
      if (value === null || value === undefined) return '';
      if (c.type === 'text') return String(value);
      const n = Number(value);
      return Number.isFinite(n) ? n : String(value);
    }));
  });
  columns.forEach((c, i) => {
    const col = sheet.getColumn(i + 1);
    if (FORMAT[c.type]) col.numFmt = FORMAT[c.type];
    const longest = Math.max(c.label.length, ...rows.slice(0, 200).map(r => String(r[c.key] ?? '').length));
    col.width = Math.min(48, Math.max(10, longest + 2));
    if (c.type !== 'text') col.alignment = { horizontal: 'right' };
  });
  sheet.views = [{ state: 'frozen', ySplit: header.number }];

  const buffer = await workbook.xlsx.writeBuffer();
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="reporte.xlsx"');
  res.send(Buffer.from(buffer));
}));

export default router;