import express from 'express';
import { z } from 'zod';
import * as branchesService from './branches.service.js';
import { authenticate } from '../../shared/middleware/auth.js';
import { authorize } from '../../shared/middlewares/authorize.js';
import { validate } from '../../shared/middleware/validate.js';
import { auditLog } from '../../shared/middleware/audit.js';
import { asyncHandler } from '../../shared/utils/asyncHandler.js';

const router = express.Router();

const idParam = z.object({ id: z.string().cuid() });
const fields = {
  name: z.string().trim().min(1, 'Nombre requerido').max(60),
  code: z.string().trim().min(1).max(20).regex(/^[A-Za-z0-9-]+$/, 'El código solo lleva letras, números y guion'),
  address: z.string().trim().max(200).optional().or(z.literal('')),
  phone: z.string().trim().max(30).optional().or(z.literal('')),
};
const createSchema = { body: z.object({ name: fields.name, code: fields.code.optional().or(z.literal('')), address: fields.address, phone: fields.phone }) };
const updateSchema = {
  params: idParam,
  body: z
    .object({ name: fields.name, code: fields.code, address: fields.address, phone: fields.phone, active: z.boolean() })
    .partial()
    .refine(data => Object.keys(data).length > 0, 'Al menos un campo es requerido'),
};

router.use(authenticate);

// Lista para selectores (todos los roles de una empresa): solo las activas
router.get(
  '/',
  authorize('ADMINISTRADOR', 'VENDEDOR'),
  asyncHandler(async (req, res) => {
    const all = req.user.role === 'ADMINISTRADOR' && req.query.all === '1';
    res.json(await branchesService.listBranches({ onlyActive: !all }));
  })
);

router.post(
  '/',
  authorize('ADMINISTRADOR'),
  validate(createSchema),
  auditLog('CREATE_BRANCH', 'branch'),
  asyncHandler(async (req, res) => {
    res.status(201).json(await branchesService.createBranch(req.body));
  })
);

router.put(
  '/:id',
  authorize('ADMINISTRADOR'),
  validate(updateSchema),
  auditLog('UPDATE_BRANCH', 'branch'),
  asyncHandler(async (req, res) => {
    res.json(await branchesService.updateBranch(req.params.id, req.body));
  })
);

export default router;
