import express from 'express';
import * as productsController from './products.controller.js';
import { authenticate } from '../../shared/middleware/auth.js';
import { validate } from '../../shared/middleware/validate.js';
import { createProductSchema, updateProductSchema, productIdParamSchema, productQuerySchema, adjustStockSchema } from './validators.js';
import { auditLog } from '../../shared/middleware/audit.js';

const router = express.Router();

/**
 * @route GET /api/products
 * @description Get all products with pagination, search, filters
 * @access Private
 */
router.get('/', authenticate, validate(productQuerySchema), productsController.getProducts);

/**
 * @route GET /api/products/low-stock
 * @description Get low stock products
 * @access Private
 */
router.get('/low-stock', authenticate, productsController.getLowStock);

/**
 * @route GET /api/products/:id
 * @description Get product by ID
 * @access Private
 */
router.get('/:id', authenticate, validate(productIdParamSchema), productsController.getProduct);

/**
 * @route POST /api/products
 * @description Create new product
 * @access Private
 */
router.post('/', authenticate, validate(createProductSchema), auditLog('CREATE_PRODUCT', 'product'), productsController.createProduct);

/**
 * @route PUT /api/products/:id
 * @description Update product
 * @access Private
 */
router.put('/:id', authenticate, validate(updateProductSchema), auditLog('UPDATE_PRODUCT', 'product'), productsController.updateProduct);

/**
 * @route DELETE /api/products/:id
 * @description Delete product (soft delete if has sales)
 * @access Private
 */
router.delete('/:id', authenticate, validate(productIdParamSchema), auditLog('DELETE_PRODUCT', 'product'), productsController.deleteProduct);

/**
 * @route POST /api/products/adjust-stock
 * @description Adjust stock (entrada/salida/ajuste/devolucion)
 * @access Private
 */
router.post('/adjust-stock', authenticate, validate(adjustStockSchema), auditLog('ADJUST_STOCK', 'inventory'), productsController.adjustStock);

export default router;