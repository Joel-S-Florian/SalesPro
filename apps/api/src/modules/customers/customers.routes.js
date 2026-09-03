import express from 'express';
import * as customersController from './customers.controller.js';
import { authenticate } from '../../shared/middleware/auth.js';
import { authorize } from '../../shared/middlewares/authorize.js';
import { validate } from '../../shared/middleware/validate.js';
import { createCustomerSchema, updateCustomerSchema, customerIdParamSchema, customerQuerySchema } from './validators.js';
import { auditLog } from '../../shared/middleware/audit.js';

const router = express.Router();

/**
 * @route GET /api/customers
 * @description Get all customers with pagination and search
 * @access Private (Admin, Vendedor)
 */
router.get('/', authenticate, authorize('ADMINISTRADOR', 'VENDEDOR'), validate(customerQuerySchema), customersController.getCustomers);

/**
 * @route GET /api/customers/pos
 * @description Get customers for POS (lightweight)
 * @access Private (Admin, Vendedor)
 */
router.get('/pos', authenticate, authorize('ADMINISTRADOR', 'VENDEDOR'), customersController.getCustomersForPOS);

/**
 * @route GET /api/customers/:id
 * @description Get customer by ID with recent sales
 * @access Private (Admin, Vendedor)
 */
router.get('/:id', authenticate, authorize('ADMINISTRADOR', 'VENDEDOR'), validate(customerIdParamSchema), customersController.getCustomer);

/**
 * @route POST /api/customers
 * @description Create new customer
 * @access Private (Admin, Vendedor - for quick creation from POS)
 */
router.post('/', authenticate, authorize('ADMINISTRADOR', 'VENDEDOR'), validate(createCustomerSchema), auditLog('CREATE_CUSTOMER', 'customer'), customersController.createCustomer);

/**
 * @route PUT /api/customers/:id
 * @description Update customer
 * @access Private (Admin)
 */
router.put('/:id', authenticate, authorize('ADMINISTRADOR'), validate(updateCustomerSchema), auditLog('UPDATE_CUSTOMER', 'customer'), customersController.updateCustomer);

/**
 * @route DELETE /api/customers/:id
 * @description Delete customer
 * @access Private (Admin)
 */
router.delete('/:id', authenticate, authorize('ADMINISTRADOR'), validate(customerIdParamSchema), auditLog('DELETE_CUSTOMER', 'customer'), customersController.deleteCustomer);

export default router;