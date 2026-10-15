// Escenario con facturación electrónica: cada venta firma un e-CF y valida el XSD, contra el simulador local de la DGII.
// Preparar con:  node --env-file=apps/api/.env scripts/load-test.mjs --serve --ecf --companies 20 --terminals 5
//   k6 run -e SCENARIO=20 scripts/load/ecf.k6.js
// Variables: DURATION (2m), THINK_MS (2000), P95_MS (2500), FAIL_RATE (0.01). NUNCA contra producción.
import { fail } from 'k6';
import { buildOptions, seed, sellOnce, setupSession } from './lib.js';

export const options = buildOptions({ p95Ms: 2500 });
export function setup() {
  if (!seed.ecf) fail('El entorno sembrado no tiene facturación electrónica. Prepárelo con --serve --ecf.');
  return setupSession();
}
export default sellOnce;
