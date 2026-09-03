import { z } from 'zod';

export const inventoryLogQuerySchema = z.object({
  query: z.object({
    productId: z.string().cuid().optional(),
    type: z.enum(['ENTRADA', 'SALIDA', 'AJUSTE', 'DEVOLUCION']).optional(),
    userId: z.string().cuid().optional(),
    startDate: z.string().datetime().optional(),
    endDate: z.string().datetime().optional(),
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(50),
    sortBy: z.string().default('createdAt'),
    sortOrder: z.enum(['asc', 'desc']).default('desc'),
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

export const purchaseSchema = z.object({
  body: z.object({
    productId: z.string().cuid(),
    quantity: z.number().int().positive('Cantidad debe ser positiva'),
    unitCost: z.number().positive('Costo unitario debe ser positivo'),
    supplier: z.string().min(1, 'Proveedor requerido').max(200),
    invoiceNumber: z.string().max(50).optional(),
  }),
});