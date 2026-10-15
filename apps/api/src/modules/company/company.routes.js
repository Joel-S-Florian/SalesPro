import express from 'express';
import { authenticate } from '../../shared/middleware/auth.js';
import { asyncHandler } from '../../shared/utils/asyncHandler.js';
import { authorize } from '../../shared/middlewares/authorize.js';
import { validate } from '../../shared/middleware/validate.js';
import { z } from 'zod';
import { getPlanUsage } from '../../shared/plans.js';
import { getReceipt, getSubscriptionSummary } from '../billing/billing.service.js';

const router = express.Router();

/**
 * Plan de la empresa, estado de la prueba, uso contra los límites y funciones incluidas.
 * Lo consultan todos los usuarios (el aviso de prueba se ve en todo el sistema); no expone datos de otras empresas.
 */
router.get('/plan-usage', authenticate, asyncHandler(async (req, res) => res.json(await getPlanUsage())));

/** Historial de pagos de la suscripción de MI empresa (solo el administrador). */
router.get('/subscription', authenticate, authorize('ADMINISTRADOR'), asyncHandler(async (req, res) => res.json(await getSubscriptionSummary())));

router.get(
  '/payments/:paymentId/receipt',
  authenticate,
  authorize('ADMINISTRADOR'),
  validate({ params: z.object({ paymentId: z.string().min(1).max(64) }) }),
  asyncHandler(async (req, res) => res.json(await getReceipt(req.params.paymentId, { scoped: true })))
);

export default router;
