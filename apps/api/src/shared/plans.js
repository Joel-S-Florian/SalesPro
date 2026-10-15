/**
 * Catálogo de planes: qué incluye cada uno. ESQUELETO: los límites y las funciones por plan se deciden en el Chat de planificación.
 *
 * Mientras `PLAN_ENFORCEMENT` no sea «true» (valor por defecto), **nada se bloquea**: las consultas devuelven «permitido»
 * y la pantalla solo muestra a qué plan pertenece cada función. Así se puede probar todo sin cobrar.
 */
export const PLAN_ORDER = ['FREE', 'STARTER', 'BUSINESS', 'PRO', 'ENTERPRISE'];

/** Primer plan que incluye cada función (provisional). */
export const FEATURE_MIN_PLAN = {
  exportBasic: 'FREE', // ventas, productos y clientes en CSV
  exportFull: 'BUSINESS', // respaldo completo de la empresa y formato JSON
};

export const enforcementEnabled = () => process.env.PLAN_ENFORCEMENT === 'true';

const rank = plan => Math.max(0, PLAN_ORDER.indexOf(plan));

/** ¿El plan incluye esta función? Con la aplicación de límites apagada siempre responde que sí. */
export function planAllows(plan, feature) {
  if (!enforcementEnabled()) return true;
  const min = FEATURE_MIN_PLAN[feature];
  return !min || rank(plan) >= rank(min);
}

/** A qué plan pertenece la función (para mostrarlo aunque no se bloquee). */
export const minPlanFor = feature => FEATURE_MIN_PLAN[feature] || 'FREE';
