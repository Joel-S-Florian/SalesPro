/**
 * FUENTE ÚNICA de los planes de FACTOS: límites, funciones, precios de lista y estado de la prueba.
 * La usan el API (`apps/api`), el panel (`apps/web`) y la página de promoción (`apps/landing`):
 * para cambiar un número se edita SOLO este archivo.
 *
 * PROVISIONAL: los precios y los topes de ventas por mes no están decididos (ver Doc/Planes_y_Limites.md).
 * Funciones puras, sin dependencias: sirven igual en Node y en el navegador.
 */

export const PLAN_IDS = ['FREE', 'STARTER', 'BUSINESS'];

/** Días de gracia después de terminar la prueba, con los mismos límites y un aviso visible. */
export const TRIAL_GRACE_DAYS = 7;

/** Plan que se aplica cuando la prueba y la gracia terminaron sin plan activo. */
export const FALLBACK_PLAN = 'FREE';

const NO_LIMIT = null; // null = sin tope

export const PLANS = {
  FREE: {
    id: 'FREE',
    name: 'Gratis',
    priceMonthlyDop: 0,
    priceProvisional: true,
    selfService: true, // se puede contratar solo en el registro
    limits: { terminals: 1, users: 2, branches: 1, products: 200, salesPerMonth: 300 },
    features: { ecf: false, labels: false, perishables: false, backup: 'csv', whatsappLink: true, whatsappApi: false, autoBackup: false },
  },
  STARTER: {
    id: 'STARTER',
    name: 'Starter',
    priceMonthlyDop: 1500,
    priceProvisional: true,
    selfService: false,
    limits: { terminals: 3, users: 6, branches: 1, products: 3000, salesPerMonth: 2000 },
    features: { ecf: true, labels: true, perishables: true, backup: 'full', whatsappLink: true, whatsappApi: false, autoBackup: false },
  },
  BUSINESS: {
    id: 'BUSINESS',
    name: 'Business',
    priceMonthlyDop: 3500,
    priceProvisional: true,
    selfService: false,
    limits: { terminals: 10, users: 25, branches: 3, products: NO_LIMIT, salesPerMonth: 10000 },
    // autoBackup y whatsappApi son banderas para el futuro: todavía no hay nada implementado detrás
    features: { ecf: true, labels: true, perishables: true, backup: 'full', whatsappLink: true, whatsappApi: true, autoBackup: true },
  },
};

/** Recursos con tope y cómo se llaman en los mensajes. */
export const RESOURCES = {
  terminals: { singular: 'caja', plural: 'cajas' },
  users: { singular: 'usuario activo', plural: 'usuarios activos' },
  branches: { singular: 'sucursal', plural: 'sucursales' },
  products: { singular: 'producto', plural: 'productos' },
  salesPerMonth: { singular: 'venta del mes', plural: 'ventas del mes' },
};

/** Funciones que se bloquean según el plan (las demás banderas son informativas). */
export const FEATURES = {
  ecf: { label: 'Facturación electrónica (e-CF)' },
  labels: { label: 'Etiquetas y códigos de barras' },
  perishables: { label: 'Perecederos, lotes y FEFO' },
  fullBackup: { label: 'Respaldo completo' },
};

export const planName = plan => PLANS[plan]?.name || plan;

export const limitOf = (plan, resource) => (PLANS[plan] || PLANS[FALLBACK_PLAN]).limits[resource] ?? NO_LIMIT;

/** ¿El plan incluye la función? (`fullBackup` = respaldo completo y JSON). */
export function planHasFeature(plan, feature) {
  const features = (PLANS[plan] || PLANS[FALLBACK_PLAN]).features;
  if (feature === 'fullBackup') return features.backup === 'full';
  return Boolean(features[feature]);
}

/** Primer plan (el más barato) que incluye la función. */
export function minPlanForFeature(feature) {
  return PLAN_IDS.find(plan => planHasFeature(plan, feature)) || PLAN_IDS.at(-1);
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Estado efectivo de una empresa según su plan y su prueba.
 *  - TRIAL:   `trialEndsAt` en el futuro → límites del plan contratado.
 *  - GRACE:   hasta 7 días después de `trialEndsAt` → mismos límites, con aviso y cuenta regresiva.
 *  - EXPIRED: pasada la gracia → límites del plan FREE (nunca se borran datos).
 *  - ACTIVE:  sin `trialEndsAt` (plan asignado a mano o gratis sin vencimiento) → límites del plan.
 * @param {{ plan: string, trialEndsAt?: Date|string|null }} company
 * @returns {{ plan: string, effectivePlan: string, status: 'TRIAL'|'GRACE'|'EXPIRED'|'ACTIVE', daysLeft: number|null, graceDaysLeft: number|null, trialEndsAt: Date|null, graceEndsAt: Date|null, downgraded: boolean }}
 */
export function getEffectivePlan(company, now = new Date()) {
  const plan = PLANS[company?.plan] ? company.plan : FALLBACK_PLAN;
  const trialEndsAt = company?.trialEndsAt ? new Date(company.trialEndsAt) : null;
  const base = { plan, trialEndsAt, graceEndsAt: null, daysLeft: null, graceDaysLeft: null };

  if (!trialEndsAt) return { ...base, effectivePlan: plan, status: 'ACTIVE', downgraded: false };

  const graceEndsAt = new Date(trialEndsAt.getTime() + TRIAL_GRACE_DAYS * DAY_MS);
  const t = now.getTime();
  if (t < trialEndsAt.getTime()) {
    return { ...base, graceEndsAt, effectivePlan: plan, status: 'TRIAL', daysLeft: Math.ceil((trialEndsAt.getTime() - t) / DAY_MS), downgraded: false };
  }
  if (t < graceEndsAt.getTime()) {
    return { ...base, graceEndsAt, effectivePlan: plan, status: 'GRACE', graceDaysLeft: Math.ceil((graceEndsAt.getTime() - t) / DAY_MS), downgraded: false };
  }
  return { ...base, graceEndsAt, effectivePlan: FALLBACK_PLAN, status: 'EXPIRED', downgraded: plan !== FALLBACK_PLAN };
}

/** Avisos de uso de un recurso: null, 'WARN' (80 % o más) o 'FULL' (100 % o más). */
export function usageLevel(current, limit) {
  if (limit === null || limit === undefined || limit <= 0) return null;
  const ratio = current / limit;
  if (ratio >= 1) return 'FULL';
  if (ratio >= 0.8) return 'WARN';
  return null;
}

/** Texto de un tope: «3 cajas», «1 sucursal», «Sin tope». */
export function describeLimit(resource, limit) {
  if (limit === null || limit === undefined) return 'Sin tope';
  const names = RESOURCES[resource];
  return `${limit.toLocaleString('es-DO')} ${limit === 1 ? names.singular : names.plural}`;
}

/** Líneas de texto de un plan para la landing y el registro (generadas desde los mismos números: nunca se desfasan). */
export function planFeatureLines(planId) {
  const plan = PLANS[planId];
  if (!plan) return [];
  const { limits, features } = plan;
  const fmt = n => n.toLocaleString('es-DO');
  const lines = [
    `${fmt(limits.terminals)} ${limits.terminals === 1 ? 'caja' : 'cajas'}`,
    `${fmt(limits.users)} usuarios activos`,
    limits.branches > 1 ? `${limits.branches} sucursales` : '1 sucursal',
    limits.products === null ? 'Productos sin tope' : `Hasta ${fmt(limits.products)} productos`,
    `Ventas: aviso a ${fmt(limits.salesPerMonth)} al mes (nunca se bloquean)`,
  ];
  if (features.ecf) lines.push('Facturación electrónica (e-CF)');
  if (features.labels) lines.push('Etiquetas y códigos de barras');
  if (features.perishables) lines.push('Perecederos, lotes y FEFO');
  lines.push(features.backup === 'full' ? 'Respaldo completo (manual)' : 'Respaldo en CSV (manual)');
  lines.push('WhatsApp por enlace con proveedores');
  return lines;
}
