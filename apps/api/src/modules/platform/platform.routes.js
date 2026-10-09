import express from 'express';
import { z } from 'zod';
import * as platformService from './platform.service.js';
import { authenticate } from '../../shared/middleware/auth.js';
import { authorize } from '../../shared/middlewares/authorize.js';
import { validate } from '../../shared/middleware/validate.js';
import { auditLog } from '../../shared/middleware/audit.js';
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

const createSchema = {
  body: z.object({
    ...companyFields,
    admin: z.object({
      fullName: z.string().trim().min(1, 'Nombre del administrador requerido').max(120),
      username: z.string().trim().min(3).max(50).regex(/^[a-zA-Z0-9._-]+$/, 'Solo letras, números, punto, guion y guion bajo'),
      password: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres').max(100),
    }),
  }),
};
const updateSchema = {
  params: idParams,
  body: z
    .object({ ...companyFields, active: z.boolean() })
    .partial()
    .refine(data => Object.keys(data).length > 0, 'Al menos un campo es requerido'),
};
const resetSchema = {
  params: z.object({ id: z.string().min(1).max(64), userId: z.string().min(1).max(64) }),
  body: z.object({ password: z.string().min(8).max(100) }),
};

// Solo el equipo de la plataforma
router.use(authenticate, authorize('SUPERADMIN'));

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
    res.json(await platformService.resetCompanyUserPassword(req.params.id, req.params.userId, req.body.password));
  })
);

export default router;
