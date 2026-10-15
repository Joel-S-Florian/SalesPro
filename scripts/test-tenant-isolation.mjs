// Prueba de aislamiento multi-empresa contra una API en ejecución.
//
//   API_URL=http://localhost:4010/api node scripts/test-tenant-isolation.mjs
//
// Variables: SUPERADMIN_USER / SUPERADMIN_PASSWORD (por defecto superadmin/superadmin).
// Crea dos empresas "ZZTEST ..." con datos de prueba y las elimina al terminar (usa DATABASE_URL).
import 'dotenv/config';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { PrismaClient } from '@prisma/client';

const JSZip = createRequire(import.meta.url)('jszip');
const db = new PrismaClient();

const API = process.env.API_URL || 'http://localhost:4010/api';
const SUPER = {
  username: process.env.SUPERADMIN_USER || 'superadmin',
  password: process.env.SUPERADMIN_PASSWORD || 'superadmin',
};
const stamp = Date.now().toString(36);

let passed = 0;
let failed = 0;
const check = (label, condition, extra = '') => {
  if (condition) passed += 1;
  else failed += 1;
  console.log(`${condition ? '  ✓' : '  ✗ FALLÓ'} ${label}${condition ? '' : ` ${extra}`}`);
};

async function call(method, path, token, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    // sin cuerpo
  }
  return { status: res.status, data };
}

const login = async (username, password) => {
  const res = await call('POST', '/auth/login', null, { username, password });
  return { ...res, token: res.data?.accessToken };
};
const list = r => (Array.isArray(r.data) ? r.data : r.data?.data || []);

async function setupCompany(superToken, label) {
  const admin = { username: `zz${label}${stamp}`, password: '', fullName: `Admin ${label}` };
  const created = await call('POST', '/platform/companies', superToken, {
    name: `ZZTEST ${label} ${stamp}`,
    plan: 'BUSINESS',
    admin: { fullName: admin.fullName, username: admin.username },
  });
  check(`Super-admin crea la empresa ${label}`, created.status === 201, JSON.stringify(created.data));
  admin.password = created.data?.adminTemporaryPassword || ''; // clave temporal generada por el servidor
  const session = await login(admin.username, admin.password);
  check(`Admin de ${label} inicia sesión`, !!session.token);
  return { id: created.data?.id, admin, token: session.token };
}

async function seedData(company, label) {
  const { token } = company;
  const category = await call('POST', '/categories', token, { name: 'Categoría compartida', description: label });
  const product = await call('POST', '/products', token, {
    code: 'SHARED-001',
    name: `Producto ${label}`,
    categoryId: category.data?.id,
    costPrice: 10,
    salePrice: 20,
    stock: 50,
    minStock: 1,
  });
  const customer = await call('POST', '/customers', token, { documentId: '999000111', name: `Cliente ${label}` });
  check(`${label}: crea categoría/producto/cliente con los mismos códigos que la otra empresa`,
    category.status === 201 && product.status === 201 && customer.status === 201,
    JSON.stringify([category.data, product.data, customer.data]));
  const sale = await call('POST', '/sales', token, {
    customerId: customer.data?.id,
    details: [{ productId: product.data?.id, quantity: 2 }],
  });
  check(`${label}: registra una venta`, sale.status === 201, JSON.stringify(sale.data));
  return { category: category.data, product: product.data, customer: customer.data, sale: sale.data };
}

/** Rutas GET de informes que B recorre: ninguna respuesta puede traer rastro de A. */
const REPORT_PATHS = [
  '/reports/dashboard', '/reports/sales', '/reports/products', '/reports/customers', '/reports/tax', '/reports/low-stock',
  '/reports/products/top-sold', '/reports/products/most-profitable', '/reports/products/low-margin', '/reports/products/by-category',
  '/reports/customers/top-by-amount', '/reports/customers/top-by-frequency', '/reports/staff/performance', '/reports/staff/payment-methods',
  '/reports/overview', '/reports/sales-breakdown', '/reports/profitability', '/reports/fiscal', '/reports/inventory', '/reports/expiry',
  '/reports/bulk', '/reports/purchases', '/reports/cash', '/reports/customer-insights',
];

async function extendedCoverage(A, B, dataA, dataB) {
  console.log('\nCobertura ampliada: informes, kárdex, exportaciones, importaciones, e-CF recibidos, auditoría y cajas');
  // Rastro de A que B nunca debe ver (nombres, documentos, ids y datos sembrados directamente en la base)
  const aTerminal = await db.terminal.create({ data: { name: `ZZ Caja Secreta A ${stamp}`, companyId: A.id } });
  const aImport = await db.inventoryImport.create({ data: { fileName: `zz-secreto-a-${stamp}.csv`, status: 'STAGED', userId: (await db.user.findFirst({ where: { companyId: A.id } })).id, userName: 'x', companyId: A.id } });
  const aInbox = await db.ecfInbox.create({ data: { companyId: A.id, rncEmisor: '131000999', eNcf: `E31000${stamp.slice(0, 5)}`, xml: `<ECF-SECRETO-A-${stamp}/>`, total: 123.45 } });
  await db.auditLog.create({ data: { companyId: A.id, action: 'ECF_CERT_USED', entity: 'ecf_certificate', entityId: `E32-SECRETO-A-${stamp}`, newData: { purpose: 'sign-ecf', actor: 'system' } } });
  const markers = ['Producto A', 'Cliente A', dataA.product.id, dataA.customer.id, dataA.sale.id, A.admin.username, // (el número de factura no sirve de marcador: cada empresa tiene su propia secuencia y puede coincidir)
     `ZZ Caja Secreta A ${stamp}`, `zz-secreto-a-${stamp}`, `ECF-SECRETO-A-${stamp}`, `E32-SECRETO-A-${stamp}`].filter(Boolean);
  const leaks = text => markers.filter(m => text.includes(m));

  // Control: con el token de A, esos mismos informes SÍ muestran lo de A (así sabemos que el marcador sirve)
  const aProducts = JSON.stringify((await call('GET', '/reports/products', A.token)).data);
  check('control: el informe de productos de A muestra «Producto A»', aProducts.includes('Producto A'));

  const leakingReports = [];
  for (const path of REPORT_PATHS) {
    const res = await call('GET', path, B.token);
    const text = JSON.stringify(res.data ?? '');
    if (res.status >= 500) leakingReports.push(`${path} → ${res.status}`);
    else if (leaks(text).length) leakingReports.push(`${path} ve ${leaks(text).join(', ')}`);
  }
  check(`B recorre ${REPORT_PATHS.length} informes y ninguno trae datos de A (ni falla)`, leakingReports.length === 0, leakingReports.join(' | '));

  // Kárdex, lotes y movimientos
  const noLeak = async (label, path, expectStatuses) => {
    const res = await call('GET', path, B.token);
    const text = JSON.stringify(res.data ?? '');
    check(label, (!expectStatuses || expectStatuses.includes(res.status)) && leaks(text).length === 0, `${res.status} ${leaks(text).join(', ')}`);
  };
  await noLeak('B no ve el kárdex de un producto de A (inventario)', `/inventory/kardex/${dataA.product.id}`, [403, 404]);
  await noLeak('B no ve el kárdex de un producto de A (informes)', `/reports/kardex/${dataA.product.id}`, [403, 404, 200]);
  await noLeak('B no ve los lotes de un producto de A', `/inventory/batches/${dataA.product.id}`, [403, 404, 200]);
  await noLeak('B no ve el historial de un cliente de A', `/reports/customers/${dataA.customer.id}/history`, [403, 404, 200]);
  await noLeak('los movimientos de inventario de B no traen los de A', '/inventory/logs', [200]);
  await noLeak('el resumen de inventario de B no trae lo de A', '/inventory/summary', [200]);
  await noLeak('los productos por vencer de B no traen los de A', '/inventory/expiring', [200]);

  // Cajas, turnos y listas
  await noLeak('B no ve las cajas de A', '/terminals', [200]);
  await noLeak('B no ve los turnos de caja de A', '/cashier', [200]);
  await noLeak('B no ve los proveedores de A', '/suppliers', [200]);
  const aSupplier = await db.supplier.create({ data: { name: `ZZ Proveedor Secreto A ${stamp}`, companyId: A.id } });
  markers.push(`ZZ Proveedor Secreto A ${stamp}`);
  check('B no puede leer un proveedor de A', (await call('GET', `/suppliers/${aSupplier.id}`, B.token)).status === 404);
  check('B no puede pedir las sugerencias de pedido de un proveedor de A', (await call('GET', `/suppliers/${aSupplier.id}/reorder-products`, B.token)).status === 404);
  check('B no puede ver las compras de un proveedor de A', (await call('GET', `/suppliers/${aSupplier.id}/purchases`, B.token)).status === 404);
  check('B no puede editar un proveedor de A', (await call('PUT', `/suppliers/${aSupplier.id}`, B.token, { name: 'hack' })).status === 404);

  // Importaciones
  await noLeak('B no ve las importaciones de A', '/inventory-import', [200]);
  check('B no puede aplicar ni cancelar una importación de A', [400, 403, 404].includes((await call('DELETE', `/inventory-import/${aImport.id}`, B.token)).status) && (await db.inventoryImport.findUnique({ where: { id: aImport.id } })).status === 'STAGED');

  // Bandeja de e-CF recibidos
  await noLeak('B no ve la bandeja de e-CF recibidos de A', '/ecf/inbox', [200]);
  check('B no puede descargar el XML recibido por A', [403, 404].includes((await call('GET', `/ecf/inbox/${aInbox.id}/xml`, B.token)).status));
  check('B no puede aprobar ni rechazar un comprobante recibido por A', [403, 404, 400].includes((await call('POST', `/ecf/inbox/${aInbox.id}/respond`, B.token, { approved: true })).status));
  const aInboxStill = await db.ecfInbox.findUnique({ where: { id: aInbox.id } });
  check('el comprobante recibido de A sigue intacto', aInboxStill.status === 'RECIBIDO');
  await noLeak('B no ve el resumen de e-CF de A', '/ecf/summary', [200]);

  // Auditoría del certificado
  await noLeak('B no ve el uso del certificado de A', '/ecf/certificate-usage', [200]);
  await noLeak('B no ve la configuración e-CF de A', '/ecf/config', [200]);

  // Plan y uso: cada empresa ve solo su propio conteo
  const usageB = (await call('GET', '/company/plan-usage', B.token)).data;
  check('el plan y uso de B cuenta solo lo de B (1 producto, 1 usuario)', usageB?.usage?.products?.current === 1 && usageB?.usage?.users?.current === 1, JSON.stringify(usageB?.usage));

  // Exportaciones: cada empresa exporta lo suyo; B no ve ni descarga lo de A
  const exportA = await call('POST', '/exports', A.token, { type: 'SALES', format: 'CSV' });
  check('A genera una exportación de ventas', exportA.status === 202, JSON.stringify(exportA.data));
  const waitDone = async (token, id) => {
    for (let i = 0; i < 60; i++) {
      const job = (await call('GET', `/exports/${id}`, token)).data;
      if (job?.status === 'DONE' || job?.status === 'FAILED') return job;
      await new Promise(r => setTimeout(r, 500));
    }
    return null;
  };
  const jobA = await waitDone(A.token, exportA.data?.id);
  check('la exportación de A termina', jobA?.status === 'DONE', JSON.stringify(jobA));
  check('B no ve las exportaciones de A en su lista', !JSON.stringify((await call('GET', '/exports', B.token)).data).includes(exportA.data?.id));
  check('B no puede consultar la exportación de A', (await call('GET', `/exports/${exportA.data?.id}`, B.token)).status === 404);
  check('B no puede pedir un enlace de descarga de la exportación de A', (await call('POST', `/exports/${exportA.data?.id}/link`, B.token)).status === 404);
  check('B no puede cancelar ni borrar la exportación de A', (await call('DELETE', `/exports/${exportA.data?.id}`, B.token)).status === 404);
  const linkA = await call('POST', `/exports/${exportA.data?.id}/link`, A.token);
  const zipA = await fetch(`${API.replace(/\/api$/, '')}${linkA.data?.url}`.replace('/api/api', '/api'));
  const filesA = await JSZip.loadAsync(Buffer.from(await zipA.arrayBuffer()));
  const salesCsvA = await filesA.files['ventas.csv'].async('string');
  check('el ZIP de A trae la venta de A y nada de B', salesCsvA.includes(dataA.sale.id) && !salesCsvA.includes(dataB.sale.id) && !salesCsvA.includes('Cliente B'));
  const exportB = await call('POST', '/exports', B.token, { type: 'CUSTOMERS', format: 'CSV' });
  const jobB = await waitDone(B.token, exportB.data?.id);
  const linkB = await call('POST', `/exports/${exportB.data?.id}/link`, B.token);
  const zipB = await fetch(`${API.replace(/\/api$/, '')}${linkB.data?.url}`.replace('/api/api', '/api'));
  const filesB = await JSZip.loadAsync(Buffer.from(await zipB.arrayBuffer()));
  const customersCsvB = await filesB.files['clientes.csv'].async('string');
  check('el ZIP de B trae a sus clientes y nada de A', jobB?.status === 'DONE' && customersCsvB.includes('Cliente B') && !customersCsvB.includes('Cliente A'));
  check('el enlace de descarga de A no sirve para el archivo de B', (await fetch(`${API.replace(/\/api$/, '')}/api/exports/${exportB.data?.id}/file?t=${linkA.data?.url.split('t=')[1]}`)).status === 401);

  // La exportación a Excel de informes solo serializa lo que envía el navegador (no consulta datos): no puede traer lo de A
  const xlsx = await fetch(`${API}/reports/export/xlsx`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${B.token}` }, body: JSON.stringify({ title: 'Prueba', columns: [{ key: 'a', label: 'A' }], rows: [{ a: 'fila de B' }] }) });
  const xlsxText = Buffer.from(await xlsx.arrayBuffer()).toString('latin1');
  check('el Excel de informes de B no contiene datos de A', xlsx.status === 200 && !xlsxText.includes('Producto A'));

  // Limpieza de lo sembrado aquí
  for (const job of await db.exportJob.findMany({ where: { companyId: { in: [A.id, B.id] } } })) if (job.filePath) fs.rmSync(job.filePath, { force: true });
  await db.exportJob.deleteMany({ where: { companyId: { in: [A.id, B.id] } } });
  await db.ecfInbox.deleteMany({ where: { companyId: A.id } });
  await db.inventoryImport.deleteMany({ where: { companyId: A.id } });
  await db.terminal.deleteMany({ where: { id: aTerminal.id } });
  await db.supplier.deleteMany({ where: { id: aSupplier.id } });
}

/**
 * Etiquetas, pagos de suscripción y respaldos automáticos: cada empresa solo ve y toca lo suyo.
 * Los respaldos automáticos se programan solo para A y B (nunca para otras empresas de la base) y se procesan en este proceso.
 */
async function newModulesCoverage(A, B, st, dataA, dataB) {
  console.log('\nCobertura de etiquetas, pagos de suscripción y respaldos automáticos');
  const apiSrc = new URL('../apps/api/src/', import.meta.url);
  const { scheduleAutoBackups } = await import(new URL('modules/exports/exports.auto.js', apiSrc).href);
  const { kick } = await import(new URL('modules/exports/exports.service.js', apiSrc).href);

  // --- Etiquetas: la elección se recuerda por empresa ---
  const labelsA = { presetId: 'CUSTOM', layout: { pageW: 123.4, pageH: 234.5, cols: 2, rows: 5, marginTop: 3, marginLeft: 4, gapX: 1, gapY: 1 }, showName: false, showPrice: true, split: 'chunk', maxPerFile: 77, defaultCopies: 3 };
  const putA = await call('PUT', '/config', A.token, { labels: labelsA });
  check('A guarda su elección de etiquetas (papel, medidas y opciones)', putA.status === 200 && putA.data?.labels?.presetId === 'CUSTOM', JSON.stringify(putA.data?.labels));
  const cfgA = (await call('GET', '/config', A.token)).data;
  check('A recupera exactamente lo que guardó', cfgA?.labels?.layout?.pageW === 123.4 && cfgA?.labels?.maxPerFile === 77 && cfgA?.labels?.defaultCopies === 3);
  const cfgBText = JSON.stringify((await call('GET', '/config', B.token)).data);
  const cfgB = JSON.parse(cfgBText);
  check('B sigue con el rollo 50 × 25 por defecto y no ve las medidas de A', cfgB?.labels?.presetId === 'ROLL_50x25' && cfgB?.labels?.layout === null && !cfgBText.includes('123.4'));
  const bad = await call('PUT', '/config', A.token, { labels: { ...labelsA, layout: { ...labelsA.layout, cols: 0 } } });
  check('una medida imposible se rechaza y no pisa lo guardado', bad.status === 422 && (await call('GET', '/config', A.token)).data?.labels?.layout?.cols === 2, String(bad.status));

  // --- Pagos de suscripción ---
  const ref = `ZZ-SECRETO-A-${stamp}`;
  const pay = await call('POST', `/platform/companies/${A.id}/payments`, st, { plan: 'BUSINESS', amount: 2500, method: 'TRANSFER', reference: ref, months: 1, note: `nota-secreta-A-${stamp}` });
  check('el super-admin registra un pago de A', pay.status === 201, JSON.stringify(pay.data));
  const subB = JSON.stringify((await call('GET', '/company/subscription', B.token)).data);
  check('B no ve ningún pago de A en su historial', !subB.includes(ref) && !subB.includes(`nota-secreta-A-${stamp}`) && (JSON.parse(subB).payments || []).length === 0, subB.slice(0, 150));
  check('B no puede abrir el recibo de A', (await call('GET', `/company/payments/${pay.data?.id}/receipt`, B.token)).status === 404);
  check('A ve su pago y su recibo', JSON.stringify((await call('GET', '/company/subscription', A.token)).data).includes(ref) && (await call('GET', `/company/payments/${pay.data?.id}/receipt`, A.token)).status === 200);
  const usageA = (await call('GET', '/company/plan-usage', A.token)).data;
  const usageBpay = (await call('GET', '/company/plan-usage', B.token)).data;
  check('el pago de A mueve solo la fecha pagada de A', usageA?.status === 'PAID' && usageA?.paidUntil && !usageBpay?.paidUntil);
  check('un administrador de empresa no puede registrar ni anular pagos', (await call('POST', `/platform/companies/${B.id}/payments`, B.token, { plan: 'BUSINESS', amount: 1, method: 'CASH' })).status === 403 && (await call('POST', `/platform/companies/${A.id}/payments/${pay.data?.id}/void`, B.token, { reason: 'intento' })).status === 403);
  const platB = JSON.stringify((await call('GET', `/platform/companies/${B.id}/payments`, st)).data);
  check('la plataforma, al pedir los pagos de B, no trae los de A', !platB.includes(ref));
  check('un recibo de A pedido con la empresa B responde 404', (await call('GET', `/platform/companies/${B.id}/payments/${pay.data?.id}/receipt`, st)).status === 404);
  check('anular con la empresa equivocada responde 404 y no toca el pago', (await call('POST', `/platform/companies/${B.id}/payments/${pay.data?.id}/void`, st, { reason: 'empresa equivocada' })).status === 404 && (await db.subscriptionPayment.findUnique({ where: { id: pay.data?.id } })).status === 'PAID');

  // --- Respaldos automáticos ---
  const scheduled = await scheduleAutoBackups(new Date(), { companyIds: [A.id, B.id] });
  check('el planificador programa un respaldo automático para cada empresa Business', scheduled.length === 2, JSON.stringify(scheduled));
  await kick();
  const autoA = (list(await call('GET', '/exports', A.token))).find(j => j.auto);
  const autoB = (list(await call('GET', '/exports', B.token))).find(j => j.auto);
  check('cada empresa ve su propio respaldo automático, cifrado y terminado', autoA?.status === 'DONE' && autoA?.encrypted === true && autoB?.status === 'DONE' && autoA.id !== autoB.id, JSON.stringify([autoA, autoB]));
  check('B no ve el respaldo automático de A en su lista', !JSON.stringify((await call('GET', '/exports', B.token)).data).includes(autoA?.id));
  check('B no puede consultar, descargar ni borrar el respaldo automático de A', (await call('GET', `/exports/${autoA?.id}`, B.token)).status === 404 && (await call('POST', `/exports/${autoA?.id}/link`, B.token)).status === 404 && (await call('DELETE', `/exports/${autoA?.id}`, B.token)).status === 404);
  const dl = async (company, job) => {
    const link = await call('POST', `/exports/${job.id}/link`, company.token);
    const res = await fetch(`${API.replace(/\/api$/, '')}${link.data?.url}`);
    return { status: res.status, buf: Buffer.from(await res.arrayBuffer()) };
  };
  const fileA = await dl(A, autoA);
  const zipOfA = await JSZip.loadAsync(fileA.buf);
  const salesOfA = await zipOfA.files['ventas.csv'].async('string');
  const usersOfA = await zipOfA.files['usuarios.csv'].async('string');
  check('el respaldo automático de A se descarga descifrado (ZIP válido) con la venta de A y nada de B', fileA.status === 200 && salesOfA.includes(dataA.sale.id) && !salesOfA.includes(dataB.sale.id) && !JSON.stringify(Object.keys(zipOfA.files)).includes('certificado'));
  check('el respaldo no trae contraseñas ni a los usuarios de B', !usersOfA.includes('passwordHash') && !usersOfA.includes(B.admin.username.toLowerCase()));
  const raw = fs.readFileSync((await db.exportJob.findUnique({ where: { id: autoA.id } })).filePath);
  check('el archivo en disco está cifrado (no es un ZIP legible)', raw.subarray(0, 4).toString() === 'FXB1' && !raw.includes('Producto A') && !raw.includes(dataA.sale.id));
  const fileB = await dl(B, autoB);
  const salesOfB = await (await JSZip.loadAsync(fileB.buf)).files['ventas.csv'].async('string');
  check('el respaldo automático de B trae su venta y nada de A', salesOfB.includes(dataB.sale.id) && !salesOfB.includes(dataA.sale.id));
  const linkOfA = await call('POST', `/exports/${autoA.id}/link`, A.token);
  check('el enlace de descarga del respaldo de A no sirve para el de B', (await fetch(`${API.replace(/\/api$/, '')}/api/exports/${autoB.id}/file?t=${linkOfA.data?.url.split('t=')[1]}`)).status === 401);

  // Limpieza de lo sembrado aquí (los respaldos y sus archivos)
  for (const job of await db.exportJob.findMany({ where: { companyId: { in: [A.id, B.id] } } })) if (job.filePath) fs.rmSync(job.filePath, { force: true });
  await db.exportJob.deleteMany({ where: { companyId: { in: [A.id, B.id] } } });
}

async function cleanup() {
  const prisma = new PrismaClient();
  try {
    const companies = await prisma.company.findMany({ where: { name: { startsWith: 'ZZTEST' } }, select: { id: true } });
    for (const { id: companyId } of companies) {
      const where = { companyId };
      await prisma.auditLog.deleteMany({ where });
      await prisma.saleBatchDetail.deleteMany({ where });
      await prisma.saleDetail.deleteMany({ where });
      await prisma.sale.deleteMany({ where });
      await prisma.inventoryLog.deleteMany({ where });
      await prisma.cashierClose.deleteMany({ where });
      await prisma.terminal.deleteMany({ where });
      await prisma.inventoryImport.deleteMany({ where });
      await prisma.exportJob.deleteMany({ where });
      await prisma.subscriptionPayment.deleteMany({ where });
      await prisma.ecfInbox.deleteMany({ where });
      await prisma.productBatch.deleteMany({ where });
      await prisma.product.deleteMany({ where });
      await prisma.category.deleteMany({ where });
      await prisma.customer.deleteMany({ where });
      await prisma.supplier.deleteMany({ where });
      await prisma.nCFSequence.deleteMany({ where });
      await prisma.systemConfig.deleteMany({ where });
      await prisma.session.deleteMany({ where: { user: { companyId } } });
      await prisma.user.deleteMany({ where });
      await prisma.company.delete({ where: { id: companyId } });
    }
    console.log(`\nLimpieza: ${companies.length} empresas de prueba eliminadas`);
  } finally {
    await prisma.$disconnect();
  }
}

async function main() {
  console.log(`API: ${API}\n`);
  const superLogin = await login(SUPER.username, SUPER.password);
  if (!superLogin.token) throw new Error(`No se pudo iniciar sesión como super-admin (${superLogin.status})`);
  const st = superLogin.token;

  console.log('Preparación');
  const A = await setupCompany(st, 'A');
  const B = await setupCompany(st, 'B');
  const dataA = await seedData(A, 'A');
  const dataB = await seedData(B, 'B');

  console.log('\nAislamiento de lectura');
  const productsA = list(await call('GET', '/products?limit=100', A.token));
  const productsB = list(await call('GET', '/products?limit=100', B.token));
  check('A solo ve sus productos', productsA.length === 1 && productsA[0].id === dataA.product.id, JSON.stringify(productsA.map(p => p.name)));
  check('B solo ve sus productos', productsB.length === 1 && productsB[0].id === dataB.product.id);
  check('A solo ve sus ventas', list(await call('GET', '/sales', A.token)).every(s => s.id === dataA.sale.id));
  check('A solo ve sus clientes', !list(await call('GET', '/customers', A.token)).some(c => c.id === dataB.customer.id) && list(await call('GET', '/customers', A.token)).some(c => c.id === dataA.customer.id));
  check('A solo ve sus categorías', !list(await call('GET', '/categories', A.token)).some(c => c.id === dataB.category.id) && list(await call('GET', '/categories', A.token)).some(c => c.id === dataA.category.id));
  check('Las secuencias NCF son independientes por empresa', dataA.sale.invoiceNumber === dataB.sale.invoiceNumber,
    `${dataA.sale.invoiceNumber} vs ${dataB.sale.invoiceNumber}`);
  const usersA = list(await call('GET', '/auth/users', A.token));
  check('A solo ve a sus propios usuarios', usersA.length === 1 && usersA[0].username === A.admin.username.toLowerCase());

  console.log('\nAcceso cruzado por id');
  check('B no puede leer un producto de A', (await call('GET', `/products/${dataA.product.id}`, B.token)).status === 404);
  check('B no puede leer una venta de A', [403, 404].includes((await call('GET', `/sales/${dataA.sale.id}`, B.token)).status));
  check('B no puede modificar un producto de A', (await call('PUT', `/products/${dataA.product.id}`, B.token, { name: 'hack' })).status === 404);
  check('B no puede eliminar un cliente de A', (await call('DELETE', `/customers/${dataA.customer.id}`, B.token)).status === 404);
  const cross = await call('POST', '/sales', B.token, {
    customerId: dataA.customer.id,
    details: [{ productId: dataB.product.id, quantity: 1 }],
  });
  check('B no puede vender a un cliente de A', cross.status === 404, JSON.stringify(cross.data));
  const cross2 = await call('POST', '/sales', B.token, {
    customerId: dataB.customer.id,
    details: [{ productId: dataA.product.id, quantity: 1 }],
  });
  check('B no puede vender un producto de A', cross2.status === 404, JSON.stringify(cross2.data));
  const stillA = await call('GET', `/products/${dataA.product.id}`, A.token);
  check('El producto de A sigue intacto', stillA.data?.name === 'Producto A' && stillA.data?.stock === 48);

  await extendedCoverage(A, B, dataA, dataB);
  await newModulesCoverage(A, B, st, dataA, dataB);

  console.log('\nConfiguración independiente');
  await call('PUT', '/config', A.token, { taxRate: 0.05 });
  check('Cambiar el ITBIS de A no afecta a B', (await call('GET', '/config', B.token)).data?.taxRate === 0.18);

  console.log('\nRoles de plataforma');
  check('Un administrador de empresa no puede usar /platform', (await call('GET', '/platform/companies', A.token)).status === 403);
  check('El super-admin no puede operar datos de empresa', (await call('GET', '/products', st)).status === 403);
  const listed = (await call('GET', '/platform/companies?q=ZZTEST', st)).data || [];
  check('El super-admin ve ambas empresas con sus conteos', listed.length >= 2 && listed.every(c => c._count?.users === 1));

  console.log('\nSuspensión');
  const suspended = await call('PUT', `/platform/companies/${A.id}`, st, { active: false });
  check('El super-admin suspende la empresa A', suspended.status === 200 && suspended.data?.active === false);
  check('Los usuarios de A quedan bloqueados de inmediato', (await call('GET', '/products', A.token)).status === 403);
  check('A no puede volver a iniciar sesión', (await login(A.admin.username, A.admin.password)).status === 403);
  check('B no se ve afectada', (await call('GET', '/products', B.token)).status === 200);
}

let exitCode = 0;
try {
  await main();
} catch (error) {
  console.error('\nError inesperado:', error.message);
  exitCode = 1;
} finally {
  await cleanup();
}
console.log(`\nResultado: ${passed} correctas, ${failed} fallidas`);
process.exit(exitCode || (failed ? 1 : 0));
