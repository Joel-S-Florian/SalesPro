import express from 'express';
import * as reportsController from './reports.controller.js';
import { authenticate } from '../../shared/middleware/auth.js';
import { authorize } from '../../shared/middlewares/authorize.js';

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

export default router;