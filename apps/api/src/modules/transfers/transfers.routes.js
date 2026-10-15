import express from 'express';
import { z } from 'zod';
import * as transfersService from './transfers.service.js';
import { authenticate } from '../../shared/middleware/auth.js';
import { authorize } from '../../shared/middlewares/authorize.js';
import { validate } from '../../shared/middleware/validate.js';
import { auditLog } from '../../shared/middleware/audit.js';
import { asyncHandler } from '../../shared/utils/asyncHandler.js';

const router = express.Router();

const cuid = z.string().cuid();
const idParam = z.object({ id: cuid });
const createSchema = {
  body: z.object({
    fromBranchId: cuid,
    toBranchId: cuid,
    note: z.string().trim().max(300).optional().or(z.literal('')),
    lines: z.array(z.object({ productId: cuid, quantity: z.number().positive('La cantidad debe ser mayor que cero').max(1000000) })).min(1, 'Agregue al menos un producto').max(200),
  }),
};
const listSchema = {
  query: z.object({
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
    status: z.enum(['ENVIADA', 'RECIBIDA', 'ANULADA']).optional(),
    branchId: cuid.optional(),
  }),
};

router.use(authenticate, authorize('ADMINISTRADOR'));

router.get(
  '/',
  validate(listSchema),
  asyncHandler(async (req, res) => {
    res.json(await transfersService.listTransfers(req.query));
  })
);

router.get(
  '/:id',
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    res.json(await transfersService.getTransfer(req.params.id));
  })
);

router.post(
  '/',
  validate(createSchema),
  auditLog('CREATE_TRANSFER', 'transfer'),
  asyncHandler(async (req, res) => {
    res.status(201).json(await transfersService.createTransfer(req.body, req.user));
  })
);

router.post(
  '/:id/receive',
  validate({ params: idParam }),
  auditLog('RECEIVE_TRANSFER', 'transfer'),
  asyncHandler(async (req, res) => {
    res.json(await transfersService.receiveTransfer(req.params.id, req.user));
  })
);

router.post(
  '/:id/void',
  validate({ params: idParam }),
  auditLog('VOID_TRANSFER', 'transfer'),
  asyncHandler(async (req, res) => {
    res.json(await transfersService.voidTransfer(req.params.id, req.user));
  })
);

export default router;
