import express from 'express';
import { z } from 'zod';
import * as cashierService from './cashier.service.js';
import { authenticate } from '../../shared/middleware/auth.js';
import { authorize } from '../../shared/middlewares/authorize.js';
import { validate } from '../../shared/middleware/validate.js';
import { auditLog } from '../../shared/middleware/audit.js';
import { asyncHandler } from '../../shared/utils/asyncHandler.js';

const router = express.Router();

const cuid = z.string().cuid();
const money = z.number().min(0).max(100000000);

const currentSchema = { query: z.object({ terminalId: cuid }) };
const openSchema = {
  body: z.object({
    terminalId: cuid,
    openingBalance: money.default(0),
    openingCount: z.record(z.string(), z.number().int().min(0).max(100000)).optional(),
  }),
};
const closeSchema = {
  params: z.object({ id: cuid }),
  body: z.object({
    declaredCash: money,
    closingCount: z.record(z.string(), z.number().int().min(0).max(100000)).optional(),
    notes: z.string().trim().max(500).optional(),
  }),
};
const idSchema = { params: z.object({ id: cuid }) };
const listSchema = {
  query: z.object({
    terminalId: cuid.optional(),
    userId: cuid.optional(),
    status: z.enum(['OPEN', 'CLOSED']).optional(),
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(20),
  }),
};

router.use(authenticate);

router.get(
  '/current',
  authorize('ADMINISTRADOR', 'VENDEDOR'),
  validate(currentSchema),
  asyncHandler(async (req, res) => {
    res.json({ shift: await cashierService.getCurrentShift(req.user, req.query.terminalId) });
  })
);

router.post(
  '/open',
  authorize('ADMINISTRADOR', 'VENDEDOR'),
  validate(openSchema),
  auditLog('OPEN_SHIFT', 'cashier'),
  asyncHandler(async (req, res) => {
    res.status(201).json(await cashierService.openShift(req.user, req.body));
  })
);

router.get(
  '/:id/drawer',
  authorize('ADMINISTRADOR', 'VENDEDOR'),
  validate(idSchema),
  asyncHandler(async (req, res) => {
    res.json(await cashierService.getDrawer(req.user, req.params.id));
  })
);

router.post(
  '/:id/close',
  authorize('ADMINISTRADOR', 'VENDEDOR'),
  validate(closeSchema),
  auditLog('CLOSE_SHIFT', 'cashier'),
  asyncHandler(async (req, res) => {
    res.json(await cashierService.closeShift(req.user, req.params.id, req.body));
  })
);

router.get(
  '/',
  authorize('ADMINISTRADOR'),
  validate(listSchema),
  asyncHandler(async (req, res) => {
    res.json(await cashierService.listShifts(req.query));
  })
);

router.get(
  '/:id',
  authorize('ADMINISTRADOR', 'VENDEDOR'),
  validate(idSchema),
  asyncHandler(async (req, res) => {
    res.json(await cashierService.getShift(req.user, req.params.id));
  })
);

export default router;
