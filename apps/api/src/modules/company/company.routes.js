import express from 'express';
import { authenticate } from '../../shared/middleware/auth.js';
import { asyncHandler } from '../../shared/utils/asyncHandler.js';
import { getPlanUsage } from '../../shared/plans.js';

const router = express.Router();

/**
 * Plan de la empresa, estado de la prueba, uso contra los límites y funciones incluidas.
 * Lo consultan todos los usuarios (el aviso de prueba se ve en todo el sistema); no expone datos de otras empresas.
 */
router.get('/plan-usage', authenticate, asyncHandler(async (req, res) => res.json(await getPlanUsage())));

export default router;
