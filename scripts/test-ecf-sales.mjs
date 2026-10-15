// Prueba de integración de ventas electrónicas (e-CF) contra el simulador de la DGII.
// Corre con su PROPIA base de datos (factos_test_ecf, creada y borrada por la prueba) y su propio simulador en un puerto libre,
// así no compite con la cola de e-CF del API de desarrollo ni con otras pruebas.
//
//   node --env-file=apps/api/.env scripts/test-ecf-sales.mjs
import http from 'node:http';

import { createIsolatedDb } from './lib/isolated-db.mjs';

const isolated = await createIsolatedDb('factos_test_ecf');
process.env.PORT ||= '4010';
const root = new URL('../apps/api/src/', import.meta.url);
const load = p => import(new URL(p, root).href);

const { createDgiiSimulator } = await load('modules/ecf/sim/dgii-simulator.js');
const { generateTestPkcs12 } = await load('modules/ecf/ecf.certificate.js');
const { basePrisma, prisma } = await load('config/db.js');
const { runInTenant } = await load('config/tenant.js');
const { encryptSecret } = await load('shared/utils/secretBox.js');
const { processDueDocuments, stopEcfWorker } = await load('modules/ecf/ecf.outbox.js');
const { tokenManager, forgetCredentials } = await load('modules/ecf/ecf.token.service.js');
const sales = await load('modules/sales/sales.service.js');
const { voidRanges } = await load('modules/ecf/ecf.void.service.js');
const { getSummary } = await load('modules/ecf/ecf.service.js');

const sim = createDgiiSimulator({ processingMs: 150 });
const simServer = http.createServer(sim.app);
await new Promise(r => simServer.listen(0, '127.0.0.1', r));
process.env.ECF_BASE_URL_OVERRIDE = `http://127.0.0.1:${simServer.address().port}`;

let failed = 0;
const check = (name, ok, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`);
  if (!ok) failed++;
};
const sleep = ms => new Promise(r => setTimeout(r, ms));
const expectError = async (name, fn, contains) => {
  try {
    await fn();
    check(name, false, 'no lanzó error');
  } catch (e) {
    check(name, e.message.includes(contains), e.message);
  }
};

// Empresa y administrador propios de esta base de datos (con sus secuencias NCF y el cliente «Consumidor Final»)
const { bootstrapCompany } = await load('modules/platform/bootstrap.js');
const company = await basePrisma.company.create({ data: { name: 'Empresa Prueba', plan: 'BUSINESS' } });
await bootstrapCompany(company.id);
const admin = await basePrisma.user.create({ data: { companyId: company.id, username: 'zz_ecf_admin', fullName: 'Admin e-CF', role: 'ADMINISTRADOR', passwordHash: 'x' } });
const previous = { rnc: company.rnc, address: company.address };
const ncfBefore = await basePrisma.nCFSequence.findMany({ where: { companyId: company.id } });
const RNC = '333333333';
const created = { sales: [], productIds: [], customerIds: [], categoryId: null };

/** Procesa la cola hasta que los documentos de las ventas indicadas terminen (o se acabe el tiempo). */
async function drain(saleIds, { timeoutMs = 9000 } = {}) {
  const started = Date.now();
  for (;;) {
    await processDueDocuments();
    const docs = await basePrisma.ecfDocument.findMany({ where: { saleId: { in: saleIds }, kind: { in: ['ECF', 'RFCE'] }, status: { not: 'STORED' } } });
    if (docs.every(d => ['ACCEPTED', 'CONDITIONAL', 'REJECTED'].includes(d.status))) return docs;
    if (Date.now() - started > timeoutMs) return docs;
    await sleep(400);
  }
}

try {
  await basePrisma.company.update({ where: { id: company.id }, data: { rnc: RNC, address: 'Calle Principal #1, Santiago' } });
  const cert = generateTestPkcs12({ rnc: RNC, password: 'prueba123' });
  await basePrisma.ecfConfig.deleteMany({ where: { companyId: company.id } });
  await basePrisma.ecfSequence.deleteMany({ where: { companyId: company.id } });
  await basePrisma.ecfConfig.create({
    data: {
      companyId: company.id,
      mode: 'PRECERT',
      legalName: 'EMPRESA PRUEBA SRL',
      address: 'Calle Principal #1, Santiago',
      certificateEnc: encryptSecret(cert.p12),
      certificatePassEnc: encryptSecret(cert.password),
      certNotAfter: new Date(Date.now() + 300 * 86400000),
      certRncMatch: true,
    },
  });
  const range = (ecfType, extra = {}) => basePrisma.ecfSequence.create({ data: { companyId: company.id, ecfType, rangeFrom: 1, rangeTo: 1000, current: 0, validUntil: new Date('2028-12-31T12:00:00Z'), ...extra } });
  const seq = { E31: await range('E31'), E32: await range('E32'), E34: await range('E34') };
  forgetCredentials(company.id);
  tokenManager.invalidate(company.id);

  await runInTenant(company.id, async () => {
    const category = await prisma.category.create({ data: { name: 'ZZ-TEST-ECF' } });
    created.categoryId = category.id;
    const product = await prisma.product.create({ data: { code: 'ZZ-ECF-1', name: 'Producto "prueba" & café', categoryId: category.id, costPrice: 50, salePrice: 100, stock: 1000, minStock: 1 } });
    const big = await prisma.product.create({ data: { code: 'ZZ-ECF-2', name: 'Equipo costoso', categoryId: category.id, costPrice: 100000, salePrice: 300000, stock: 10, minStock: 1 } });
    created.productIds.push(product.id, big.id);
    const consumer = await prisma.customer.findFirst({ where: { documentId: '000000000' } });
    const rncCustomer = await prisma.customer.create({ data: { documentId: '131880738', name: 'FERRETERIA DEL CIBAO SRL', rnc: '131880738' } });
    const idCustomer = await prisma.customer.create({ data: { documentId: '00114927493', name: 'Juan Pérez' } });
    created.customerIds.push(rncCustomer.id, idCustomer.id);
    const req = { userId: admin.id, role: 'ADMINISTRADOR' };
    const sell = (customer, items, extra = {}) =>
      sales.createSale({ customerId: customer.id, details: items.map(([p, q]) => ({ productId: p.id, quantity: q, discount: 0 })), discount: 0, paymentMethod: 'EFECTIVO', ...extra }, admin.id, admin.fullName, req);
    const stock = async p => (await prisma.product.findUnique({ where: { id: p.id } })).stock;
    const seqNow = async type => (await basePrisma.ecfSequence.findFirst({ where: { companyId: company.id, ecfType: type } })).current;

    /* 1. E32 consumidor final (< 250 mil): resumen RFCE */
    const s1 = await sell(consumer, [[product, 3]], { discount: 10 });
    created.sales.push(s1.id);
    check('consumidor final emite E32', s1.ecfType === 'E32' && /^E32\d{10}$/.test(s1.eNcf) && s1.invoiceNumber === s1.eNcf, s1.eNcf);
    check('la venta nace firmada y pendiente', s1.ecfStatus === 'PENDING' && s1.ecfSecurityCode?.length === 6 && !!s1.ecfSignedAt);
    check('el QR de consumo apunta a ConsultaTimbreFC', s1.ecfStampUrl.includes('fc.dgii.gov.do/testecf/ConsultaTimbreFC') && s1.ecfStampUrl.includes(`CodigoSeguridad=${encodeURIComponent(s1.ecfSecurityCode)}`));
    const docs1 = await basePrisma.ecfDocument.findMany({ where: { saleId: s1.id } });
    check('guarda e-CF completo (STORED) y su resumen RFCE (PENDING)', docs1.some(d => d.kind === 'ECF' && d.status === 'STORED') && docs1.some(d => d.kind === 'RFCE' && d.status === 'PENDING'));
    const done1 = await drain([s1.id]);
    check('el resumen se acepta en la DGII (simulador)', done1.every(d => d.status === 'ACCEPTED') && sim.state.summaries.length === 1);
    check('la venta refleja ACCEPTED', (await basePrisma.sale.findUnique({ where: { id: s1.id } })).ecfStatus === 'ACCEPTED');
    const ncfNow = await basePrisma.nCFSequence.findMany({ where: { companyId: company.id } });
    check('no consume números de la serie B', JSON.stringify(ncfNow.map(n => [n.ncfType, n.current])) === JSON.stringify(ncfBefore.map(n => [n.ncfType, n.current])));

    /* 2. E31 con RNC: recepción completa + consulta de resultado */
    const s2 = await sell(rncCustomer, [[product, 2]]);
    created.sales.push(s2.id);
    check('cliente con RNC emite E31', s2.ecfType === 'E31' && /^E31\d{10}$/.test(s2.eNcf));
    check('el QR usa ConsultaTimbre con RNC del comprador', s2.ecfStampUrl.includes('ecf.dgii.gov.do/testecf/ConsultaTimbre?') && s2.ecfStampUrl.includes('RncComprador=131880738'));
    const done2 = await drain([s2.id]);
    const d2 = done2.find(d => d.kind === 'ECF');
    check('E31: aceptado tras consultar el resultado', d2.status === 'ACCEPTED' && !!d2.trackId, `${d2.status} track=${d2.trackId?.slice(0, 8)}`);
    check('la venta guarda el trackId', (await basePrisma.sale.findUnique({ where: { id: s2.id } })).ecfTrackId === d2.trackId);

    /* 3. E32 de 250 mil o más: se envía completo, sin resumen */
    await expectError('E32 >= 250 mil exige identificar al comprador', () => sell(consumer, [[big, 1]]), 'identificar al comprador');
    const s3 = await sell(idCustomer, [[big, 1]]);
    created.sales.push(s3.id);
    const docs3 = await basePrisma.ecfDocument.findMany({ where: { saleId: s3.id } });
    check('E32 grande va como e-CF completo (sin RFCE)', s3.ecfType === 'E32' && docs3.length === 1 && docs3[0].kind === 'ECF' && docs3[0].status === 'PENDING');
    check('...y su QR usa ConsultaTimbre (no FC)', s3.ecfStampUrl.includes('/ConsultaTimbre?'));
    const done3 = await drain([s3.id]);
    check('E32 grande aceptado', done3[0].status === 'ACCEPTED');

    /* 4. Rechazo de la DGII */
    sim.rejectNext('Rechazo simulado: firma inválida');
    const s4 = await sell(rncCustomer, [[product, 1]]);
    created.sales.push(s4.id);
    const done4 = await drain([s4.id]);
    check('rechazo de la DGII queda registrado con su mensaje', done4[0].status === 'REJECTED' && /Rechazo simulado/.test(done4[0].lastError || ''), done4[0].lastError);
    check('la venta refleja REJECTED', (await basePrisma.sale.findUnique({ where: { id: s4.id } })).ecfStatus === 'REJECTED');

    /* 5. DGII caída: reintentos */
    sim.failNext('recepcion', 503, 1);
    const s5 = await sell(rncCustomer, [[product, 1]]);
    created.sales.push(s5.id);
    await processDueDocuments();
    let d5 = (await basePrisma.ecfDocument.findFirst({ where: { saleId: s5.id, kind: 'ECF' } }));
    check('si la DGII cae queda en ERROR con reintento programado', d5.status === 'ERROR' && d5.attempts === 1 && d5.nextAttemptAt > new Date(), `${d5.status} intentos=${d5.attempts}`);
    check('la venta no se pierde (registrada y firmada)', !!(await basePrisma.sale.findUnique({ where: { id: s5.id } })).eNcf);
    await basePrisma.ecfDocument.update({ where: { id: d5.id }, data: { nextAttemptAt: null } });
    const done5 = await drain([s5.id]);
    check('al volver la DGII se envía y se acepta', done5[0].status === 'ACCEPTED', done5[0].status);

    /* 6. Token vencido a mitad de envío */
    sim.revokeAllTokens();
    const s6 = await sell(rncCustomer, [[product, 1]]);
    created.sales.push(s6.id);
    const done6 = await drain([s6.id]);
    check('un 401 renueva el token y el envío continúa', done6[0].status === 'ACCEPTED', done6[0].status);

    /* 7. Datos incompletos: no se vende y no se gasta el número */
    const before = { seq: await seqNow('E32'), stock: await stock(product), count: await basePrisma.sale.count({ where: { companyId: company.id } }) };
    await basePrisma.company.update({ where: { id: company.id }, data: { address: null } });
    await basePrisma.ecfConfig.update({ where: { companyId: company.id }, data: { address: null } });
    await expectError('sin dirección fiscal no se emite', () => sell(consumer, [[product, 1]]), 'dirección fiscal');
    const after = { seq: await seqNow('E32'), stock: await stock(product), count: await basePrisma.sale.count({ where: { companyId: company.id } }) };
    check('la venta rechazada no consume e-NCF, stock ni registro', JSON.stringify(before) === JSON.stringify(after), JSON.stringify(after));
    await basePrisma.company.update({ where: { id: company.id }, data: { address: 'Calle Principal #1, Santiago' } });
    await basePrisma.ecfConfig.update({ where: { companyId: company.id }, data: { address: 'Calle Principal #1, Santiago' } });

    /* 8. Rango agotado */
    await basePrisma.ecfSequence.update({ where: { id: seq.E32.id }, data: { active: false } });
    await expectError('sin rango activo no se vende', () => sell(consumer, [[product, 1]]), 'No hay números de E32');
    await basePrisma.ecfSequence.update({ where: { id: seq.E32.id }, data: { active: true, validUntil: new Date('2020-01-01T12:00:00Z') } });
    await expectError('rango vencido no se usa', () => sell(consumer, [[product, 1]]), 'vencidos o agotados');
    await basePrisma.ecfSequence.update({ where: { id: seq.E32.id }, data: { validUntil: new Date('2028-12-31T12:00:00Z') } });

    /* 9. Nota de crédito electrónica (E34) sobre el E31 */
    const stockBefore = await stock(product);
    const nc = await sales.createCreditNote(s2.id, { reason: 'Producto defectuoso', details: [{ productId: product.id, quantity: 1 }] }, admin.id, admin.fullName, req);
    created.sales.push(nc.id);
    check('devolución de una venta electrónica emite E34', nc.ecfType === 'E34' && /^E34\d{10}$/.test(nc.eNcf) && nc.invoiceNumber === nc.eNcf, nc.eNcf);
    check('montos de la nota en negativo y stock devuelto', nc.total < 0 && (await stock(product)) === stockBefore + 1);
    const ncDoc = await basePrisma.ecfDocument.findFirst({ where: { saleId: nc.id, kind: 'ECF' } });
    check('el E34 referencia al e-CF original', ncDoc.xml.includes(`<NCFModificado>${s2.eNcf}</NCFModificado>`) && ncDoc.xml.includes('<CodigoModificacion>3</CodigoModificacion>'));
    const done9 = await drain([nc.id]);
    check('el E34 es aceptado', done9[0].status === 'ACCEPTED', done9[0].status);

    /* 10. Concurrencia: 6 ventas a la vez, números únicos y sin huecos */
    const before10 = await seqNow('E32');
    const batch = await Promise.all(Array.from({ length: 6 }, () => sell(consumer, [[product, 1]])));
    batch.forEach(s => created.sales.push(s.id));
    const numbers = batch.map(s => Number(s.eNcf.slice(3))).sort((a, b) => a - b);
    check('6 ventas simultáneas: e-NCF únicos y consecutivos', JSON.stringify(numbers) === JSON.stringify(Array.from({ length: 6 }, (_, i) => before10 + 1 + i)), numbers.join(','));
    const done10 = await drain(batch.map(s => s.id), { timeoutMs: 15000 });
    check('todas aceptadas', done10.length === 6 && done10.every(d => d.status === 'ACCEPTED'), `${done10.filter(d => d.status === 'ACCEPTED').length}/6`);

    /* 10b. Anulación de rangos no utilizados (ANECF) */
    const nextE32 = (await seqNow('E32')) + 1;
    await expectError('solo se anula desde el siguiente número sin usar', () => voidRanges([{ ecfType: 'E32', from: nextE32 + 3, to: nextE32 + 8 }]), 'debe empezar en');
    await expectError('el rango debe estar dentro de uno autorizado', () => voidRanges([{ ecfType: 'E32', from: nextE32, to: 5000 }]), 'no está dentro');
    const voided = await voidRanges([{ ecfType: 'E32', from: nextE32, to: nextE32 + 4 }]);
    check('la DGII confirma la anulación y se saltan esos 5 números', voided.voided === 5 && (await seqNow('E32')) === nextE32 + 4 && sim.state.voids.length === 1);
    const afterVoid = await sell(consumer, [[product, 1]]);
    created.sales.push(afterVoid.id);
    check('la siguiente venta continúa después de lo anulado', Number(afterVoid.eNcf.slice(3)) === nextE32 + 5, afterVoid.eNcf);
    check('la anulación queda registrada', (await basePrisma.ecfDocument.count({ where: { companyId: company.id, kind: 'ANULACION' } })) === 1);
    await drain([afterVoid.id]);

    /* 10c. Tablero: resumen y alertas */
    await basePrisma.ecfConfig.update({ where: { companyId: company.id }, data: { certNotAfter: new Date(Date.now() + 10 * 86400000) } });
    await basePrisma.ecfSequence.update({ where: { id: seq.E34.id }, data: { rangeTo: 10 } });
    const summary = await getSummary();
    check('resumen: aceptados y rechazados de los últimos 30 días', summary.last30Days.accepted > 0 && summary.last30Days.rejected === 1, JSON.stringify(summary.last30Days));
    check('alerta por certificado próximo a vencer', summary.alerts.some(a => a.code === 'CERT_EXPIRING'));
    check('alerta por rango casi agotado', summary.alerts.some(a => a.code === 'SEQUENCE_LOW' && /E34/.test(a.message)), JSON.stringify(summary.alerts.map(a => a.message)));
    check('lista los rechazos recientes con su motivo', summary.recentRejections.length === 1 && /Rechazo simulado/.test(summary.recentRejections[0].lastError));
    await basePrisma.ecfSequence.update({ where: { id: seq.E34.id }, data: { rangeTo: 1000 } });

    /* 10b. Reintento por deadlock: repite TODA la transacción, incluida la asignación del e-NCF, sin huecos ni números dobles */
    const { allocateENcf } = await load('modules/ecf/ecf.sequence.service.js');
    const e32Before = await seqNow('E32');
    let attempts = 0;
    const allocated = [];
    await sales.withDeadlockRetry(() =>
      prisma.$transaction(async tx => {
        const { eNcf } = await allocateENcf(tx, 'E32');
        allocated.push(eNcf);
        attempts += 1;
        if (attempts === 1) throw new Error('deadlock detected (40P01)'); // PostgreSQL cancela esta transacción: se revierte el número tomado
      })
    );
    check('deadlock: se reintentó la transacción completa (2 intentos)', attempts === 2);
    check('deadlock: el reintento recibe el MISMO e-NCF (el primero se revirtió, no se pierde ni se duplica)', allocated.length === 2 && allocated[0] === allocated[1], allocated.join(' / '));
    check('deadlock: la secuencia avanzó exactamente 1 número (sin hueco)', (await seqNow('E32')) === e32Before + 1, `${e32Before} → ${await seqNow('E32')}`);

    /* 11. Con la facturación electrónica apagada vuelve la serie B */
    await basePrisma.ecfConfig.update({ where: { companyId: company.id }, data: { mode: 'OFF' } });
    const s11 = await sell(consumer, [[product, 1]]);
    created.sales.push(s11.id);
    check('apagada: usa el NCF de papel (B02) y no genera e-CF', /^B02\d{8}$/.test(s11.invoiceNumber) && !s11.eNcf && (await basePrisma.ecfDocument.count({ where: { saleId: s11.id } })) === 0, s11.invoiceNumber);
    await expectError('apagada: no se puede acreditar una venta electrónica', () => sales.createCreditNote(s1.id, { reason: 'Devolución', details: [{ productId: product.id, quantity: 1 }] }, admin.id, admin.fullName, req), 'active la facturación electrónica');
  });
} finally {
  stopEcfWorker();
  const ids = created.sales;
  await basePrisma.ecfDocument.deleteMany({ where: { companyId: company.id } });
  await basePrisma.inventoryLog.deleteMany({ where: { companyId: company.id, productId: { in: created.productIds } } });
  await basePrisma.sale.deleteMany({ where: { companyId: company.id, relatedSaleId: { not: null } } });
  await basePrisma.sale.deleteMany({ where: { id: { in: ids }, companyId: company.id } });
  await basePrisma.product.deleteMany({ where: { id: { in: created.productIds } } });
  await basePrisma.customer.deleteMany({ where: { id: { in: created.customerIds } } });
  if (created.categoryId) await basePrisma.category.delete({ where: { id: created.categoryId } }).catch(() => {});
  await basePrisma.ecfSequence.deleteMany({ where: { companyId: company.id } });
  await basePrisma.ecfConfig.deleteMany({ where: { companyId: company.id } });
  for (const seq of ncfBefore) await basePrisma.nCFSequence.update({ where: { id: seq.id }, data: { current: seq.current } });
  await basePrisma.company.update({ where: { id: company.id }, data: previous });
  const left = await basePrisma.sale.count({ where: { companyId: company.id } });
  console.log('limpieza: ventas restantes en Empresa Prueba =', left);
  simServer.close();
}

console.log(failed ? `\n${failed} FALLO(S)` : '\nTODO OK');
await basePrisma.$disconnect();
await isolated.drop();
process.exit(failed ? 1 : 0);
