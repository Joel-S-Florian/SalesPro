import { z } from 'zod';
import { prisma, basePrisma } from '../../config/db.js';
import { getTenantId } from '../../config/tenant.js';

const text = max => z.string().trim().max(max);

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
