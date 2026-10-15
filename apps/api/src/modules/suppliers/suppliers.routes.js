import express from 'express';
import * as suppliersController from './suppliers.controller.js';
import { authenticate } from '../../shared/middleware/auth.js';
import { authorize } from '../../shared/middlewares/authorize.js';
import { validate } from '../../shared/middleware/validate.js';
import { auditLog } from '../../shared/middleware/audit.js';
import {
  createSupplierSchema,
  updateSupplierSchema,
  supplierIdParamSchema,
  supplierQuerySchema,
  supplierPurchasesQuerySchema,
} from './validators.js';

const router = express.Router();

// Todo el módulo es solo para administradores
router.use(authenticate, authorize('ADMINISTRADOR'));

router.get('/', validate(supplierQuerySchema), suppliersController.getSuppliers);
router.get('/:id', validate(supplierIdParamSchema), suppliersController.getSupplier);
router.get('/:id/reorder-products', validate(supplierIdParamSchema), suppliersController.getReorderProducts);
router.get('/:id/purchases', validate(supplierPurchasesQuerySchema), suppliersController.getSupplierPurchases);
router.post('/', validate(createSupplierSchema), auditLog('CREATE_SUPPLIER', 'supplier'), suppliersController.createSupplier);
router.put('/:id', validate(updateSupplierSchema), auditLog('UPDATE_SUPPLIER', 'supplier'), suppliersController.updateSupplier);
router.delete('/:id', validate(supplierIdParamSchema), auditLog('DEACTIVATE_SUPPLIER', 'supplier'), suppliersController.deleteSupplier);

export default router;
