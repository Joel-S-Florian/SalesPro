import express from 'express';
import { z } from 'zod';
import * as platformService from './platform.service.js';
import * as leadsService from '../leads/leads.service.js';
import * as billing from '../billing/billing.service.js';
import { listProviders } from '../billing/billing.providers.js';
import { getPlatformAnalytics } from './analytics.js';
import { authenticate } from '../../shared/middleware/auth.js';
import { authorize } from '../../shared/middlewares/authorize.js';
import { validate } from '../../shared/middleware/validate.js';
import { auditLog, createAuditLog } from '../../shared/middleware/audit.js';
import { asyncHandler } from '../../shared/utils/asyncHandler.js';

const router = express.Router();

const optionalText = max => z.string().trim().max(max).optional().or(z.literal(''));
const companyFields = {
  name: z.string().trim().min(1, 'Nombre requerido').max(120),
  rnc: optionalText(20),
  email: z.string().trim().email('Email inválido').optional().or(z.literal('')),
  phone: optionalText(40),
  address: optionalText(250),
};
const idParams = z.object({ id: z.string().min(1).max(64) });
const planEnum = z.enum(['FREE', 'STARTER', 'BUSINESS']);

const createSchema = {
  body: z.object({
    ...companyFields,
    plan: planEnum.optional(),
    trialDays: z.number().int().min(0).max(365).optional(),
    admin: z.object({
      fullName: z.string().trim().min(1, 'Nombre del administrador requerido').max(120),
      username: z.string().trim().min(3).max(50).regex(/^[a-zA-Z0-9._-]+$/, 'Solo letras, números, punto, guion y guion bajo'),
    }),
  }),
};
const updateSchema = {
  params: idParams,
  body: z
    .object({ ...companyFields, active: z.boolean(), plan: planEnum, trialEndsAt: z.string().datetime().nullable() })
    .partial()
    .refine(data => Object.keys(data).length > 0, 'Al menos un campo es requerido'),
};
const resetSchema = {
  params: z.object({ id: z.string().min(1).max(64), userId: z.string().min(1).max(64) }),
};

// Solo el equipo de la plataforma
router.use(authenticate, authorize('SUPERADMIN'));

const leadListSchema = {
  query: z.object({
    status: z.enum(['NEW', 'APPROVED', 'REJECTED']).optional(),
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(10),
  }),
};
const leadApproveSchema = {
  params: idParams,
  body: z.object({ plan: planEnum.default('STARTER'), trialDays: z.number().int().min(0).max(365).default(14) }),
};

router.get(
  '/leads',
  validate(leadListSchema),
  asyncHandler(async (req, res) => {
    res.json(await leadsService.listLeads(req.query));
  })
);

router.post(
  '/leads/:id/approve',
  validate(leadApproveSchema),
  // La respuesta lleva una contraseña temporal: no se guarda en la auditoría (solo la acción y el id)
  asyncHandler(async (req, res) => {
    const result = await leadsService.approveLead(req.params.id, req.body);
    await createAuditLog({
      userId: req.user.userId,
      action: 'APPROVE_LEAD',
      entity: 'lead',
      entityId: req.params.id,
      newData: { companyId: result.company.id, plan: req.body.plan, trialDays: req.body.trialDays },
    });
    res.status(201).json(result);
  })
);

router.post(
  '/leads/:id/reject',
  validate({ params: idParams }),
  auditLog('REJECT_LEAD', 'lead'),
  asyncHandler(async (req, res) => {
    res.json(await leadsService.rejectLead(req.params.id));
  })
);

router.get(
  '/analytics',
  asyncHandler(async (req, res) => {
    res.json(await getPlatformAnalytics());
  })
);

router.get(
  '/stats',
  asyncHandler(async (req, res) => {
    res.json(await platformService.getPlatformStats());
  })
);

router.get(
  '/companies',
  asyncHandler(async (req, res) => {
    res.json(await platformService.listCompanies({ q: req.query.q ? String(req.query.q) : undefined }));
  })
);

router.get(
  '/companies/:id',
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    res.json(await platformService.getCompany(req.params.id));
  })
);

router.post(
  '/companies',
  validate(createSchema),
  auditLog('CREATE_COMPANY', 'company'),
  asyncHandler(async (req, res) => {
    res.status(201).json(await platformService.createCompany(req.body));
  })
);

router.put(
  '/companies/:id',
  validate(updateSchema),
  auditLog('UPDATE_COMPANY', 'company'),
  asyncHandler(async (req, res) => {
    res.json(await platformService.updateCompany(req.params.id, req.body));
  })
);

router.post(
  '/companies/:id/users/:userId/reset-password',
  validate(resetSchema),
  auditLog('RESET_COMPANY_USER_PASSWORD', 'company'),
  asyncHandler(async (req, res) => {
    res.json(await platformService.resetCompanyUserPassword(req.params.id, req.params.userId));
  })
);

// --- Cobros de la suscripción (cobro manual hoy; Azul detrás de la misma interfaz, deshabilitado) ---
const paymentSchema = {
  params: idParams,
  body: z.object({
    plan: z.enum(['STARTER', 'BUSINESS']),
    amount: z.number().positive().max(10_000_000),
    method: z.enum(['TRANSFER', 'DEPOSIT', 'CASH', 'OTHER']).default('TRANSFER'),
    reference: z.string().trim().max(80).optional().or(z.literal('')),
    months: z.number().int().min(1).max(24).optional(),
    periodStart: z.string().datetime().optional(),
    periodEnd: z.string().datetime().optional(),
    note: z.string().trim().max(300).optional().or(z.literal('')),
  }).refine(d => d.method === 'CASH' || d.method === 'OTHER' || (d.reference && d.reference.length >= 3), { message: 'La referencia de la transferencia o depósito es obligatoria', path: ['reference'] }),
};
const voidSchema = {
  params: z.object({ id: z.string().min(1).max(64), paymentId: z.string().min(1).max(64) }),
  body: z.object({ reason: z.string().trim().min(3, 'Indica el motivo').max(200) }),
};

router.get('/billing/providers', asyncHandler(async (req, res) => res.json({ data: listProviders() })));

router.get(
  '/companies/:id/payments',
  validate({ params: idParams }),
  asyncHandler(async (req, res) => res.json({ data: await billing.listPaymentsForCompany(req.params.id) }))
);

router.post(
  '/companies/:id/payments',
  validate(paymentSchema),
  asyncHandler(async (req, res) => res.status(201).json(await billing.recordManualPayment(req.user, req.params.id, req.body)))
);

router.post(
  '/companies/:id/payments/:paymentId/void',
  validate(voidSchema),
  asyncHandler(async (req, res) => res.json(await billing.voidPayment(req.user, req.params.id, req.params.paymentId, req.body.reason)))
);

router.get(
  '/companies/:id/payments/:paymentId/receipt',
  validate({ params: z.object({ id: z.string().min(1).max(64), paymentId: z.string().min(1).max(64) }) }),
  asyncHandler(async (req, res) => res.json(await billing.getReceipt(req.params.paymentId, { companyId: req.params.id, scoped: false })))
);

export default router;
