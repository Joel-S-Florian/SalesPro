import express from 'express';
import * as categoriesController from './categories.controller.js';
import { authenticate } from '../../shared/middleware/auth.js';
import { authorize } from '../../shared/middlewares/authorize.js';
import { validate } from '../../shared/middleware/validate.js';
import { createCategorySchema, updateCategorySchema, categoryIdParamSchema, categoryQuerySchema } from './validators.js';
import { auditLog } from '../../shared/middleware/audit.js';

const router = express.Router();

/**
 * @route GET /api/categories
 * @description Get all categories with pagination and search
 * @access Private (Admin)
 */
router.get('/', authenticate, authorize('ADMINISTRADOR'), validate(categoryQuerySchema), categoriesController.getCategories);

/**
 * @route GET /api/categories/:id
 * @description Get category by ID
 * @access Private (Admin)
 */
router.get('/:id', authenticate, authorize('ADMINISTRADOR'), validate(categoryIdParamSchema), categoriesController.getCategory);

/**
 * @route POST /api/categories
 * @description Create new category
 * @access Private (Admin)
 */
router.post('/', authenticate, authorize('ADMINISTRADOR'), validate(createCategorySchema), auditLog('CREATE_CATEGORY', 'category'), categoriesController.createCategory);

/**
 * @route PUT /api/categories/:id
 * @description Update category
 * @access Private (Admin)
 */
router.put('/:id', authenticate, authorize('ADMINISTRADOR'), validate(updateCategorySchema), auditLog('UPDATE_CATEGORY', 'category'), categoriesController.updateCategory);

/**
 * @route DELETE /api/categories/:id
 * @description Delete category
 * @access Private (Admin)
 */
router.delete('/:id', authenticate, authorize('ADMINISTRADOR'), validate(categoryIdParamSchema), auditLog('DELETE_CATEGORY', 'category'), categoriesController.deleteCategory);

export default router;