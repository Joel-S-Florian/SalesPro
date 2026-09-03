import { z } from 'zod';

export const createProductSchema = z.object({
  body: z.object({
    code: z.string().min(1, 'Código requerido').max(50).regex(/^[A-Z0-9_-]+$/i, 'Solo letras, números, guiones y guiones bajos'),
    name: z.string().min(1, 'Nombre requerido').max(200),
    description: z.string().max(1000).optional(),
    categoryId: z.string().cuid(),
    costPrice: z.number().positive('Precio de costo debe ser positivo'),
    salePrice: z.number().positive('Precio de venta debe ser positivo'),
    stock: z.number().int().min(0, 'Stock no puede ser negativo').default(0),
    minStock: z.number().int().min(0).default(0),
    active: z.boolean().default(true),
  }),
});

export const updateProductSchema = z.object({
  params: z.object({
    id: z.string().cuid(),
  }),
  body: z.object({
    name: z.string().min(1).max(200).optional(),
    description: z.string().max(1000).optional(),
    categoryId: z.string().cuid().optional(),
    costPrice: z.number().positive().optional(),
    salePrice: z.number().positive().optional(),
    minStock: z.number().int().min(0).optional(),
    active: z.boolean().optional(),
  }).refine(data => Object.keys(data).length > 0, 'Al menos un campo es requerido'),
});

export const productIdParamSchema = z.object({
  params: z.object({
    id: z.string().cuid(),
  }),
});

export const productQuerySchema = z.object({
  query: z.object({
    q: z.string().optional(),
    categoryId: z.string().cuid().optional(),
    active: z.coerce.boolean().optional(),
    lowStock: z.coerce.boolean().optional(),
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(20),
    sortBy: z.string().default('name'),
    sortOrder: z.enum(['asc', 'desc']).default('asc'),
  }),
});

export const adjustStockSchema = z.object({
  body: z.object({
    productId: z.string().cuid(),
    type: z.enum(['ENTRADA', 'SALIDA', 'AJUSTE', 'DEVOLUCION']),
    quantity: z.number().int().positive('Cantidad debe ser positiva'),
    reason: z.string().min(1, 'Motivo requerido').max(500),
  }),
});