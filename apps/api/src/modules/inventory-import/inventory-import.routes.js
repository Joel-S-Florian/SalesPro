import express from 'express';
import { z } from 'zod';
import * as importService from './inventory-import.service.js';
import { authenticate } from '../../shared/middleware/auth.js';
import { authorize } from '../../shared/middlewares/authorize.js';
import { validate } from '../../shared/middleware/validate.js';
import { auditLog } from '../../shared/middleware/audit.js';
import { asyncHandler } from '../../shared/utils/asyncHandler.js';

const router = express.Router();

const cuid = z.string().cuid();
const idSchema = { params: z.object({ id: cuid }) };

const stageSchema = {
  body: z.object({
    fileName: z.string().trim().min(1).max(200),
    // El archivo viaja en base64 dentro del JSON (límite del body: 10 MB)
    contentBase64: z.string().min(1),
  }),
};

const columnName = z.string().max(200).optional().or(z.literal(''));
const previewSchema = {
  params: z.object({ id: cuid }),
  body: z.object({
    mapping: z.object({
      code: z.string().min(1, 'Mapee la columna de código'),
      name: z.string().min(1, 'Mapee la columna de descripción'),
      cost: z.string().min(1, 'Mapee la columna de costo'),
      stock: columnName,
      price: columnName,
      category: columnName,
    }),
    marginPercent: z.number().min(0).max(1000).default(30),
    defaultCategoryId: cuid.optional(),
    supplierId: z.string().min(1).max(64).optional(),
    updatePrices: z.boolean().default(false),
  }),
};

router.use(authenticate, authorize('ADMINISTRADOR'));

router.get(
  '/',
  asyncHandler(async (req, res) => {
    res.json(await importService.listImports());
  })
);

router.post(
  '/',
  validate(stageSchema),
  auditLog('STAGE_INVENTORY_IMPORT', 'inventory_import'),
  asyncHandler(async (req, res) => {
    res.status(201).json(await importService.stageFile(req.body, req.user));
  })
);

router.post(
  '/:id/preview',
  validate(previewSchema),
  asyncHandler(async (req, res) => {
    res.json(await importService.previewImport(req.params.id, req.body));
  })
);

router.post(
  '/:id/apply',
  validate(idSchema),
  auditLog('APPLY_INVENTORY_IMPORT', 'inventory_import'),
  asyncHandler(async (req, res) => {
    res.json(await importService.applyImport(req.params.id, req.user));
  })
);

router.delete(
  '/:id',
  validate(idSchema),
  asyncHandler(async (req, res) => {
    res.json(await importService.cancelImport(req.params.id));
  })
);

export default router;
