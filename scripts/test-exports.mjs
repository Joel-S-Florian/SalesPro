// Prueba de integración de las exportaciones y respaldos por empresa: contenido, aislamiento entre empresas, secretos excluidos,
// paginación de más de 1000 filas, cola, cancelación, enlaces de descarga y vencimiento.
// Usa «Empresa Prueba» y una empresa temporal «ZZ Export B»; deja todo como estaba.
// Uso: node --env-file=apps/api/.env scripts/test-exports.mjs
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(new URL('../package.json', import.meta.url));
const JSZip = require('jszip');

const root = new URL('../apps/api/src/', import.meta.url);
const load = p => import(new URL(p, root).href);
const { basePrisma, prisma } = await load('config/db.js');
const { runInTenant } = await load('config/tenant.js');
const svc = await load('modules/exports/exports.service.js');

let failed = 0;
const check = (name, ok, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`);
  if (!ok) failed++;
};
const expectError = async (name, fn, contains) => {
  try {
    await fn();
    check(name, false, 'no lanzó error');
  } catch (e) {
    check(name, e.message.includes(contains), e.message);
  }
};

const A = await basePrisma.company.findFirst({ where: { name: 'Empresa Prueba' } });
const admin = await basePrisma.user.findFirst({ where: { companyId: A.id, role: 'ADMINISTRADOR' } });
const requester = { userId: admin.id, fullName: admin.fullName, username: admin.username };
const planBefore = A.plan;
const B = await basePrisma.company.create({ data: { name: 'ZZ Export B', plan: 'FREE' } });
const made = { catA: null, catB: null, prodA: null, prodB: null, custA: null, custB: null };

const readZip = async job => {
  const zip = await JSZip.loadAsync(fs.readFileSync(job.filePath));
  const files = {};
  for (const name of Object.keys(zip.files)) files[name] = await zip.files[name].async('string');
  return files;
};
const waitDone = async id => {
  await svc.kick();
  return basePrisma.exportJob.findUnique({ where: { id } });
};

try {
  // --- Datos de prueba en dos empresas ---
  made.catA = (await basePrisma.category.create({ data: { name: 'ZZ-EXP-A', companyId: A.id } })).id;
  made.catB = (await basePrisma.category.create({ data: { name: 'ZZ-EXP-B', companyId: B.id } })).id;
  made.prodA = (await basePrisma.product.create({ data: { code: 'ZZ-EXP-A1', name: '=HYPERLINK("http://x")', description: 'con "comillas", coma\ny salto', categoryId: made.catA, costPrice: 1, salePrice: 2, stock: 5, minStock: 1, companyId: A.id } })).id;
  made.prodB = (await basePrisma.product.create({ data: { code: 'ZZ-EXP-B1', name: 'SECRETO-DE-LA-EMPRESA-B', categoryId: made.catB, costPrice: 1, salePrice: 2, stock: 5, minStock: 1, companyId: B.id } })).id;
  made.custB = (await basePrisma.customer.create({ data: { documentId: '99999999999', name: 'CLIENTE-SOLO-DE-B', companyId: B.id } })).id;
  await basePrisma.inventoryLog.createMany({ data: Array.from({ length: 2300 }, (_, i) => ({ productId: made.prodA, productName: 'x', type: 'ENTRADA', quantity: 1, reason: `zz-export-${i}`, userId: admin.id, userName: 'zz', companyId: A.id })) });

  await runInTenant(A.id, async () => {
    // --- Cola: una a la vez por empresa ---
    const j1 = await svc.createJob(requester, { type: 'PRODUCTS', format: 'CSV' });
    check('la exportación nace pendiente', j1.status === 'PENDING');
    await expectError('no se permite una segunda mientras hay una en curso', () => svc.createJob(requester, { type: 'CUSTOMERS', format: 'CSV' }), 'en curso');
    const done1 = await waitDone(j1.id);
    check('la cola la procesa y queda lista con archivo', done1.status === 'DONE' && fs.existsSync(done1.filePath) && done1.progress === 100, `${done1.status} ${done1.fileSize} bytes`);
    check('vence en 48 horas', Math.abs(done1.expiresAt - Date.now() - 48 * 3600 * 1000) < 120000);

    const files1 = await readZip(done1);
    const dbLogs = await basePrisma.inventoryLog.count({ where: { companyId: A.id } });
    const csvRows = text => text.replace(/^﻿/, '').split('\r\n').filter(Boolean).length - 1;
    check('trae el LEEME y el manifiesto', 'LEEME.txt' in files1 && JSON.parse(files1['manifest.json']).type === 'PRODUCTS');
    check('la paginación por lotes trae todas las filas (más de 1000)', JSON.parse(files1['manifest.json']).tables.movimientos_inventario === dbLogs && dbLogs >= 2300, `${dbLogs}`);
    const logRows = files1['movimientos_inventario.csv'].split('\r\n').filter(l => l.includes('zz-export-')).length;
    check('el CSV contiene cada movimiento una vez', logRows === 2300, String(logRows));
    check('texto que parece fórmula se neutraliza', files1['productos.csv'].includes(`'=HYPERLINK`) && !files1['productos.csv'].includes(',=HYPERLINK'));
    check('comillas, comas y saltos de línea se escapan', files1['productos.csv'].includes('"con ""comillas"", coma\ny salto"'));
    check('empieza con BOM para Excel', files1['productos.csv'].charCodeAt(0) === 0xfeff);
    void csvRows;

    // --- Respaldo completo en JSON: aislamiento y secretos ---
    const j2 = await svc.createJob(requester, { type: 'FULL', format: 'JSON' });
    const done2 = await waitDone(j2.id);
    const files2 = await readZip(done2);
    check('el respaldo completo termina', done2.status === 'DONE', done2.error || '');
    const all = Object.values(files2).join('\n');
    check('cada tabla es JSON válido', Object.entries(files2).filter(([n]) => n.endsWith('.json') && n !== 'manifest.json').every(([, t]) => Array.isArray(JSON.parse(t))));
    check('AISLAMIENTO: nada de la empresa B aparece', !all.includes('SECRETO-DE-LA-EMPRESA-B') && !all.includes('CLIENTE-SOLO-DE-B') && !all.includes(B.id) && !all.includes('ZZ-EXP-B'));
    check('SECRETOS: sin hashes de contraseña, certificados ni claves de pasarela', !all.includes('passwordHash') && !all.includes(admin.id + '","passwordHash') && !/certificateEnc|certificatePassEnc|secretEnc|tokenHash/.test(all) && !all.includes('$2a$') && !all.includes('$2b$'));
    const empresa = JSON.parse(files2['empresa.json']);
    check('«empresa» tiene solo la empresa exportada', empresa.length === 1 && empresa[0].id === A.id);
    check('«usuarios» no trae contraseñas pero sí a los usuarios', JSON.parse(files2['usuarios.json']).length === (await basePrisma.user.count({ where: { companyId: A.id } })) && !('passwordHash' in JSON.parse(files2['usuarios.json'])[0]));
    const manifest = JSON.parse(files2['manifest.json']);
    const mismatches = [];
    for (const [table, n] of Object.entries(manifest.tables)) {
      const model = { empresa: 'company', usuarios: 'user', categorias: 'category', proveedores: 'supplier', productos: 'product', presentaciones: 'productPresentation', lotes: 'productBatch', clientes: 'customer', ventas: 'sale', detalle_ventas: 'saleDetail', lotes_vendidos: 'saleBatchDetail', movimientos_inventario: 'inventoryLog', cajas: 'terminal', cierres_caja: 'cashierClose', pagos_tarjeta: 'cardPayment', secuencias_ncf: 'nCFSequence', secuencias_ecf: 'ecfSequence', comprobantes_ecf: 'ecfDocument', configuracion: 'systemConfig', auditoria: 'auditLog' }[table];
      const real = await basePrisma[model].count({ where: table === 'empresa' ? { id: A.id } : { companyId: A.id } });
      // auditoría y archivos pueden crecer entre el conteo y hoy (la descarga se audita): tolerancia solo ahí
      if (real !== n && table !== 'auditoria') mismatches.push(`${table}: ${n} vs ${real}`);
      if (JSON.parse(files2[`${table}.json`]).length !== n) mismatches.push(`${table}: archivo distinto del manifiesto`);
    }
    check('cada archivo tiene tantas filas como la base de datos', mismatches.length === 0, mismatches.join('; '));

    // --- Cancelar ---
    // (1) pendiente: se inserta sin avisar a la cola, así que nadie la ha empezado
    const pending = await prisma.exportJob.create({ data: { type: 'CUSTOMERS', format: 'CSV', userId: admin.id, userName: 'zz' } });
    await svc.removeJob(pending.id);
    await svc.kick();
    check('cancelar una exportación pendiente: queda CANCELLED y la cola no la genera', (await basePrisma.exportJob.findUnique({ where: { id: pending.id } })).status === 'CANCELLED');
    // (2) en marcha: se espera a verla RUNNING y se cancela (si terminó antes, la prueba lo dice y no cuenta)
    const j3 = await svc.createJob(requester, { type: 'PRODUCTS', format: 'JSON' });
    for (let i = 0; i < 200 && (await basePrisma.exportJob.findUnique({ where: { id: j3.id } })).status === 'PENDING'; i++) await new Promise(r => setTimeout(r, 5));
    const mid = (await basePrisma.exportJob.findUnique({ where: { id: j3.id } })).status;
    if (mid === 'RUNNING') {
      await svc.removeJob(j3.id);
      await svc.kick();
      const after = await basePrisma.exportJob.findUnique({ where: { id: j3.id } });
      check('cancelar una exportación EN MARCHA: queda CANCELLED, sin archivo y sin tumbar el proceso', after.status === 'CANCELLED' && !fs.existsSync(`${process.cwd()}/storage/exports/${A.id}/${j3.id}.zip`));
    } else {
      await svc.kick();
      console.log(`NOTA  la exportación terminó (${mid}) antes de poder cancelarla en marcha; esa comprobación no se hizo esta vez`);
      await svc.removeJob(j3.id);
    }
    await svc.kick();

    // --- Enlaces de descarga ---
    const ok = await svc.jobFromToken(done1.id, svc.downloadToken(done1.id));
    check('el enlace firmado permite descargar', ok.id === done1.id);
    await expectError('un enlace alterado se rechaza', () => svc.jobFromToken(done1.id, svc.downloadToken(done1.id).replace(/.$/, c => (c === 'a' ? 'b' : 'a'))), 'no válido');
    await expectError('un enlace vencido se rechaza', () => svc.jobFromToken(done1.id, svc.downloadToken(done1.id, -5)), 'venció');
    await expectError('un enlace de otro archivo se rechaza', () => svc.jobFromToken(done2.id, svc.downloadToken(done1.id)), 'no válido');

    // --- Vencimiento ---
    await basePrisma.exportJob.update({ where: { id: done1.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    const n = await svc.cleanupExpired();
    check('al vencer se borra el archivo y queda EXPIRADA', n >= 1 && !fs.existsSync(done1.filePath) && (await basePrisma.exportJob.findUnique({ where: { id: done1.id } })).status === 'EXPIRED');
    await expectError('un enlace de un archivo vencido se rechaza', () => svc.jobFromToken(done1.id, svc.downloadToken(done1.id)), 'ya no está disponible');

    // --- Planes (solo cuando se activa la aplicación de límites) ---
    process.env.PLAN_ENFORCEMENT = 'true';
    await basePrisma.company.update({ where: { id: A.id }, data: { plan: 'FREE' } });
    await expectError('con límites activos, el respaldo completo exige un plan superior', () => svc.createJob(requester, { type: 'FULL', format: 'CSV' }), 'plan');
    await expectError('con límites activos, el JSON exige un plan superior', () => svc.createJob(requester, { type: 'SALES', format: 'JSON' }), 'plan');
    const basic = await svc.createJob(requester, { type: 'CUSTOMERS', format: 'CSV' });
    check('con límites activos, lo básico sigue permitido en el plan gratis', basic.status === 'PENDING');
    await svc.removeJob(basic.id);
    delete process.env.PLAN_ENFORCEMENT;
    await basePrisma.company.update({ where: { id: A.id }, data: { plan: planBefore } });
  });

  // --- HTTP: el enlace y las rutas están protegidas ---
  try {
    const base = process.env.TEST_API_URL || 'http://127.0.0.1:4010/api';
    check('GET /exports sin sesión responde 401', (await fetch(`${base}/exports`)).status === 401);
    check('descarga con enlace inventado responde 401', (await fetch(`${base}/exports/${made.prodA}/file?t=${'x'.repeat(20)}`)).status === 401);
  } catch (err) {
    console.log('SKIP  pruebas HTTP (¿API apagado?):', err.message);
  }
} catch (err) {
  console.error('ERROR inesperado:', err);
  failed++;
} finally {
  const jobs = await basePrisma.exportJob.findMany({ where: { companyId: A.id } });
  for (const job of jobs) if (job.filePath) fs.rmSync(job.filePath, { force: true });
  await basePrisma.exportJob.deleteMany({ where: { companyId: { in: [A.id, B.id] } } });
  await basePrisma.inventoryLog.deleteMany({ where: { productId: made.prodA } });
  await basePrisma.product.deleteMany({ where: { id: { in: [made.prodA, made.prodB].filter(Boolean) } } });
  await basePrisma.customer.deleteMany({ where: { id: made.custB || '__none__' } });
  await basePrisma.category.deleteMany({ where: { id: { in: [made.catA, made.catB].filter(Boolean) } } });
  await basePrisma.auditLog.deleteMany({ where: { companyId: A.id, action: 'EXPORT_DOWNLOAD' } });
  await basePrisma.company.delete({ where: { id: B.id } }).catch(e => console.log('limpieza B:', e.message));
  await basePrisma.company.update({ where: { id: A.id }, data: { plan: planBefore } });
  await basePrisma.$disconnect();
}

console.log(failed ? `\n${failed} FALLO(S)` : '\nTodo en orden');
process.exit(failed ? 1 : 0);
