import { basePrisma, prisma } from '../config/db.js';
import { getTenantId } from '../config/tenant.js';
import { AppError } from './exceptions/AppError.js';
import {
  FEATURES,
  PLANS,
  RESOURCES,
  describeLimit,
  getEffectivePlan,
  limitOf,
  minPlanForFeature,
  planHasFeature,
  planName,
  usageLevel,
} from '@factos/shared/plans.js';

/**
 * Planes y límites en el API. Los números viven en `packages/shared/plans.js` (única fuente de verdad);
 * aquí solo se cuenta el uso y se decide qué se permite.
 *
 * Reglas:
 *  - Se bloquea CREAR más cuando se llega al tope. Nunca se desactiva ni se borra nada automáticamente.
 *  - Las ventas jamás se bloquean (el tope mensual es solo informativo).
 *  - El plan que manda es el EFECTIVO: pasada la prueba y la gracia, el de FREE.
 */

/** Primer instante del mes en curso en hora de República Dominicana (UTC-4, sin horario de verano). */
export function monthStartDr(now = new Date()) {
  const local = new Date(now.getTime() - 4 * 3600 * 1000);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), 1, 4, 0, 0));
}

/** Plan y estado efectivo de una empresa (por defecto, la del contexto de la petición). */
export async function getCompanyPlanState(companyId = getTenantId(), now = new Date()) {
  // basePrisma a propósito: `Company` no tiene `companyId` (ver Doc/Arquitectura_Multicliente.md)
  const company = await basePrisma.company.findUnique({ where: { id: companyId }, select: { plan: true, trialEndsAt: true } });
  if (!company) throw AppError.notFound('Empresa no encontrada');
  return getEffectivePlan(company, now);
}

const counters = {
  terminals: () => prisma.terminal.count({ where: { active: true } }),
  users: () => prisma.user.count({ where: { active: true } }),
  // Todavía no existe el módulo de sucursales: cada empresa tiene una
  branches: async () => 1,
  products: () => prisma.product.count({ where: { active: true } }),
  // Ventas del mes sin contar notas de crédito (llevan `relatedSaleId`)
  salesPerMonth: () => prisma.sale.count({ where: { createdAt: { gte: monthStartDr() }, relatedSaleId: null } }),
};

export const countResource = resource => counters[resource]();

/**
 * Lanza PLAN_LIMIT (403) si agregar `adding` unidades del recurso pasaría el tope del plan efectivo.
 * No sirve para `salesPerMonth` (las ventas no se bloquean).
 */
export async function assertWithinPlan(resource, { adding = 1, state } = {}) {
  if (resource === 'salesPerMonth') return;
  const plan = state || (await getCompanyPlanState());
  const limit = limitOf(plan.effectivePlan, resource);
  if (limit === null) return;
  const current = await countResource(resource);
  if (current + adding > limit) {
    const names = RESOURCES[resource];
    throw AppError.planLimit(
      `Tu plan ${planName(plan.effectivePlan)} permite ${describeLimit(resource, limit)} y ya tienes ${current.toLocaleString('es-DO')} (${current === 1 ? names.singular : names.plural}). Para agregar más, cambia de plan o libera espacio desactivando los que no uses.`,
      { resource, plan: plan.effectivePlan, limit, current }
    );
  }
}

/** Lanza PLAN_FEATURE (403) si la función no está incluida en el plan efectivo. */
export async function assertFeature(feature, { state } = {}) {
  const plan = state || (await getCompanyPlanState());
  if (planHasFeature(plan.effectivePlan, feature)) return;
  const requiredPlan = minPlanForFeature(feature);
  throw AppError.planFeature(`${FEATURES[feature].label} está disponible desde el plan ${planName(requiredPlan)}.`, { feature, plan: plan.effectivePlan, requiredPlan });
}

/** ¿Incluye el plan efectivo esta función? (sin lanzar error) */
export async function hasFeature(feature) {
  return planHasFeature((await getCompanyPlanState()).effectivePlan, feature);
}

/** Resumen de plan, estado, uso contra límites y funciones, para `GET /api/company/plan-usage`. */
export async function getPlanUsage() {
  const state = await getCompanyPlanState();
  const usage = {};
  for (const resource of Object.keys(RESOURCES)) {
    const current = await countResource(resource);
    const limit = limitOf(state.effectivePlan, resource);
    usage[resource] = { current, limit, level: usageLevel(current, limit), exceeded: limit !== null && current > limit, blocksCreation: resource !== 'salesPerMonth' && limit !== null && current >= limit };
  }
  const features = Object.fromEntries(Object.keys(FEATURES).map(feature => [feature, { allowed: planHasFeature(state.effectivePlan, feature), requiredPlan: minPlanForFeature(feature) }]));
  return {
    plan: state.plan,
    planName: planName(state.plan),
    effectivePlan: state.effectivePlan,
    effectivePlanName: planName(state.effectivePlan),
    status: state.status,
    daysLeft: state.daysLeft,
    graceDaysLeft: state.graceDaysLeft,
    trialEndsAt: state.trialEndsAt,
    graceEndsAt: state.graceEndsAt,
    downgraded: state.downgraded,
    priceProvisional: PLANS[state.plan]?.priceProvisional ?? true,
    usage,
    features,
    backup: PLANS[state.effectivePlan].features.backup,
  };
}
