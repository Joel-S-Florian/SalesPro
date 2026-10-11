import { z } from 'zod';

// Definimos los métodos válidos una sola vez para mantener consistencia
const PAYMENT_METHODS = ['EFECTIVO', 'TARJETA'];

export const createSaleSchema = z.object({
  body: z.object({
    customerId: z.string().cuid(),
    terminalId: z.string().cuid().optional(),
    details: z.array(z.object({
      productId: z.string().cuid(),
      // Entera en UND; a granel admite 2 decimales (el servicio lo valida según la unidad del producto)
      quantity: z.number().positive('Cantidad debe ser positiva'),
      presentationId: z.string().min(1).max(64).optional(),
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

// Forma plana ({ params, body }): es la que `validate()` aplica de verdad (ver shared/middleware/validate.js)
export const creditNoteSchema = {
  params: z.object({ id: z.string().min(1).max(64) }),
  body: z.object({
    terminalId: z.string().min(1).max(64).optional(),
    reason: z.string().trim().min(3, 'Indique el motivo de la devolución').max(200),
    details: z
      .array(z.object({ productId: z.string().min(1).max(64), quantity: z.number().int().positive('Cantidad debe ser positiva') }))
      .min(1, 'Al menos un producto es requerido'),
  }),
};

export const saleQuerySchema = z.object({
  query: z.object({
    customerId: z.string().cuid().optional(),
    userId: z.string().cuid().optional(),
    search: z.string().max(100).optional(),
    startDate: z.string().min(1).max(30).optional(),
    endDate: z.string().min(1).max(30).optional(),
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

export const cartRemovalSchema = z.object({
  body: z.object({
    productId: z.string().cuid(),
    quantity: z.number().positive(),
    reason: z.string().max(200).optional(),
    adminUsername: z.string().max(50).optional(),
    adminPassword: z.string().max(200).optional(),
  }),
});
