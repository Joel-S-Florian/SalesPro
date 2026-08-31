import express from 'express';
import * as reportsController from './reports.controller.js';
import { authenticate } from '../../shared/middleware/auth.js';

const router = express.Router();

/**
 * @route GET /api/reports/dashboard
 * @description Get dashboard statistics
 * @access Private
 */
router.get('/dashboard', authenticate, reportsController.getDashboard);

/**
 * @route GET /api/reports/sales
 * @description Get sales report with filters
 * @access Private
 */
router.get('/sales', authenticate, reportsController.getSalesReport);

/**
 * @route GET /api/reports/products
 * @description Get product sales report
 * @access Private
 */
router.get('/products', authenticate, reportsController.getProductSalesReport);

/**
 * @route GET /api/reports/customers
 * @description Get customer sales report
 * @access Private
 */
router.get('/customers', authenticate, reportsController.getCustomerSalesReport);

/**
 * @route GET /api/reports/tax
 * @description Get tax report (ITBIS)
 * @access Private
 */
router.get('/tax', authenticate, reportsController.getTaxReport);

export default router;