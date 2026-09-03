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

export default router;