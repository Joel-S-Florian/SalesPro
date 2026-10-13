import express from 'express';
import { z } from 'zod';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { authenticate } from '../../shared/middleware/auth.js';
import { authorize } from '../../shared/middlewares/authorize.js';
import { validate } from '../../shared/middleware/validate.js';
import { auditLog } from '../../shared/middleware/audit.js';
import { asyncHandler } from '../../shared/utils/asyncHandler.js';
import { isDev } from '../../config/env.js';
import * as service from './payments.service.js';

const router = express.Router();
router.use(authenticate);

// Un cobro por tarjeta mueve dinero: límite por conexión para frenar repeticiones accidentales
const chargeLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: isDev ? 200 : 20,
  message: { error: 'Demasiados cobros en poco tiempo. Espere un momento.', code: 'CARD_RATE_LIMIT' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: ipKeyGenerator,
});

router.get(
  '/card/config',
  authorize('ADMINISTRADOR', 'VENDEDOR'),
  asyncHandler(async (req, res) => res.json(await service.getCardConfig(req.user)))
);

router.put(
  '/card/config',
  authorize('ADMINISTRADOR'),
  validate({
    body: z.object({
      provider: z.enum(['NONE', 'MANUAL', 'SIMULATOR', 'AZUL']),
      mode: z.enum(['TEST', 'PROD']).default('TEST'),
      merchantId: z.string().trim().max(60).optional().or(z.literal('')),
      terminalCode: z.string().trim().max(60).optional().or(z.literal('')),
      secret: z.string().max(200).optional(),
    }),
  }),
  auditLog('UPDATE_CARD_CONFIG', 'card_config'),
  asyncHandler(async (req, res) => res.json(await service.saveCardConfig(req.body)))
);

router.post(
  '/card/charge',
  authorize('ADMINISTRADOR', 'VENDEDOR'),
  chargeLimiter,
  validate({
    body: z.object({
      amount: z.number().positive().max(100000000),
      terminalId: z.string().max(64).optional(),
      manual: z
        .object({
          authCode: z.string().max(20).optional(),
          last4: z.string().max(10).optional(),
          brand: z.string().max(20).optional(),
          reference: z.string().max(40).optional(),
        })
        .optional(),
    }),
  }),
  auditLog('CARD_CHARGE', 'card_payment'),
  asyncHandler(async (req, res) => res.status(201).json(await service.chargeCard(req.body, req.user)))
);

router.post(
  '/card/:id/void',
  authorize('ADMINISTRADOR', 'VENDEDOR'),
  validate({ params: z.object({ id: z.string().min(1).max(64) }) }),
  auditLog('CARD_VOID', 'card_payment'),
  asyncHandler(async (req, res) => res.json(await service.voidCardPayment(req.params.id, req.user)))
);

export default router;
