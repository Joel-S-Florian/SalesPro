import { z } from 'zod';

export const createCategorySchema = z.object({
  body: z.object({
    name: z.string().min(1, 'Nombre requerido').max(100),
    description: z.string().max(500).optional(),
  }),
});

export const updateCategorySchema = z.object({
  params: z.object({
    id: z.string().cuid(),
  }),
  body: z.object({
    name: z.string().min(1).max(100).optional(),
    description: z.string().max(500).optional(),
  }).refine(data => Object.keys(data).length > 0, 'Al menos un campo es requerido'),
});

export const categoryIdParamSchema = z.object({
  params: z.object({
    id: z.string().cuid(),
  }),
});

export const categoryQuerySchema = z.object({
  query: z.object({
    q: z.string().optional(),
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(20),
    sortBy: z.string().default('name'),
    sortOrder: z.enum(['asc', 'desc']).default('asc'),
  }),
});