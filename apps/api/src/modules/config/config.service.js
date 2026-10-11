import { z } from 'zod';
import { prisma, basePrisma } from '../../config/db.js';
import { getTenantId } from '../../config/tenant.js';

const text = max => z.string().trim().max(max);

/** Perecederos y lotes: umbrales de alerta y reglas de descuento por cercanía de vencimiento. */
export const perishableSchema = z
  .object({
    enabled: z.boolean().default(false),
    yellowThresholdDays: z.number().int().min(1).max(3650).default(30),
    redThresholdDays: z.number().int().min(1).max(3650).default(7),
    blockExpiredSales: z.boolean().default(true), // no vender lotes vencidos
    autoDiscountEnabled: z.boolean().default(false),
    discountRules: z
      .array(z.object({ daysRemaining: z.number().int().min(0).max(3650), discountPercent: z.number().min(0).max(100) }))
      .max(10)
      .default([
        { daysRemaining: 3, discountPercent: 30 },
        { daysRemaining: 7, discountPercent: 15 },
      ]),
  })
  .superRefine((value, ctx) => {
    if (value.redThresholdDays >= value.yellowThresholdDays) {
      ctx.addIssue({ code: 'custom', path: ['redThresholdDays'], message: 'El umbral rojo debe ser menor que el amarillo' });
    }
    const days = value.discountRules.map(rule => rule.daysRemaining);
    if (new Set(days).size !== days.length) {
      ctx.addIssue({ code: 'custom', path: ['discountRules'], message: 'Hay reglas de descuento con los mismos días' });
    }
  });

/**
 * Esquema de configuración global. Cada clave se guarda como una fila en `system_config`.
 */
export const configSchema = z.object({
  business: z.object({
    name: text(120).min(1),
    rnc: text(20),
    address: text(250),
    phone: text(40),
    email: z.string().trim().email().or(z.literal('')),
  }),
  taxRate: z.number().min(0).max(1),
  receiptFormat: z.enum(['A4', 'TICKET', 'BOTH']),
  paymentMethods: z.array(z.enum(['EFECTIVO', 'TARJETA'])).min(1, 'Debe haber al menos un método de pago'),
  vendedorCanDiscount: z.boolean(),
  requireOpenShift: z.boolean(),
  perishable: perishableSchema,
});

export const DEFAULT_CONFIG = {
  business: {
    name: 'FACTOS',
    rnc: '1-31-88942-1',
    address: 'Av. 27 de Febrero #100, Santo Domingo, Rep. Dom.',
    phone: '(809) 555-0199',
    email: 'ventas@factos.com',
  },
  taxRate: 0.18,
  receiptFormat: 'A4',
  paymentMethods: ['EFECTIVO', 'TARJETA'],
  vendedorCanDiscount: false,
  requireOpenShift: false,
  perishable: {
    enabled: false,
    yellowThresholdDays: 30,
    redThresholdDays: 7,
    blockExpiredSales: true,
    autoDiscountEnabled: false,
    discountRules: [
      { daysRemaining: 3, discountPercent: 30 },
      { daysRemaining: 7, discountPercent: 15 },
    ],
  },
};

export async function getConfig() {
  const companyId = getTenantId();
  const [rows, company] = await Promise.all([
    prisma.systemConfig.findMany(),
    basePrisma.company.findUnique({ where: { id: companyId }, select: { name: true } }),
  ]);
  const stored = Object.fromEntries(rows.map(row => [row.key, row.value]));
  // Una empresa nueva muestra su propio nombre, no los datos de ejemplo
  const businessDefaults = {
    name: company?.name || DEFAULT_CONFIG.business.name,
    rnc: '',
    address: '',
    phone: '',
    email: '',
  };
  return {
    ...DEFAULT_CONFIG,
    ...stored,
    business: { ...businessDefaults, ...(stored.business || {}) },
    perishable: { ...DEFAULT_CONFIG.perishable, ...(stored.perishable || {}) },
  };
}

/**
 * Actualiza una o varias claves. Se valida el resultado completo (config actual + cambios).
 */
export async function updateConfig(changes) {
  const merged = configSchema.parse({ ...(await getConfig()), ...changes });
  const companyId = getTenantId();
  const keys = Object.keys(changes).filter(key => key in merged);

  await prisma.$transaction(
    keys.map(key =>
      prisma.systemConfig.upsert({
        where: { companyId_key: { companyId, key } },
        create: { companyId, key, value: merged[key] },
        update: { value: merged[key] },
      })
    )
  );

  return getConfig();
}
