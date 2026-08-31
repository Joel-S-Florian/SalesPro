import { z } from 'zod';
import { validateRNC, validateCedula, getDocumentType } from '../../shared/utils/dgii.js';

export const createCustomerSchema = z.object({
  body: z.object({
    documentId: z.string().min(1, 'Documento de identidad requerido').max(20),
    name: z.string().min(1, 'Nombre requerido').max(200),
    email: z.string().email('Email inválido').optional().or(z.literal('')),
    phone: z.string().max(20).optional(),
    address: z.string().max(500).optional(),
    rnc: z.string().max(11).optional(),
  }).refine(data => {
    // Validate document based on type
    if (data.documentId) {
      const type = getDocumentType(data.documentId);
      if (type === 'RNC' && !validateRNC(data.documentId)) return false;
      if (type === 'CEDULA' && !validateCedula(data.documentId)) return false;
    }
    return true;
  }, { message: 'Documento de identidad inválido', path: ['documentId'] }),
});

export const updateCustomerSchema = z.object({
  params: z.object({
    id: z.string().cuid(),
  }),
  body: z.object({
    documentId: z.string().min(1).max(20).optional(),
    name: z.string().min(1).max(200).optional(),
    email: z.string().email().optional().or(z.literal('')),
    phone: z.string().max(20).optional(),
    address: z.string().max(500).optional(),
    rnc: z.string().max(11).optional(),
  }).refine(data => Object.keys(data).length > 0, 'Al menos un campo es requerido'),
});

export const customerIdParamSchema = z.object({
  params: z.object({
    id: z.string().cuid(),
  }),
});

export const customerQuerySchema = z.object({
  query: z.object({
    q: z.string().optional(),
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(20),
    sortBy: z.string().default('name'),
    sortOrder: z.enum(['asc', 'desc']).default('asc'),
  }),
});