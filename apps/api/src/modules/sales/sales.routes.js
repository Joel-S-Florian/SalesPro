import express from 'express';
import * as salesController from './sales.controller.js';
import { authenticate } from '../../shared/middleware/auth.js';
import { authorize } from '../../shared/middlewares/authorize.js';
import { validate } from '../../shared/middleware/validate.js';
import { createSaleSchema, saleIdParamSchema, saleQuerySchema } from './validators.js';
import { auditLog } from '../../shared/middleware/audit.js';
import { salesRateLimiter } from '../../shared/middleware/rateLimiter.js';

const router = express.Router();

/**
 * @route GET /api/sales
 * @description Get all sales with pagination and filters
 * @access Private (Admin)
 */
router.get('/', authenticate, authorize('ADMINISTRADOR'), validate(saleQuerySchema), salesController.getSales);

/**
 * @route GET /api/sales/my-sales
 * @description Get sales for current user (vendedor)
 * @access Private (Admin, Vendedor)
 */
router.get('/my-sales', authenticate, authorize('ADMINISTRADOR', 'VENDEDOR'), salesController.getMySales);

/**
 * @route GET /api/sales/vendor-stats
 * @description Get personal statistics for current vendor
 * @access Private (Admin, Vendedor)
 */
router.get('/vendor-stats', authenticate, authorize('ADMINISTRADOR', 'VENDEDOR'), salesController.getVendorStats);

/**
 * @route GET /api/sales/:id
 * @description Get sale by ID
 * @access Private (Admin, Vendedor - if own sale)
 */
router.get('/:id', authenticate, authorize('ADMINISTRADOR', 'VENDEDOR'), validate(saleIdParamSchema), salesController.getSale);

/**
 * @route POST /api/sales
 * @description Create new sale (POS)
 * @access Private (Admin, Vendedor)
 */
router.post('/', authenticate, authorize('ADMINISTRADOR', 'VENDEDOR'), salesRateLimiter, validate(createSaleSchema), auditLog('CREATE_SALE', 'sale'), salesController.createSale);

/**
 * @route POST /api/sales/:id/credit-note
 * @description Create credit note for a sale
 * @access Private (Admin, Vendedor)
 */
router.post('/:id/credit-note', authenticate, authorize('ADMINISTRADOR', 'VENDEDOR'), validate(saleIdParamSchema), auditLog('CREATE_CREDIT_NOTE', 'sale'), salesController.createCreditNote);

export default router;