import express from 'express';
import * as configService from './config.service.js';
import { authenticate } from '../../shared/middleware/auth.js';
import { authorize } from '../../shared/middlewares/authorize.js';
import { validate } from '../../shared/middleware/validate.js';
import { auditLog } from '../../shared/middleware/audit.js';
import { asyncHandler } from '../../shared/utils/asyncHandler.js';

const router = express.Router();

// La validación de campos vive en configService.updateConfig (esquema completo);
// aquí solo se exige un objeto con al menos una clave conocida.
const updateConfigSchema = {
  body: configService.configSchema
    .partial()
    .strict()
    .refine(data => Object.keys(data).length > 0, 'Al menos un campo es requerido'),
};

/**
 * @route GET /api/config
 * @description Configuración global (la usan el POS y los comprobantes)
 * @access Private (Admin, Vendedor)
 */
router.get(
  '/',
  authenticate,
  authorize('ADMINISTRADOR', 'VENDEDOR'),
  asyncHandler(async (req, res) => {
    res.json(await configService.getConfig());
  })
);

/**
 * @route PUT /api/config
 * @access Private (Admin)
 */
router.put(
  '/',
  authenticate,
  authorize('ADMINISTRADOR'),
  validate(updateConfigSchema),
  auditLog('UPDATE_CONFIG', 'config'),
  asyncHandler(async (req, res) => {
    res.json(await configService.updateConfig(req.body));
  })
);

export default router;
