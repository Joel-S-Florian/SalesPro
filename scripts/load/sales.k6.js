// Escenario de ventas con cajas concurrentes (sin facturación electrónica).
//   k6 run -e SCENARIO=20  scripts/load/sales.k6.js        (20 cajas)
//   k6 run -e SCENARIO=50  scripts/load/sales.k6.js        (50 cajas)
//   k6 run -e SCENARIO=100 scripts/load/sales.k6.js        (100 cajas)
// Variables: DURATION (2m), THINK_MS (2000), P95_MS (800), FAIL_RATE (0.01). NUNCA contra producción.
import { buildOptions, sellOnce, setupSession } from './lib.js';

export const options = buildOptions({ p95Ms: 800 });
export const setup = setupSession;
export default sellOnce;
