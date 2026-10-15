// Prueba de carga multicliente: varias empresas, cada una con varias cajas vendiendo a la vez contra UN solo API y UNA sola base de datos.
// Mide latencia (p50/p95/p99), errores y rendimiento, y verifica que los datos cuadren y que ninguna empresa vea datos de otra.
//
// SEGURIDAD: nunca toca la base de desarrollo. Crea una base aparte («factos_load»), levanta su propio API en otro puerto (4091)
// y, al terminar, borra la base (usa --keep para conservarla).
//
//   node --env-file=apps/api/.env scripts/load-test.mjs [--companies 5] [--terminals 3] [--duration 30] [--products 200]
//                                                       [--think-ms 200] [--hot 30] [--keep] [--port 4091]
//                                                       [--ecf] [--serve [--serve-seconds N]] [--sim-port 4093]
//
//   --ecf    cada venta emite un e-CF firmado (RSA + XSD dentro de la transacción) contra el simulador local de la DGII
//   --serve  prepara todo (base, empresas, API, simulador), escribe scripts/load/.seed.json y se queda esperando (Ctrl+C para borrar):
//            es la base de los escenarios de k6 de scripts/load/ (ver Doc/Pruebas_de_Carga.md)
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
};
const COMPANIES = Number(arg('companies', 5));
const TERMINALS = Number(arg('terminals', 3));
const DURATION_S = Number(arg('duration', 30));
const PRODUCTS = Number(arg('products', 200));
const THINK_MS = Number(arg('think-ms', 200));
const HOT = Math.min(PRODUCTS, Number(arg('hot', 30))); // pocos productos «calientes»: fuerza competencia por el mismo stock
const PORT = Number(arg('port', 4091));
const KEEP = process.argv.includes('--keep');
const ECF = process.argv.includes('--ecf');
const SERVE = process.argv.includes('--serve');
const SIM_PORT = Number(arg('sim-port', 4093));
const DB_NAME = 'factos_load';
const PASSWORD = 'Load-test-pass-1';
const INITIAL_STOCK = 1_000_000;
const REPO = path.resolve(fileURLToPath(new URL('..', import.meta.url)));

// --- Base de datos aparte: se deriva de la URL de desarrollo cambiando solo el nombre ---
const devUrl = process.env.DATABASE_URL;
if (!devUrl) throw new Error('Falta DATABASE_URL (use --env-file=apps/api/.env)');
const url = new URL(devUrl);
const adminUrl = new URL(devUrl);
adminUrl.pathname = '/postgres';
url.pathname = `/${DB_NAME}`;
const loadUrl = url.toString();
if (path.basename(url.pathname) === path.basename(new URL(devUrl).pathname)) throw new Error('La base de carga no puede ser la de desarrollo');

const require = createRequire(path.join(REPO, 'package.json'));
const { PrismaClient } = require('@prisma/client');

const admin = new PrismaClient({ datasources: { db: { url: adminUrl.toString() } }, log: [] });
await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS ${DB_NAME} WITH (FORCE)`);
await admin.$executeRawUnsafe(`CREATE DATABASE ${DB_NAME}`);
console.log(`Base «${DB_NAME}» creada. Aplicando migraciones...`);
const migrate = spawnSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['prisma', 'migrate', 'deploy'], { cwd: REPO, env: { ...process.env, DATABASE_URL: loadUrl }, encoding: 'utf8', shell: process.platform === 'win32' });
if (migrate.status !== 0) {
  console.error(migrate.stdout, migrate.stderr);
  throw new Error('No se pudieron aplicar las migraciones');
}

const db = new PrismaClient({ datasources: { db: { url: loadUrl } }, log: [] });
const bcrypt = require('bcryptjs');
const passwordHash = await bcrypt.hash(PASSWORD, 10);

// e-CF: se usan las mismas piezas que el sistema (certificado de prueba, cifrado en reposo y simulador de la DGII)
const ecfTools = ECF
  ? {
      ...(await import(new URL('../apps/api/src/modules/ecf/ecf.certificate.js', import.meta.url).href)),
      ...(await import(new URL('../apps/api/src/shared/utils/secretBox.js', import.meta.url).href)),
    }
  : null;
let simServer = null;
if (ECF) {
  const { createDgiiSimulator } = await import(new URL('../apps/api/src/modules/ecf/sim/dgii-simulator.js', import.meta.url).href);
  const express = require('express');
  const sim = createDgiiSimulator({ publicUrl: `http://127.0.0.1:${SIM_PORT}` });
  const simApp = express();
  simApp.use(sim.app);
  simServer = await new Promise(resolve => {
    const s = simApp.listen(SIM_PORT, '127.0.0.1', () => resolve(s));
  });
  console.log(`Simulador de la DGII en el puerto ${SIM_PORT}`);
}

// --- Datos: empresas, cajas, cajeros y productos ---
console.log(`Creando ${COMPANIES} empresas con ${TERMINALS} cajas y ${PRODUCTS} productos cada una...`);
const world = [];
for (let c = 0; c < COMPANIES; c++) {
  const company = await db.company.create({ data: { name: `Carga ${c + 1}`, plan: 'FREE' } });
  const category = await db.category.create({ data: { name: 'General', companyId: company.id } });
  const consumer = await db.customer.create({ data: { documentId: '000000000', name: 'Consumidor Final', companyId: company.id } });
  // Las secuencias de comprobantes las crea el propio API al arrancar (initializeNCFSequences)
  const adminUser = await db.user.create({ data: { username: `load_c${c}_admin`, passwordHash, fullName: `Admin ${c + 1}`, role: 'ADMINISTRADOR', companyId: company.id } });
  await db.product.createMany({
    data: Array.from({ length: PRODUCTS }, (_, i) => ({ code: `L${c}-${String(i).padStart(4, '0')}`, name: `Producto ${c + 1}-${i}`, categoryId: category.id, costPrice: 50, salePrice: 100 + (i % 50), stock: INITIAL_STOCK, minStock: 1, companyId: company.id })),
  });
  const products = await db.product.findMany({ where: { companyId: company.id }, select: { id: true, code: true }, orderBy: { code: 'asc' } });
  const cashiers = [];
  for (let t = 0; t < TERMINALS; t++) {
    const user = await db.user.create({ data: { username: `load_c${c}_t${t}`, passwordHash, fullName: `Cajero ${c + 1}-${t + 1}`, role: 'VENDEDOR', companyId: company.id } });
    const terminal = await db.terminal.create({ data: { name: `Caja ${t + 1}`, companyId: company.id, users: { connect: { id: user.id } } } });
    cashiers.push({ username: user.username, userId: user.id, terminalId: terminal.id });
  }
  if (ECF) {
    // Facturación electrónica en pre-certificación con un certificado de PRUEBA (el simulador de la DGII lo acepta)
    const rnc = `13${String(1000000 + c).padStart(7, '0')}`;
    await db.company.update({ where: { id: company.id }, data: { rnc, address: 'Calle Principal #1, Santiago' } });
    const cert = ecfTools.generateTestPkcs12({ rnc, password: 'prueba123' });
    await db.ecfConfig.create({
      data: { companyId: company.id, mode: 'PRECERT', legalName: `CARGA ${c + 1} SRL`, address: 'Calle Principal #1, Santiago', certificateEnc: ecfTools.encryptSecret(cert.p12), certificatePassEnc: ecfTools.encryptSecret(cert.password), certNotAfter: new Date(Date.now() + 300 * 86400000), certRncMatch: true },
    });
    await db.ecfSequence.create({ data: { companyId: company.id, ecfType: 'E32', rangeFrom: 1, rangeTo: 99_000_000, current: 0, validUntil: new Date('2028-12-31T12:00:00Z') } });
  }
  world.push({ companyId: company.id, name: company.name, adminUsername: adminUser.username, customerId: consumer.id, products, cashiers, stats: { ok: 0, qty: 0, total: 0, ids: new Set() } });
}

// --- API propio en otro puerto, contra la base de carga ---
console.log(`Levantando el API en el puerto ${PORT}...`);
const apiEnv = { ...process.env, PORT: String(PORT), DATABASE_URL: loadUrl, NODE_ENV: 'production', RATE_LIMIT_MAX_REQUESTS: '10000000', SALES_RATE_LIMIT_PER_MIN: '10000000', BCRYPT_ROUNDS: '10', ...(ECF ? { ECF_BASE_URL_OVERRIDE: `http://127.0.0.1:${SIM_PORT}` } : {}) };
fs.mkdirSync(path.join(REPO, 'storage', 'load-reports'), { recursive: true });
const apiLogPath = path.join(REPO, 'storage', 'load-reports', 'api.log');
const apiLog = fs.openSync(apiLogPath, 'w');
const api = spawn(process.execPath, ['src/server.js'], { cwd: path.join(REPO, 'apps', 'api'), env: apiEnv, stdio: ['ignore', apiLog, apiLog] });
const BASE = `http://127.0.0.1:${PORT}/api`;
for (let i = 0; i < 60; i++) {
  try {
    if ((await fetch(`${BASE}/health`)).ok) break;
  } catch {
    // aún arrancando
  }
  await new Promise(r => setTimeout(r, 500));
}

// --- Cliente HTTP con medición ---
const lat = new Map(); // etiqueta → [ms]
const errors = new Map(); // «etiqueta status» → cantidad
const record = (label, ms) => (lat.has(label) ? lat.get(label).push(ms) : lat.set(label, [ms]));
async function http(label, method, route, { token, body } = {}) {
  const started = performance.now();
  let status = 0;
  let json = null;
  try {
    const res = await fetch(BASE + route, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
    status = res.status;
    json = await res.json().catch(() => null);
  } catch (err) {
    status = -1;
    json = { error: err.message };
  }
  record(label, performance.now() - started);
  if (status < 200 || status >= 300) errors.set(`${label} ${status}`, (errors.get(`${label} ${status}`) || 0) + 1);
  return { status, json };
}

// Segundos de CPU acumulados de un proceso (o de todos los procesos con ese nombre): sirve para saber si el cuello es el API o la base
const cpuSeconds = target => {
  if (process.platform !== 'win32') return null;
  const filter = typeof target === 'number' ? `Get-Process -Id ${target}` : `Get-Process -Name ${target}`;
  const out = spawnSync(path.join(process.env.SystemRoot || 'C:\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'), ['-NoProfile', '-Command', `($(${filter} -ErrorAction SilentlyContinue | ForEach-Object { $_.TotalProcessorTime.TotalSeconds }) | Measure-Object -Sum).Sum`], { encoding: 'utf8' }).stdout;
  const value = Number(String(out).trim().replace(',', '.'));
  return Number.isFinite(value) ? value : null;
};

const sampler = { rss: [], conns: [] };
const sampleApiMemory = () => {
  try {
    if (process.platform === 'win32') {
      const out = spawnSync(path.join(process.env.SystemRoot || 'C:\Windows', 'System32', 'tasklist.exe'), ['/FI', `PID eq ${api.pid}`, '/FO', 'CSV', '/NH'], { encoding: 'utf8' }).stdout;
      const kb = Number((out.split('","')[4] || '').replace(/[^\d]/g, ''));
      if (kb) sampler.rss.push(kb / 1024);
    } else {
      const kb = Number(spawnSync('ps', ['-o', 'rss=', '-p', String(api.pid)], { encoding: 'utf8' }).stdout);
      if (kb) sampler.rss.push(kb / 1024);
    }
  } catch {
    // sin medición de memoria
  }
};

let failed = 0;
const check = (name, ok, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`);
  if (!ok) failed++;
};
const pct = (values, p) => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
};

class ServeStopped extends Error {}

try {
  if (SERVE) {
    // Entorno para los escenarios de k6 (scripts/load/*.k6.js): se escribe el archivo de siembra y se espera
    const seedFile = path.join(REPO, 'scripts', 'load', '.seed.json');
    fs.mkdirSync(path.dirname(seedFile), { recursive: true });
    fs.writeFileSync(
      seedFile,
      JSON.stringify(
        {
          baseUrl: BASE,
          password: PASSWORD,
          ecf: ECF,
          companies: world.map(w => ({ name: w.name, adminUsername: w.adminUsername, customerId: w.customerId, products: w.products.slice(0, HOT).map(p => p.id), cashiers: w.cashiers.map(c => ({ username: c.username, terminalId: c.terminalId })) })),
        },
        null,
        2
      )
    );
    console.log(`\nListo para k6: ${COMPANIES} empresas × ${TERMINALS} cajas (${COMPANIES * TERMINALS} cajeros). API en ${BASE}${ECF ? ' con e-CF contra el simulador' : ''}.`);
    console.log(`Archivo de siembra: ${seedFile}\nEjemplo:  k6 run -e SCENARIO=50 scripts/load/sales.k6.js\nCtrl+C para apagar y borrar la base.`);
    const serveSeconds = Number(arg('serve-seconds', 0)); // 0 = hasta Ctrl+C
    await new Promise(resolve => {
      process.once('SIGINT', resolve);
      if (serveSeconds > 0) setTimeout(resolve, serveSeconds * 1000);
    });
    throw new ServeStopped();
  }

  // --- Inicios de sesión y apertura de turnos ---
  console.log(`Iniciando sesión de ${COMPANIES * (TERMINALS + 1)} usuarios y abriendo ${COMPANIES * TERMINALS} turnos...`);
  // Ola de inicios de sesión: 25 a la vez (como una mañana de apertura, no 100+ simultáneos desde una sola conexión)
  const loginTasks = world.flatMap(w => [
    () => http('login', 'POST', '/auth/login', { body: { username: w.adminUsername, password: PASSWORD } }).then(r => (w.adminToken = r.json?.accessToken)),
    ...w.cashiers.map(cashier => async () => {
      const r = await http('login', 'POST', '/auth/login', { body: { username: cashier.username, password: PASSWORD } });
      cashier.token = r.json?.accessToken;
      await http('abrir turno', 'POST', '/cashier/open', { token: cashier.token, body: { terminalId: cashier.terminalId, openingBalance: 1000 } });
    }),
  ]);
  for (let i = 0; i < loginTasks.length; i += 25) await Promise.all(loginTasks.slice(i, i + 25).map(task => task()));
  check('todos los usuarios pudieron iniciar sesión', world.every(w => w.adminToken && w.cashiers.every(c => c.token)));

  // --- Carga: cada caja vende sin parar durante DURATION_S ---
  console.log(`\nVendiendo durante ${DURATION_S} s (${COMPANIES * TERMINALS} cajas, pausa ${THINK_MS} ms entre ventas)...`);
  const stopAt = Date.now() + DURATION_S * 1000;
  const memTimer = setInterval(sampleApiMemory, 2000);
  const connTimer = setInterval(async () => {
    try {
      const rows = await admin.$queryRawUnsafe(`select count(*)::int as n from pg_stat_activity where datname='${DB_NAME}'`);
      sampler.conns.push(rows[0].n);
    } catch {
      // sin medición
    }
  }, 2000);
  const cpuBefore = { api: cpuSeconds(api.pid), db: cpuSeconds('postgres') };
  const startedAt = performance.now();

  const rnd = n => Math.floor(Math.random() * n);
  await Promise.all([
    ...world.flatMap(w =>
      w.cashiers.map(async (cashier, index) => {
        let n = 0;
        while (Date.now() < stopAt) {
          n++;
          const lines = Array.from({ length: 1 + rnd(3) }, () => ({ productId: w.products[rnd(HOT)].id, quantity: 1 + rnd(3), discount: 0 }));
          // Una línea por producto distinto (el POS agrupa las repetidas)
          const merged = [...new Map(lines.map(l => [l.productId, l])).values()];
          const r = await http('venta', 'POST', '/sales', { token: cashier.token, body: { customerId: w.customerId, terminalId: cashier.terminalId, details: merged, discount: 0, paymentMethod: 'EFECTIVO' } });
          if (r.status === 201) {
            w.stats.ok++;
            w.stats.total += Number(r.json.total) || 0;
            w.stats.ids.add(r.json.id);
            w.stats.qty += merged.reduce((a, l) => a + l.quantity, 0);
          }
          // Cada cierto tiempo el cajero busca productos (lectura)
          if (n % 4 === 0) await http('buscar producto', 'GET', `/products?q=${encodeURIComponent('Producto ' + (index + 1))}&limit=20`, { token: cashier.token });
          await new Promise(r2 => setTimeout(r2, rnd(THINK_MS * 2)));
        }
      })
    ),
    // El administrador de cada empresa consulta el tablero cada 3 s
    ...world.map(async w => {
      while (Date.now() < stopAt) {
        await http('tablero (admin)', 'GET', '/reports/dashboard', { token: w.adminToken });
        await new Promise(r => setTimeout(r, 3000));
      }
    }),
  ]);
  clearInterval(memTimer);
  clearInterval(connTimer);
  const elapsed = (performance.now() - startedAt) / 1000;
  const cpuAfter = { api: cpuSeconds(api.pid), db: cpuSeconds('postgres') };
  const cores = os.cpus().length;
  // Si Windows no deja leer la CPU de PostgreSQL (servicio de otro usuario), da 0: se reporta como no disponible
  const cpuPct = key => (cpuBefore[key] === null || cpuAfter[key] === null || cpuAfter[key] === 0 ? null : Math.round(((cpuAfter[key] - cpuBefore[key]) / elapsed) * 100));

  // --- Resultados de rendimiento ---
  const sales = lat.get('venta') || [];
  console.log('\nLatencia por operación (ms):');
  console.log('operación'.padEnd(20), 'n'.padStart(7), 'p50'.padStart(7), 'p95'.padStart(7), 'p99'.padStart(7), 'máx'.padStart(7));
  const report = { config: { COMPANIES, TERMINALS, DURATION_S, PRODUCTS, THINK_MS, HOT }, latency: {}, errors: Object.fromEntries(errors) };
  for (const [label, values] of lat) {
    const row = { n: values.length, p50: pct(values, 50), p95: pct(values, 95), p99: pct(values, 99), max: Math.max(...values) };
    report.latency[label] = Object.fromEntries(Object.entries(row).map(([k, v]) => [k, Math.round(v)]));
    console.log(label.padEnd(20), String(row.n).padStart(7), ...['p50', 'p95', 'p99', 'max'].map(k => String(Math.round(row[k])).padStart(7)));
  }
  const okSales = world.reduce((a, w) => a + w.stats.ok, 0);
  const rps = [...lat.values()].reduce((a, v) => a + v.length, 0) / elapsed;
  report.throughput = { salesPerSecond: +(okSales / elapsed).toFixed(2), requestsPerSecond: +rps.toFixed(1), sales: okSales, seconds: +elapsed.toFixed(1) };
  report.cpu = { apiPercentOfOneCore: cpuPct('api'), postgresPercentOfOneCore: cpuPct('db'), cores };
  report.resources = { apiRssMbMax: Math.round(Math.max(0, ...sampler.rss)), apiRssMbFirst: Math.round(sampler.rss[0] || 0), dbConnectionsMax: Math.max(0, ...sampler.conns) };
  console.log(`\nVentas correctas: ${okSales} en ${elapsed.toFixed(1)} s → ${(okSales / elapsed).toFixed(1)} ventas/s (${rps.toFixed(0)} solicitudes/s en total)`);
  if (report.cpu.apiPercentOfOneCore !== null) console.log(`CPU: API (Node) ${report.cpu.apiPercentOfOneCore} % de un núcleo · PostgreSQL ${report.cpu.postgresPercentOfOneCore ?? 'n/d (sin permiso para leerlo)'}${report.cpu.postgresPercentOfOneCore === null ? '' : ' %'} de un núcleo (equipo de ${cores} núcleos).`);
  console.log(`Memoria del API: ${report.resources.apiRssMbFirst} → ${report.resources.apiRssMbMax} MB · conexiones a la base (máx.): ${report.resources.dbConnectionsMax}`);
  console.log('Errores:', errors.size ? Object.fromEntries(errors) : 'ninguno');

  // --- Verificación de datos ---
  console.log('\nVerificación de datos:');
  check('hubo ventas en todas las empresas', world.every(w => w.stats.ok > 0));
  check('sin errores de servidor (5xx) ni de red', ![...errors.keys()].some(k => /\s(5\d\d|-1)$/.test(k)), [...errors.keys()].filter(k => /\s(5\d\d|-1)$/.test(k)).join(', '));
  check('sin ventas rechazadas por competencia o stock', !errors.has('venta 409') && !errors.has('venta 400'), JSON.stringify(Object.fromEntries([...errors].filter(([k]) => k.startsWith('venta')))));

  let leak = 0;
  for (const w of world) {
    const where = { companyId: w.companyId };
    const dbSales = await db.sale.findMany({ where, select: { id: true, invoiceNumber: true, total: true, cashierCloseId: true } });
    check(`${w.name}: las ventas en la base = las confirmadas por el API (${w.stats.ok})`, dbSales.length === w.stats.ok && dbSales.every(s => w.stats.ids.has(s.id)));
    const invoices = dbSales.map(s => s.invoiceNumber);
    check(`${w.name}: facturas sin repetir`, new Set(invoices).size === invoices.length);
    const sumDb = dbSales.reduce((a, s) => a + s.total, 0);
    check(`${w.name}: el total vendido cuadra`, Math.abs(sumDb - w.stats.total) < 0.5, `${sumDb.toFixed(2)} vs ${w.stats.total.toFixed(2)}`);

    const sold = await db.saleDetail.groupBy({ by: ['productId'], where, _sum: { quantity: true } });
    const soldMap = new Map(sold.map(s => [s.productId, s._sum.quantity]));
    const products = await db.product.findMany({ where, select: { id: true, stock: true } });
    const wrong = products.filter(p => p.stock !== INITIAL_STOCK - (soldMap.get(p.id) || 0));
    check(`${w.name}: el inventario cuadra producto por producto (sin ventas «perdidas» por competencia)`, wrong.length === 0, wrong.length ? `${wrong.length} productos descuadrados` : '');
    check(`${w.name}: ningún stock negativo`, products.every(p => p.stock >= 0));

    // Aislamiento: el administrador solo ve lo suyo y no puede leer ventas de otra empresa
    const mine = await http('listar ventas (admin)', 'GET', '/sales?limit=100', { token: w.adminToken });
    const ids = (mine.json?.data || []).map(s => s.id);
    const foreign = ids.filter(id => !w.stats.ids.has(id));
    if (foreign.length) leak++;
    check(`${w.name}: el listado de ventas del administrador solo trae las de su empresa`, mine.status === 200 && foreign.length === 0 && (mine.json?.pagination?.total ?? 0) === w.stats.ok, `${mine.json?.pagination?.total} vs ${w.stats.ok}`);
  }
  if (ECF) {
    // Los e-CF se envían a la DGII (simulador) en segundo plano: se espera a que se vacíe la cola
    let docs = [];
    for (let i = 0; i < 120; i++) {
      docs = await db.ecfDocument.groupBy({ by: ['status'], _count: true });
      if (!docs.some(d => ['PENDING', 'SENDING', 'ERROR'].includes(d.status))) break;
      await new Promise(r => setTimeout(r, 1000));
    }
    const byStatus = Object.fromEntries(docs.map(d => [d.status, d._count]));
    console.log('e-CF por estado:', byStatus);
    report.ecf = byStatus;
    for (const w of world) {
      const ncfs = (await db.sale.findMany({ where: { companyId: w.companyId }, select: { eNcf: true } })).map(s => s.eNcf);
      check(`${w.name}: todas las ventas tienen e-NCF y no se repite ninguno`, ncfs.every(Boolean) && new Set(ncfs).size === ncfs.length, `${ncfs.length} ventas`);
      const numbers = ncfs.map(n => Number(n.slice(3))).sort((x, y) => x - y);
      check(`${w.name}: la numeración e-NCF es continua (sin saltos ni repetidos)`, numbers.every((n, i) => n === i + 1));
    }
    check('ningún comprobante terminó en error ni rechazado', !byStatus.ERROR && !byStatus.REJECTED, JSON.stringify(byStatus));
  }
  if (world.length > 1) {
    const [a, b] = world;
    const stolen = await http('lectura cruzada', 'GET', `/sales/${[...b.stats.ids][0]}`, { token: a.adminToken });
    check('una empresa NO puede leer una venta de otra (404)', stolen.status === 404, `estado ${stolen.status}`);
    const stolenProduct = await http('lectura cruzada', 'GET', `/products/${b.products[0].id}`, { token: a.adminToken });
    check('una empresa NO puede leer un producto de otra (404)', stolenProduct.status === 404, `estado ${stolenProduct.status}`);
  }
  check('ninguna fuga de datos entre empresas', leak === 0);

  const dir = path.join(REPO, 'storage', 'load-reports');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `load-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  // Mensajes de error del API durante la prueba (los 5xx)
  const apiLogText = fs.readFileSync(apiLogPath, 'utf8');
  const serverErrors = [...new Set(apiLogText.split(/\r?\n/).filter(l => /ERROR|Error:|error:/.test(l) && !/DEBUG AUTH/.test(l)).map(l => l.slice(0, 200)))].slice(0, 8);
  if (serverErrors.length) console.log('Errores registrados por el API:', serverErrors);
  report.serverErrors = serverErrors;
  report.machine = { cpus: os.cpus().length, cpuModel: os.cpus()[0]?.model, totalMemGb: +(os.totalmem() / 1e9).toFixed(1), node: process.version };
  report.checksFailed = failed;
  fs.writeFileSync(file, JSON.stringify(report, null, 2));
  console.log(`\nInforme guardado en ${file}`);
} catch (error) {
  if (!(error instanceof ServeStopped)) throw error;
  console.log('Servicio detenido: se apaga el API y se borra la base.');
} finally {
  api.kill();
  simServer?.close();
  await db.$disconnect();
  if (!KEEP) {
    await new Promise(r => setTimeout(r, 800));
    await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS ${DB_NAME} WITH (FORCE)`).catch(e => console.log('No se pudo borrar la base de carga:', e.message));
  } else {
    console.log(`Base «${DB_NAME}» conservada (${loadUrl.replace(/:[^:@]+@/, ':***@')}).`);
  }
  await admin.$disconnect();
}

console.log(failed ? `\n${failed} FALLO(S)` : '\nTodo en orden');
process.exit(failed ? 1 : 0);
