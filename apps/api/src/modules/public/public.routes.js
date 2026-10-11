import express from 'express';
import { z } from 'zod';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { validate } from '../../shared/middleware/validate.js';
import { asyncHandler } from '../../shared/utils/asyncHandler.js';
import { createLead } from '../leads/leads.service.js';
import { signup } from './signup.service.js';
import { env } from '../../config/env.js';

/**
 * Endpoints públicos (sin sesión), usados por la página de promoción.
 */
const router = express.Router();

// Pocas solicitudes por hora y por IP: evita que alguien llene la bandeja
const leadRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: env.isDev ? 50 : 5,
  message: { error: 'Ya recibimos varias solicitudes desde su conexión. Intente más tarde.', code: 'LEAD_RATE_LIMIT' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: ipKeyGenerator,
});

// Alta de empresas nuevas: más estricto aún, es una operación que crea datos
const signupRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: env.isDev ? 100 : 10,
  message: { error: 'Se crearon varias cuentas desde su conexión. Intente más tarde.', code: 'SIGNUP_RATE_LIMIT' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: ipKeyGenerator,
});

const text = (min, max) => z.string().trim().min(min).max(max);

const leadSchema = {
  body: z.object({
    name: text(2, 120),
    business: text(2, 120),
    businessType: z.string().trim().max(60).optional().or(z.literal('')),
    contact: text(5, 120),
    note: z.string().trim().max(600).optional().or(z.literal('')),
    // Campo trampa: las personas no lo ven ni lo llenan; los bots sí
    website: z.string().max(200).optional(),
  }),
};

router.post(
  '/leads',
  leadRateLimiter,
  validate(leadSchema),
  asyncHandler(async (req, res) => {
    if (!req.body.website) await createLead(req.body, req.ip);
    res.status(201).json({ ok: true });
  })
);

const signupSchema = {
  body: z.object({
    plan: z.enum(['FREE', 'STARTER', 'BUSINESS', 'PRO', 'ENTERPRISE']),
    account: z.object({
      fullName: text(2, 120),
      email: z.string().trim().toLowerCase().email('Correo inválido').max(120),
      password: z
        .string()
        .min(8, 'La contraseña debe tener al menos 8 caracteres')
        .max(100)
        .regex(/[A-Za-z]/, 'La contraseña debe incluir al menos una letra')
        .regex(/\d/, 'La contraseña debe incluir al menos un número'),
    }),
    company: z.object({
      name: text(2, 120),
      businessType: z.string().trim().max(60).optional().or(z.literal('')),
      rnc: z
        .string()
        .trim()
        .max(15)
        .optional()
        .or(z.literal(''))
        .refine(value => !value || /^(\d{9}|\d{11})$/.test(value.replace(/[\s-]/g, '')), 'El RNC debe tener 9 dígitos (o 11 si es una persona)'),
      phone: z.string().trim().max(40).optional().or(z.literal('')),
      address: z.string().trim().max(250).optional().or(z.literal('')),
    }),
    settings: z.object({
      taxRate: z.number().min(0).max(1).default(0.18),
      paymentMethods: z.array(z.enum(['EFECTIVO', 'TARJETA'])).min(1, 'Elige al menos un método de pago').default(['EFECTIVO', 'TARJETA']),
      receiptFormat: z.enum(['A4', 'TICKET', 'BOTH']).default('A4'),
      terminalName: text(1, 60).default('Caja 1'),
    }),
    website: z.string().max(200).optional(),
  }),
};

router.post(
  '/signup',
  signupRateLimiter,
  validate(signupSchema),
  asyncHandler(async (req, res) => {
    // Campo trampa: un bot que lo llena recibe un error genérico y no se crea nada
    if (req.body.website) throw new Error('Solicitud inválida');
    const { website, ...data } = req.body;
    res.status(201).json(await signup(data));
  })
);

export default router;
