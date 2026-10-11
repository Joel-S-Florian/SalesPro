// Prueba de integración del intercambio entre contribuyentes: directorio, entrega al comprador electrónico,
// recepción de e-CF ajenos (con acuse de recibo firmado) y aprobaciones comerciales en ambos sentidos.
// Usa «Empresa Prueba» y el simulador de la DGII (que además simula a otro contribuyente, RNC 101010101).
//
//   node --env-file=apps/api/.env scripts/test-ecf-peers.mjs
import http from 'node:http';
import express from 'express';

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
const { buildAcecfXml, buildEcfXml } = await load('modules/ecf/ecf.builder.js');
const { signXml, verifySignedXml } = await load('modules/ecf/ecf.signer.js');
const { readArecf } = await load('modules/ecf/ecf.xml.js');
const { resetReceiverIndex } = await load('modules/ecf/ecf.receiver.service.js');
const directory = await load('modules/ecf/ecf.directory.service.js');
const approvals = await load('modules/ecf/ecf.approval.service.js');
const sales = await load('modules/sales/sales.service.js');

const sim = createDgiiSimulator({ processingMs: 100 });
const simServer = http.createServer(sim.app);
await new Promise(r => simServer.listen(0, '127.0.0.1', r));
const simUrl = `http://127.0.0.1:${simServer.address().port}`;
sim.setPublicUrl(simUrl);
process.env.ECF_BASE_URL_OVERRIDE = simUrl;

const { default: app } = await load('app.js');
const api = express();
api.use('/api', app);
const apiServer = http.createServer(api);
await new Promise(r => apiServer.listen(0, '127.0.0.1', r));
const apiBase = `http://127.0.0.1:${apiServer.address().port}/api`;

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
const post = async (path, xml, { fileName = 'doc.xml' } = {}) => {
  const form = new FormData();
  form.append('xml', new Blob([xml], { type: 'text/xml' }), fileName);
  const res = await fetch(apiBase + path, { method: 'POST', body: form });
  return { status: res.status, text: await res.text() };
};

const company = await basePrisma.company.findFirst({ where: { name: 'Empresa Prueba' } });
const admin = await basePrisma.user.findFirst({ where: { companyId: company.id, role: 'ADMINISTRADOR' } });
const previous = { rnc: company.rnc, address: company.address };
const ncfBefore = await basePrisma.nCFSequence.findMany({ where: { companyId: company.id } });
const RNC = '333333333';
const created = { sales: [], productIds: [], customerIds: [], categoryId: null };

async function drain(saleIds, kinds, { timeoutMs = 9000 } = {}) {
  const started = Date.now();
  for (;;) {
    await processDueDocuments();
    const docs = await basePrisma.ecfDocument.findMany({ where: { saleId: { in: saleIds }, kind: { in: kinds } } });
    if (docs.length && docs.every(d => ['ACCEPTED', 'CONDITIONAL', 'REJECTED'].includes(d.status))) return docs;
    if (Date.now() - started > timeoutMs) return docs;
    await sleep(300);
  }
}

try {
  await basePrisma.company.update({ where: { id: company.id }, data: { rnc: RNC, address: 'Calle Principal #1, Santiago' } });
  resetReceiverIndex();
  const cert = generateTestPkcs12({ rnc: RNC, password: 'prueba123' });
  await basePrisma.ecfConfig.deleteMany({ where: { companyId: company.id } });
  await basePrisma.ecfSequence.deleteMany({ where: { companyId: company.id } });
  await basePrisma.ecfConfig.create({
    data: { companyId: company.id, mode: 'PRECERT', legalName: 'EMPRESA PRUEBA SRL', address: 'Calle Principal #1, Santiago', certificateEnc: encryptSecret(cert.p12), certificatePassEnc: encryptSecret(cert.password), certNotAfter: new Date(Date.now() + 300 * 86400000), certRncMatch: true },
  });
  for (const type of ['E31', 'E32', 'E34']) {
    await basePrisma.ecfSequence.create({ data: { companyId: company.id, ecfType: type, rangeFrom: 1, rangeTo: 1000, current: 0, validUntil: new Date('2028-12-31T12:00:00Z') } });
  }
  forgetCredentials(company.id);
  tokenManager.invalidate(company.id);

  await runInTenant(company.id, async () => {
    const category = await prisma.category.create({ data: { name: 'ZZ-TEST-PEER' } });
    created.categoryId = category.id;
    const product = await prisma.product.create({ data: { code: 'ZZ-PEER-1', name: 'Producto de prueba', categoryId: category.id, costPrice: 50, salePrice: 100, stock: 500, minStock: 1 } });
    created.productIds.push(product.id);
    const mk = async (documentId, name) => {
      const c = await prisma.customer.create({ data: { documentId, name, rnc: documentId } });
      created.customerIds.push(c.id);
      return c;
    };
    const peerCustomer = await mk('101010101', 'COMERCIAL ELECTRONICA SRL');
    const unknownCustomer = await mk('555555555', 'CLIENTE NO ELECTRONICO SRL');
    const req = { userId: admin.id, role: 'ADMINISTRADOR' };
    const sell = customer => sales.createSale({ customerId: customer.id, details: [{ productId: product.id, quantity: 2, discount: 0 }], discount: 0, paymentMethod: 'EFECTIVO' }, admin.id, admin.fullName, req);

    /* A. Directorio */
    const dirPeer = await directory.checkCustomer(peerCustomer.id);
    check('el directorio reconoce a un emisor electrónico y guarda sus URL', dirPeer.ecfIssuer === true && dirPeer.ecfReceptionUrl.endsWith('/receptor-sim/fe/recepcion/api/ecf') && dirPeer.ecfApprovalUrl.endsWith('/fe/aprobacioncomercial/api/ecf'), dirPeer.ecfReceptionUrl);
    const dirUnknown = await directory.checkCustomer(unknownCustomer.id);
    check('un cliente que no es emisor electrónico queda marcado', dirUnknown.ecfIssuer === false && !dirUnknown.ecfReceptionUrl);
    check('la consulta reciente se reutiliza (24 h)', (await directory.checkCustomer(peerCustomer.id)).cached === true);
    check('...y se puede forzar', (await directory.checkCustomer(peerCustomer.id, { force: true })).cached === false);
    const consumer = await prisma.customer.findFirst({ where: { documentId: '000000000' } });
    await expectError('el consumidor final no se consulta', () => directory.checkCustomer(consumer.id), 'RNC o cédula válido');
    check('el simulador recibió consultas con token', sim.state.requests.some(r => r.path.includes('consultadirectorio')));

    /* B. Entrega al comprador que es emisor electrónico */
    const sPeer = await sell(peerCustomer);
    created.sales.push(sPeer.id);
    await drain([sPeer.id], ['ECF']);
    const delivery = await basePrisma.ecfDocument.findFirst({ where: { saleId: sPeer.id, kind: 'DELIVERY' } });
    check('al aceptarse el e-CF se programa la entrega al comprador', !!delivery && delivery.status === 'PENDING' && delivery.target.endsWith('/receptor-sim/fe/recepcion/api/ecf'));
    const delivered = await drain([sPeer.id], ['DELIVERY']);
    check('el comprador recibe el e-CF y devuelve su acuse (ARECF)', delivered[0].status === 'ACCEPTED' && sim.state.peer.received.length === 1 && sim.state.peer.received[0].eNcf === sPeer.eNcf, delivered[0].status);
    check('llega a nombre del emisor correcto', sim.state.peer.received[0].rncEmisor === RNC && sim.state.peer.received[0].rncComprador === '101010101');
    const arecfDoc = await basePrisma.ecfDocument.findFirst({ where: { saleId: sPeer.id, kind: 'ARECF' } });
    check('guarda el acuse de recibo del comprador', !!arecfDoc && readArecf(arecfDoc.xml).status === 0 && verifySignedXml(arecfDoc.xml).valid);
    check('la venta conserva el estado de la DGII', (await basePrisma.sale.findUnique({ where: { id: sPeer.id } })).ecfStatus === 'ACCEPTED');

    /* C. El comprador no recibe (duplicado) */
    sim.peer.rejectNext(3);
    const sRej = await sell(peerCustomer);
    created.sales.push(sRej.id);
    await drain([sRej.id], ['ECF']);
    const rej = await drain([sRej.id], ['DELIVERY']);
    check('un acuse «no recibido» deja la entrega rechazada con su motivo', rej[0].status === 'REJECTED' && /duplicado/.test(rej[0].lastError || ''), rej[0].lastError);

    /* D. Receptor caído: reintenta */
    sim.peer.failNext(1);
    const sDown = await sell(peerCustomer);
    created.sales.push(sDown.id);
    await drain([sDown.id], ['ECF']);
    await processDueDocuments();
    let d = await basePrisma.ecfDocument.findFirst({ where: { saleId: sDown.id, kind: 'DELIVERY' } });
    check('si el comprador no responde la entrega queda en ERROR con reintento', d.status === 'ERROR' && d.attempts === 1 && d.nextAttemptAt > new Date(), d.status);
    await basePrisma.ecfDocument.update({ where: { id: d.id }, data: { nextAttemptAt: null } });
    const redelivered = await drain([sDown.id], ['DELIVERY']);
    check('...y se entrega al volver el servicio', redelivered[0].status === 'ACCEPTED');

    /* E. Comprador no electrónico: no hay entrega */
    const sPlain = await sell(unknownCustomer);
    created.sales.push(sPlain.id);
    await drain([sPlain.id], ['ECF']);
    check('a un comprador no electrónico no se le entrega (recibe la representación impresa)', (await basePrisma.ecfDocument.count({ where: { saleId: sPlain.id, kind: 'DELIVERY' } })) === 0);

    /* F. Recibir e-CF de otro contribuyente (acuse de recibo síncrono y firmado) */
    const peerEcf = (eNcf, overrides = {}) =>
      signXml(
        buildEcfXml({
          ecfType: 'E31',
          eNcf,
          issuer: { rnc: '101010101', legalName: 'COMERCIAL ELECTRONICA SRL', address: 'Av. 27 de Febrero #1' },
          buyer: { rnc: overrides.buyerRnc || RNC, name: 'EMPRESA PRUEBA SRL' },
          lines: [{ name: 'Cemento gris 42.5 kg', quantity: 10, unitPrice: 520 }],
          taxRate: 0.18,
          paymentMethod: 'EFECTIVO',
          issuedAt: new Date(),
          signedAt: new Date(),
          sequenceValidUntil: new Date('2028-12-31T12:00:00Z'),
        }).xml,
        overrides.creds || sim.peer.creds
      );
    const path = `/ecf-receptor/${RNC}/fe/recepcion/api/ecf`;
    const good = peerEcf('E310000000007');
    const r1 = await post(path, good);
    const a1 = readArecf(r1.text);
    check('recibe un e-CF válido y responde un ARECF «recibido»', r1.status === 200 && a1.status === 0 && a1.eNcf === 'E310000000007' && a1.rncComprador === RNC, `${r1.status} estado=${a1.status}`);
    check('el acuse viene firmado por la empresa receptora', verifySignedXml(r1.text).valid);
    const inbox = await prisma.ecfInbox.findFirst({ where: { eNcf: 'E310000000007' } });
    check('queda en la bandeja de recibidos', !!inbox && inbox.rncEmisor === '101010101' && inbox.status === 'RECIBIDO' && inbox.total === 6136, `total=${inbox?.total}`);
    const dup = readArecf((await post(path, good)).text);
    check('un envío duplicado se rechaza (motivo 3)', dup.status === 1 && dup.reasonCode === 3);
    const tampered = readArecf((await post(path, good.replace('Cemento gris', 'Cemento negro').replace('E310000000007', 'E310000000008'))).text);
    check('un XML alterado se rechaza por firma (motivo 2)', tampered.status === 1 && tampered.reasonCode === 2, `motivo=${tampered.reasonCode}`);
    const stranger = generateTestPkcs12({ rnc: '999999999', password: 'x' });
    const { parsePkcs12 } = await load('modules/ecf/ecf.certificate.js');
    const forged = readArecf((await post(path, peerEcf('E310000000009', { creds: parsePkcs12(stranger.p12, stranger.password) }))).text);
    check('un certificado que no es del emisor declarado se rechaza (motivo 2)', forged.status === 1 && forged.reasonCode === 2, `motivo=${forged.reasonCode}`);
    const wrongBuyer = readArecf((await post(path, peerEcf('E310000000010', { buyerRnc: '131880738' }))).text);
    check('un comprobante para otro comprador se rechaza (motivo 4)', wrongBuyer.status === 1 && wrongBuyer.reasonCode === 4, `motivo=${wrongBuyer.reasonCode}`);
    const garbage = readArecf((await post(path, '<esto no es un e-CF/>')).text);
    check('un XML que no cumple el esquema se rechaza (motivo 1)', garbage.status === 1 && garbage.reasonCode === 1);
    check('un RNC que no es de ninguna empresa responde 404', (await post('/ecf-receptor/123456782/fe/recepcion/api/ecf', good)).status === 404);
    check('la ruta no distingue mayúsculas (requisito de la DGII)', (await post(`/ecf-receptor/${RNC}/FE/Recepcion/API/ECF`, peerEcf('E310000000011'))).status === 200);
    check('solo quedaron guardados los aceptados', (await prisma.ecfInbox.count()) === 2);

    /* G. Aprobación comercial de lo que recibimos */
    await expectError('rechazar exige un motivo', () => approvals.respondToInbox(inbox.id, { approved: false }), 'motivo');
    const approved = await approvals.respondToInbox(inbox.id, { approved: true });
    check('aprobar informa a la DGII y al emisor', approved.status === 'APROBADO' && approved.dgii === 'recibida' && approved.issuer === 'enviada', JSON.stringify(approved));
    check('la DGII recibió el ACECF y el emisor también', sim.state.approvals.length === 1 && sim.state.approvals[0].eNcf === 'E310000000007' && sim.state.approvals[0].status === 1 && sim.state.peer.approvals.length === 1);
    await expectError('no se responde dos veces', () => approvals.respondToInbox(inbox.id, { approved: true }), 'ya fue respondido');
    const inbox2 = await prisma.ecfInbox.findFirst({ where: { eNcf: 'E310000000011' } });
    const refused = await approvals.respondToInbox(inbox2.id, { approved: false, reason: 'Mercancía no recibida' });
    check('rechazar con motivo', refused.status === 'RECHAZADO' && sim.state.approvals[1].status === 2);

    /* H. Aprobación comercial que nos envían sobre un e-CF nuestro */
    const approvalPath = `/ecf-receptor/${RNC}/fe/aprobacioncomercial/api/ecf`;
    const acecf = (eNcf, approvedFlag, extra = {}) =>
      signXml(buildAcecfXml({ rncEmisor: RNC, rncComprador: '101010101', eNcf, issueDate: '10-10-2026', total: sPeer.total, approved: approvedFlag, rejectionReason: extra.reason }), extra.creds || sim.peer.creds);
    const ok = await post(approvalPath, acecf(sPeer.eNcf, true));
    check('recibe la aprobación comercial de un cliente (HTTP 200)', ok.status === 200, ok.text.slice(0, 80));
    const stored = await basePrisma.ecfDocument.findFirst({ where: { saleId: sPeer.id, kind: 'ACECF' } });
    check('queda registrada en la venta', stored?.status === 'ACCEPTED');
    const no = await post(approvalPath, acecf(sRej.eNcf, false, { reason: 'Productos dañados' }));
    const storedNo = await basePrisma.ecfDocument.findFirst({ where: { saleId: sRej.id, kind: 'ACECF' } });
    check('registra el rechazo comercial con su motivo', no.status === 200 && storedNo?.status === 'REJECTED' && /dañados/.test(storedNo.lastError));
    check('un e-NCF que no es nuestro se rechaza (400)', (await post(approvalPath, acecf('E310000099999', true))).status === 400);
    check('una firma que no es del comprador se rechaza (400)', (await post(approvalPath, acecf(sPeer.eNcf, true, { creds: parsePkcs12(stranger.p12, stranger.password) }))).status === 400);
  });
} finally {
  stopEcfWorker();
  await basePrisma.ecfDocument.deleteMany({ where: { companyId: company.id } });
  await basePrisma.ecfInbox.deleteMany({ where: { companyId: company.id } });
  await basePrisma.inventoryLog.deleteMany({ where: { companyId: company.id, productId: { in: created.productIds } } });
  await basePrisma.sale.deleteMany({ where: { id: { in: created.sales }, companyId: company.id } });
  await basePrisma.product.deleteMany({ where: { id: { in: created.productIds } } });
  await basePrisma.customer.deleteMany({ where: { id: { in: created.customerIds } } });
  if (created.categoryId) await basePrisma.category.delete({ where: { id: created.categoryId } }).catch(() => {});
  await basePrisma.ecfSequence.deleteMany({ where: { companyId: company.id } });
  await basePrisma.ecfConfig.deleteMany({ where: { companyId: company.id } });
  for (const seq of ncfBefore) await basePrisma.nCFSequence.update({ where: { id: seq.id }, data: { current: seq.current } });
  await basePrisma.company.update({ where: { id: company.id }, data: previous });
  resetReceiverIndex();
  console.log('limpieza: ventas restantes en Empresa Prueba =', await basePrisma.sale.count({ where: { companyId: company.id } }));
  apiServer.close();
  simServer.close();
}

console.log(failed ? `\n${failed} FALLO(S)` : '\nTODO OK');
await basePrisma.$disconnect();
process.exit(failed ? 1 : 0);
