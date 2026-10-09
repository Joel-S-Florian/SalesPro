import { z } from 'zod';

const supplierId = z.string().min(1).max(64);

const supplierFields = {
  name: z.string().trim().min(1, 'Nombre requerido').max(200),
  rnc: z.string().trim().max(11).optional().or(z.literal('')),
  contactName: z.string().trim().max(200).optional().or(z.literal('')),
  email: z.string().email('Email inválido').optional().or(z.literal('')),
  phone: z.string().trim().max(30).optional().or(z.literal('')),
  address: z.string().trim().max(500).optional().or(z.literal('')),
  paymentTerms: z.string().trim().max(100).optional().or(z.literal('')),
};

export const createSupplierSchema = z.object({
  body: z.object(supplierFields),
});

export const updateSupplierSchema = z.object({
  params: z.object({ id: supplierId }),
  body: z
    .object({ ...supplierFields, active: z.boolean() })
    .partial()
    .refine(data => Object.keys(data).length > 0, 'Al menos un campo es requerido'),
});

export const supplierIdParamSchema = z.object({
  params: z.object({ id: supplierId }),
});

export const supplierQuerySchema = z.object({
  query: z.object({
    q: z.string().optional(),
    active: z.enum(['true', 'false']).optional(),
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(20),
    sortBy: z.string().default('name'),
    sortOrder: z.enum(['asc', 'desc']).default('asc'),
  }),
});

export const supplierPurchasesQuerySchema = z.object({
  params: z.object({ id: supplierId }),
  query: z.object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(20),
  }),
});
