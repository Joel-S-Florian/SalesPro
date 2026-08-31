import { z } from 'zod';

// Definimos los métodos válidos una sola vez para mantener consistencia
const PAYMENT_METHODS = ['EFECTIVO', 'TARJETA'];

export const createSaleSchema = z.object({
  body: z.object({
    customerId: z.string().cuid(),
    details: z.array(z.object({
      productId: z.string().cuid(),
      quantity: z.number().int().positive('Cantidad debe ser positiva'),
      discount: z.number().min(0).default(0),
    })).min(1, 'Al menos un producto es requerido'),
    discount: z.number().min(0).default(0),
    // Validación estricta: solo permite Efectivo o Tarjeta
    paymentMethod: z.preprocess(
      (val) => typeof val === 'string' ? val.toUpperCase() : val, 
      z.enum(PAYMENT_METHODS)
    ).default('EFECTIVO'),
    notes: z.string().max(500).optional(),
  }),
});

export const saleIdParamSchema = z.object({
  params: z.object({
    id: z.string().cuid(),
  }),
});

export const saleQuerySchema = z.object({
  query: z.object({
    customerId: z.string().cuid().optional(),
    userId: z.string().cuid().optional(),
    startDate: z.string().datetime().optional(),
    endDate: z.string().datetime().optional(),
    // Filtro de consulta también limitado a los métodos válidos
    paymentMethod: z.preprocess(
      (val) => typeof val === 'string' ? val.toUpperCase() : val, 
      z.enum(PAYMENT_METHODS)
    ).optional(),
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(20),
    sortBy: z.string().default('createdAt'),
    sortOrder: z.enum(['asc', 'desc']).default('desc'),
  }),
});
