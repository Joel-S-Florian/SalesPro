// Piezas comunes de los escenarios de k6 (ventas con cajas concurrentes).
// Requiere el entorno preparado por:  node --env-file=apps/api/.env scripts/load-test.mjs --serve [--ecf] --companies 20 --terminals 5
// (escribe scripts/load/.seed.json con las empresas, cajeros y productos de prueba, y deja el API y la base de carga corriendo).
import http from 'k6/http';
import { check, fail, sleep } from 'k6';
import { SharedArray } from 'k6/data';

export const seed = JSON.parse(open('./.seed.json'));

// Un cajero por usuario virtual: se reparten las cajas de todas las empresas sembradas
export const cashiers = new SharedArray('cajeros', () => seed.companies.flatMap(company => company.cashiers.map(cashier => ({ ...cashier, customerId: company.customerId, products: company.products }))));

const env = (name, fallback) => (__ENV[name] !== undefined && __ENV[name] !== '' ? __ENV[name] : fallback);
export const VUS = Number(env('SCENARIO', '20')); // 20, 50 o 100 cajas simultáneas
export const THINK_MS = Number(env('THINK_MS', '2000')); // pausa media entre ventas de un cajero

/** Opciones de k6: una sola prueba con `VUS` cajeros durante `DURATION`, con umbrales configurables por variables de entorno. */
export function buildOptions({ p95Ms, failRate = 0.01 }) {
  return {
    scenarios: {
      [`cajas_${VUS}`]: { executor: 'constant-vus', vus: VUS, duration: env('DURATION', '2m'), exec: 'default' },
    },
    thresholds: {
      'http_req_duration{name:sale}': [`p(95)<${Number(env('P95_MS', p95Ms))}`],
      'http_req_failed{name:sale}': [`rate<${Number(env('FAIL_RATE', failRate))}`],
      checks: ['rate>0.99'],
    },
    summaryTrendStats: ['avg', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'],
  };
}

const json = { headers: { 'Content-Type': 'application/json' } };
const auth = token => ({ headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` } });

/** Inicia sesión de los cajeros que se van a usar y abre su turno (en olas de 25, como una mañana de apertura). */
export function setupSession() {
  if (VUS > cashiers.length) fail(`El escenario pide ${VUS} cajas pero solo hay ${cashiers.length} sembradas. Vuelva a preparar el entorno con más empresas o cajas (--companies / --terminals).`);
  const tokens = [];
  for (let start = 0; start < VUS; start += 25) {
    const batch = [];
    for (let i = start; i < Math.min(start + 25, VUS); i++) {
      batch.push(['POST', `${seed.baseUrl}/auth/login`, JSON.stringify({ username: cashiers[i].username, password: seed.password }), { ...json, tags: { name: 'login' } }]);
    }
    const responses = http.batch(batch);
    responses.forEach((res, offset) => {
      const index = start + offset;
      check(res, { 'inicio de sesión correcto': r => r.status === 200 });
      tokens[index] = res.json('accessToken');
      http.post(`${seed.baseUrl}/cashier/open`, JSON.stringify({ terminalId: cashiers[index].terminalId, openingBalance: 1000 }), { ...auth(tokens[index]), tags: { name: 'open_shift' } });
    });
  }
  return { tokens };
}

/** Una venta en efectivo de 1 a 3 productos «calientes» (compiten por el mismo stock) y una pausa de cajero. */
export function sellOnce(data) {
  const index = (__VU - 1) % VUS;
  const cashier = cashiers[index];
  const lines = [];
  const used = new Set();
  for (let i = 0; i < 1 + Math.floor(Math.random() * 3); i++) {
    const productId = cashier.products[Math.floor(Math.random() * cashier.products.length)];
    if (used.has(productId)) continue;
    used.add(productId);
    lines.push({ productId, quantity: 1 + Math.floor(Math.random() * 3), discount: 0 });
  }
  const res = http.post(
    `${seed.baseUrl}/sales`,
    JSON.stringify({ customerId: cashier.customerId, terminalId: cashier.terminalId, details: lines, discount: 0, paymentMethod: 'EFECTIVO' }),
    { ...auth(data.tokens[index]), tags: { name: 'sale' } }
  );
  const okSale = check(res, {
    'venta registrada (201)': r => r.status === 201,
    ...(seed.ecf ? { 'trae e-NCF': r => r.status === 201 && Boolean(r.json('eNcf')) } : {}),
  });
  if (okSale && Math.random() < 0.2) http.get(`${seed.baseUrl}/products?q=Producto&limit=20`, { ...auth(data.tokens[index]), tags: { name: 'search' } });
  sleep((Math.random() * 2 * THINK_MS) / 1000);
}
