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
 * @route GET /api/inventory/expiring
 * @description Lotes vencidos, críticos y por vencer según los umbrales de la empresa (?status=EXPIRED|RED|YELLOW)
 * @access Private (Admin, Vendedor: aviso al iniciar turno)
 */
router.get('/expiring', authenticate, authorize('ADMINISTRADOR', 'VENDEDOR'), inventoryController.getExpiringBatches);

/**
 * @route GET /api/inventory/expiring/summary
 * @description Conteo de lotes vencidos / críticos / por vencer
 * @access Private (Admin, Vendedor)
 */
router.get('/expiring/summary', authenticate, authorize('ADMINISTRADOR', 'VENDEDOR'), inventoryController.getExpiringSummary);

/**
 * @route GET /api/inventory/batches/:id
 * @description Lotes de un producto perecedero (?all=true incluye lotes agotados)
 * @access Private (Admin)
 */
router.get('/batches/:id', authenticate, authorize('ADMINISTRADOR'), inventoryController.getProductBatches);

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