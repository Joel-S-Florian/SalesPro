import express from 'express';
import * as customersController from './customers.controller.js';
import { authenticate } from '../../shared/middleware/auth.js';
import { validate } from '../../shared/middleware/validate.js';
import { createCustomerSchema, updateCustomerSchema, customerIdParamSchema, customerQuerySchema } from './validators.js';
import { auditLog } from '../../shared/middleware/audit.js';

const router = express.Router();

/**
 * @route GET /api/customers
 * @description Get all customers with pagination and search
 * @access Private
 */
router.get('/', authenticate, validate(customerQuerySchema), customersController.getCustomers);

/**
 * @route GET /api/customers/pos
 * @description Get customers for POS (lightweight)
 * @access Private
 */
router.get('/pos', authenticate, customersController.getCustomersForPOS);

/**
 * @route GET /api/customers/:id
 * @description Get customer by ID with recent sales
 * @access Private
 */
router.get('/:id', authenticate, validate(customerIdParamSchema), customersController.getCustomer);

/**
 * @route POST /api/customers
 * @description Create new customer
 * @access Private
 */
router.post('/', authenticate, validate(createCustomerSchema), auditLog('CREATE_CUSTOMER', 'customer'), customersController.createCustomer);

/**
 * @route PUT /api/customers/:id
 * @description Update customer
 * @access Private
 */
router.put('/:id', authenticate, validate(updateCustomerSchema), auditLog('UPDATE_CUSTOMER', 'customer'), customersController.updateCustomer);

/**
 * @route DELETE /api/customers/:id
 * @description Delete customer
 * @access Private
 */
router.delete('/:id', authenticate, validate(customerIdParamSchema), auditLog('DELETE_CUSTOMER', 'customer'), customersController.deleteCustomer);

export default router;