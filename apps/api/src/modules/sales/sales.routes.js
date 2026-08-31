import express from 'express';
import * as salesController from './sales.controller.js';
import { authenticate } from '../../shared/middleware/auth.js';
import { validate } from '../../shared/middleware/validate.js';
import { createSaleSchema, saleIdParamSchema, saleQuerySchema } from './validators.js';
import { auditLog } from '../../shared/middleware/audit.js';
import { salesRateLimiter } from '../../shared/middleware/rateLimiter.js';

const router = express.Router();

/**
 * @route GET /api/sales
 * @description Get all sales with pagination and filters
 * @access Private
 */
router.get('/', authenticate, validate(saleQuerySchema), salesController.getSales);

/**
 * @route GET /api/sales/:id
 * @description Get sale by ID
 * @access Private
 */
router.get('/:id', authenticate, validate(saleIdParamSchema), salesController.getSale);

/**
 * @route POST /api/sales
 * @description Create new sale (POS)
 * @access Private
 */
router.post('/', authenticate, salesRateLimiter, validate(createSaleSchema), auditLog('CREATE_SALE', 'sale'), salesController.createSale);

/**
 * @route POST /api/sales/:id/credit-note
 * @description Create credit note for a sale
 * @access Private
 */
router.post('/:id/credit-note', authenticate, validate(saleIdParamSchema), auditLog('CREATE_CREDIT_NOTE', 'sale'), salesController.createCreditNote);

export default router;