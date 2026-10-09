import express from 'express';
import { z } from 'zod';
import * as terminalsService from './terminals.service.js';
import { authenticate } from '../../shared/middleware/auth.js';
import { authorize } from '../../shared/middlewares/authorize.js';
import { validate } from '../../shared/middleware/validate.js';
import { auditLog } from '../../shared/middleware/audit.js';
import { asyncHandler } from '../../shared/utils/asyncHandler.js';

const router = express.Router();

const idParam = z.object({ id: z.string().cuid() });
const createSchema = {
  body: z.object({
    name: z.string().trim().min(1, 'Nombre requerido').max(60),
    userIds: z.array(z.string().cuid()).optional(),
  }),
};
const updateSchema = {
  params: idParam,
  body: z
    .object({
      name: z.string().trim().min(1).max(60),
      active: z.boolean(),
      userIds: z.array(z.string().cuid()),
    })
    .partial()
    .refine(data => Object.keys(data).length > 0, 'Al menos un campo es requerido'),
};
const defaultSchema = { body: z.object({ terminalId: z.string().cuid().nullable() }) };

router.use(authenticate);

// Cajas disponibles para el usuario actual (POS)
router.get(
  '/my',
  authorize('ADMINISTRADOR', 'VENDEDOR'),
  asyncHandler(async (req, res) => {
    res.json(await terminalsService.getMyTerminals(req.user));
  })
);

router.put(
  '/my/default',
  authorize('ADMINISTRADOR', 'VENDEDOR'),
  validate(defaultSchema),
  asyncHandler(async (req, res) => {
    res.json(await terminalsService.setMyDefaultTerminal(req.user, req.body.terminalId));
  })
);

// Administración de cajas
router.get(
  '/',
  authorize('ADMINISTRADOR'),
  asyncHandler(async (req, res) => {
    res.json(await terminalsService.listTerminals());
  })
);

router.post(
  '/',
  authorize('ADMINISTRADOR'),
  validate(createSchema),
  auditLog('CREATE_TERMINAL', 'terminal'),
  asyncHandler(async (req, res) => {
    res.status(201).json(await terminalsService.createTerminal(req.body));
  })
);

router.put(
  '/:id',
  authorize('ADMINISTRADOR'),
  validate(updateSchema),
  auditLog('UPDATE_TERMINAL', 'terminal'),
  asyncHandler(async (req, res) => {
    res.json(await terminalsService.updateTerminal(req.params.id, req.body));
  })
);

export default router;
