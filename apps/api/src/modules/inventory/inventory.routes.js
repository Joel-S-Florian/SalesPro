import express from 'express';
import * as inventoryController from './inventory.controller.js';
import { authenticate } from '../../shared/middleware/auth.js';
import { validate } from '../../shared/middleware/validate.js';
import { inventoryLogQuerySchema, adjustStockSchema } from './validators.js';
import { auditLog } from '../../shared/middleware/audit.js';

const router = express.Router();

/**
 * @route GET /api/inventory/logs
 * @description Get inventory logs with pagination and filters
 * @access Private
 */
router.get('/logs', authenticate, validate(inventoryLogQuerySchema), inventoryController.getInventoryLogs);

/**
 * @route GET /api/inventory/summary
 * @description Get inventory summary
 * @access Private
 */
router.get('/summary', authenticate, inventoryController.getInventorySummary);

/**
 * @route GET /api/inventory/kardex/:id
 * @description Get product kardex (detailed history)
 * @access Private
 */
router.get('/kardex/:id', authenticate, inventoryController.getProductKardex);

/**
 * @route POST /api/inventory/adjust
 * @description Adjust stock manually
 * @access Private
 */
router.post('/adjust', authenticate, validate(adjustStockSchema), auditLog('ADJUST_STOCK', 'inventory'), inventoryController.adjustStock);

export default router;