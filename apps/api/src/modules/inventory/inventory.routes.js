import express from 'express';
import * as inventoryController from './inventory.controller.js';
import { authenticate } from '../../shared/middleware/auth.js';
import { authorize } from '../../shared/middlewares/authorize.js';
import { validate } from '../../shared/middleware/validate.js';
import { inventoryLogQuerySchema, adjustStockSchema, purchaseSchema } from './validators.js';
import { auditLog } from '../../shared/middleware/audit.js';

const router = express.Router();

/**
 * @route GET /api/inventory/logs
 * @description Get inventory logs with pagination and filters
 * @access Private (Admin)
 */
router.get('/logs', authenticate, authorize('ADMINISTRADOR'), validate(inventoryLogQuerySchema), inventoryController.getInventoryLogs);

/**
 * @route GET /api/inventory/summary
 * @description Get inventory summary
 * @access Private (Admin)
 */
router.get('/summary', authenticate, authorize('ADMINISTRADOR'), inventoryController.getInventorySummary);

/**
 * @route GET /api/inventory/kardex/:id
 * @description Get product kardex (detailed history)
 * @access Private (Admin)
 */
router.get('/kardex/:id', authenticate, authorize('ADMINISTRADOR'), inventoryController.getProductKardex);

/**
 * @route POST /api/inventory/adjust
 * @description Adjust stock manually
 * @access Private (Admin)
 */
router.post('/adjust', authenticate, authorize('ADMINISTRADOR'), validate(adjustStockSchema), auditLog('ADJUST_STOCK', 'inventory'), inventoryController.adjustStock);

/**
 * @route POST /api/inventory/purchase
 * @description Register purchase from supplier (entry with cost)
 * @access Private (Admin)
 */
router.post('/purchase', authenticate, authorize('ADMINISTRADOR'), validate(purchaseSchema), auditLog('REGISTER_PURCHASE', 'inventory'), inventoryController.registerPurchase);

export default router;