import express from 'express';
import * as categoriesController from './categories.controller.js';
import { authenticate } from '../../shared/middleware/auth.js';
import { validate } from '../../shared/middleware/validate.js';
import { createCategorySchema, updateCategorySchema, categoryIdParamSchema, categoryQuerySchema } from './validators.js';
import { auditLog } from '../../shared/middleware/audit.js';

const router = express.Router();

/**
 * @route GET /api/categories
 * @description Get all categories with pagination and search
 * @access Private
 */
router.get('/', authenticate, validate(categoryQuerySchema), categoriesController.getCategories);

/**
 * @route GET /api/categories/:id
 * @description Get category by ID
 * @access Private
 */
router.get('/:id', authenticate, validate(categoryIdParamSchema), categoriesController.getCategory);

/**
 * @route POST /api/categories
 * @description Create new category
 * @access Private
 */
router.post('/', authenticate, validate(createCategorySchema), auditLog('CREATE_CATEGORY', 'category'), categoriesController.createCategory);

/**
 * @route PUT /api/categories/:id
 * @description Update category
 * @access Private
 */
router.put('/:id', authenticate, validate(updateCategorySchema), auditLog('UPDATE_CATEGORY', 'category'), categoriesController.updateCategory);

/**
 * @route DELETE /api/categories/:id
 * @description Delete category
 * @access Private
 */
router.delete('/:id', authenticate, validate(categoryIdParamSchema), auditLog('DELETE_CATEGORY', 'category'), categoriesController.deleteCategory);

export default router;