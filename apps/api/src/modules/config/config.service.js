import { z } from 'zod';
import { prisma, basePrisma } from '../../config/db.js';
import { getTenantId } from '../../config/tenant.js';
import { assertFeature } from '../../shared/plans.js';

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

/** Devuelta por billetes y monedas al cobrar en efectivo en el POS. */
export const cashChangeSchema = z.object({
  enabled: z.boolean().default(false),
});

/** Botones de llamar y de WhatsApp (proveedores). El mensaje admite {contacto}, {empresa} y {productos}. */
export const contactActionsSchema = z.object({
  supplierCall: z.boolean().default(true),
  supplierWhatsapp: z.boolean().default(true),
  supplierMessage: z.string().trim().min(1, 'Escribe el mensaje de WhatsApp').max(300).default('Hola {contacto}, le escribimos de {empresa}. Queremos hacer un pedido: {productos}. ¿Nos confirma disponibilidad y precio? Gracias.'),
});

/**
 * Etiquetas: la última elección de papel y opciones, recordada POR EMPRESA (no por navegador).
 * `layout` es null mientras se usa el formato tal cual; con medidas editadas guarda la hoja completa (en milímetros).
 */
const mm = (min, max) => z.number().min(min).max(max);
export const labelsSchema = z.object({
  presetId: z.string().trim().min(1).max(40).default('ROLL_50x25'),
  layout: z
    .object({
      pageW: mm(10, 1000),
      pageH: mm(10, 2000),
      cols: z.number().int().min(1).max(30),
      rows: z.number().int().min(1).max(100),
      marginTop: mm(0, 100),
      marginLeft: mm(0, 100),
      gapX: mm(0, 100),
      gapY: mm(0, 100),
    })
    .nullable()
    .default(null),
  showName: z.boolean().default(true),
  showPrice: z.boolean().default(true),
  split: z.enum(['single', 'perProduct', 'chunk']).default('single'),
  maxPerFile: z.number().int().min(1).max(100000).default(500),
  defaultCopies: z.number().int().min(1).max(9999).default(1),
});

/** Seguridad de la sesión: minutos sin actividad antes de cerrarla (0 = nunca). */
export const securitySchema = z.object({
  idleTimeoutMinutes: z.number().int().min(0).max(1440).default(30),
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
  security: securitySchema,
  cashChange: cashChangeSchema,
  contactActions: contactActionsSchema,
  labels: labelsSchema,
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
  security: { idleTimeoutMinutes: 30 },
  cashChange: { enabled: false },
  contactActions: { supplierCall: true, supplierWhatsapp: true, supplierMessage: 'Hola {contacto}, le escribimos de {empresa}. Queremos hacer un pedido: {productos}. ¿Nos confirma disponibilidad y precio? Gracias.' },
  labels: { presetId: 'ROLL_50x25', layout: null, showName: true, showPrice: true, split: 'single', maxPerFile: 500, defaultCopies: 1 },
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
    security: { ...DEFAULT_CONFIG.security, ...(stored.security || {}) },
    cashChange: { ...DEFAULT_CONFIG.cashChange, ...(stored.cashChange || {}) },
    contactActions: { ...DEFAULT_CONFIG.contactActions, ...(stored.contactActions || {}) },
    labels: { ...DEFAULT_CONFIG.labels, ...(stored.labels || {}) },
  };
}

/**
 * Actualiza una o varias claves. Se valida el resultado completo (config actual + cambios).
 */
export async function updateConfig(changes) {
  const current = await getConfig();
  const merged = configSchema.parse({ ...current, ...changes });
  // Activar la gestión de perecederos exige un plan que la incluya (apagarla siempre se puede)
  if (merged.perishable?.enabled && !current.perishable?.enabled) await assertFeature('perishables');
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
