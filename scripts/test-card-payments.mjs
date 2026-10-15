// Prueba de integración del cobro con tarjeta (proveedores manual / simulador / Azul) y su vínculo con la venta.
// Usa solo la empresa «Empresa Prueba» y deja todo como estaba.
// Uso: node --env-file=apps/api/.env scripts/test-card-payments.mjs
import { giveStock } from './lib/branch-stock.mjs';
const root = new URL('../apps/api/src/', import.meta.url);
const load = p => import(new URL(p, root).href);
const { basePrisma, prisma } = await load('config/db.js');
const { runInTenant } = await load('config/tenant.js');
const sales = await load('modules/sales/sales.service.js');
const pay = await load('modules/payments/payments.service.js');

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

const company = await basePrisma.company.findFirst({ where: { name: 'Empresa Prueba' } });
const admin = await basePrisma.user.findFirst({ where: { companyId: company.id, role: 'ADMINISTRADOR' } });
const configBefore = await basePrisma.cardProviderConfig.findUnique({ where: { companyId: company.id } });
const seqBefore = await basePrisma.nCFSequence.findMany({ where: { companyId: company.id } });
const created = { sales: [], product: null, category: null };

await runInTenant(company.id, async () => {
  try {
    const consumer = await prisma.customer.findFirst({ where: { documentId: '000000000' } });
    const category = await prisma.category.create({ data: { name: 'ZZ-TEST-CARD' } });
    created.category = category.id;
    const product = await prisma.product.create({ data: { code: 'ZZ-CARD-1', name: 'Producto prueba tarjeta', categoryId: category.id, costPrice: 10, salePrice: 100, stock: 50, minStock: 1 } });
    await giveStock(prisma, product);
    created.product = product.id;
    const req = { userId: admin.id, role: 'ADMINISTRADOR' };
    const seller = { userId: admin.id, role: 'VENDEDOR' };
    const sell = (method, extra = {}, qty = 1) =>
      sales.createSale({ customerId: consumer.id, details: [{ productId: product.id, quantity: qty, discount: 0 }], discount: 0, paymentMethod: method, ...extra }, admin.id, admin.fullName, req);
    const track = s => { created.sales.push(s.id); return s; };

    // --- Sin terminal (NONE): se comporta como siempre ---
    await prisma.cardProviderConfig.deleteMany({});
    const plain = track(await sell('TARJETA'));
    check('sin terminal configurado, la venta con tarjeta funciona como siempre', plain.paymentMethod === 'TARJETA', String(plain.total));
    const total = plain.total;

    // --- Configuración ---
    const saved = await pay.saveCardConfig({ provider: 'SIMULATOR', mode: 'TEST', merchantId: 'COM-1', terminalCode: 'T-9', secret: 'clave-super-secreta' });
    check('la configuración se guarda y no devuelve la clave', saved.provider === 'SIMULATOR' && saved.hasSecret === true && !JSON.stringify(saved).includes('clave-super-secreta'));
    const row = await prisma.cardProviderConfig.findFirst();
    check('la clave del procesador queda cifrada en la base', row.secretEnc && !row.secretEnc.includes('clave-super-secreta'));
    const kept = await pay.saveCardConfig({ provider: 'SIMULATOR', mode: 'TEST', merchantId: 'COM-1', terminalCode: 'T-9' });
    check('al guardar sin clave, se conserva la anterior', kept.hasSecret === true);
    const sellerView = await pay.getCardConfig(seller);
    check('el cajero ve solo lo necesario (sin datos del comercio)', sellerView.provider === 'SIMULATOR' && sellerView.interactive === true && sellerView.merchantId === undefined && sellerView.hasSecret === undefined);
    await expectError('Azul todavía no se puede activar', () => pay.saveCardConfig({ provider: 'AZUL', mode: 'TEST' }), 'todavía no se puede activar');

    // --- Con terminal: la venta exige cobro ---
    await expectError('con terminal, la venta con tarjeta exige un cobro aprobado', () => sell('TARJETA'), 'Cobre con la tarjeta');
    await expectError('un cobro inexistente se rechaza', () => sell('TARJETA', { cardPaymentId: 'no-existe' }), 'no está aprobado');
    const ok = await pay.chargeCard({ amount: total }, seller);
    check('el simulador aprueba un cobro normal', ok.status === 'APPROVED' && ok.authCode && ok.last4 === '4242', `${ok.authCode}`);
    const sale = track(await sell('TARJETA', { cardPaymentId: ok.id }));
    const linked = await prisma.cardPayment.findUnique({ where: { id: ok.id } });
    check('la venta reclama el cobro (queda vinculado)', linked.saleId === sale.id);
    const detail = await sales.getSaleById(sale.id, req);
    check('el detalle de la venta muestra la tarjeta y su aprobación', detail.cardPayment?.last4 === '4242' && detail.cardPayment.authCode === ok.authCode);
    await expectError('un cobro no se puede usar en dos ventas', () => sell('TARJETA', { cardPaymentId: ok.id }), 'ya se usó');
    await expectError('un cobro vinculado no se puede anular', () => pay.voidCardPayment(ok.id, req), 'ya pertenece');

    // --- Monto que no coincide ---
    const wrong = await pay.chargeCard({ amount: total + 50 }, seller);
    await expectError('monto cobrado distinto al total de la venta se rechaza', () => sell('TARJETA', { cardPaymentId: wrong.id }), 'no coincide');
    check('el cobro con monto equivocado se anula solo (sin cargo huérfano)', (await prisma.cardPayment.findUnique({ where: { id: wrong.id } })).status === 'VOIDED');

    // --- Rechazo y error del terminal ---
    const declined = await pay.chargeCard({ amount: 50.13 }, seller);
    check('un rechazo no es una excepción (queda registrado)', declined.status === 'DECLINED' && declined.message.includes('Fondos'));
    await expectError('un cobro rechazado no sirve para vender', () => sell('TARJETA', { cardPaymentId: declined.id }), 'no está aprobado');
    const broken = await pay.chargeCard({ amount: 50.99 }, seller);
    check('un fallo del terminal queda como ERROR', broken.status === 'ERROR');

    // --- Anular un cobro libre ---
    const free = await pay.chargeCard({ amount: 20 }, seller);
    const voided = await pay.voidCardPayment(free.id, seller);
    check('el cajero puede anular su cobro libre', voided.status === 'VOIDED');
    const other = await pay.chargeCard({ amount: 20 }, { userId: 'otro', role: 'VENDEDOR' });
    await expectError('un cajero no anula el cobro de otro', () => pay.voidCardPayment(other.id, seller), 'sus propios cobros');

    // --- Efectivo con cobro adjunto ---
    const spare = await pay.chargeCard({ amount: total }, seller);
    await expectError('un cobro con tarjeta no se adjunta a una venta en efectivo', () => sell('EFECTIVO', { cardPaymentId: spare.id }), 'no es tarjeta');
    const cash = track(await sell('EFECTIVO'));
    check('la venta en efectivo sigue funcionando', cash.paymentMethod === 'EFECTIVO');

    // --- Modo manual (voucher de un terminal independiente) ---
    await pay.saveCardConfig({ provider: 'MANUAL', mode: 'TEST' });
    await expectError('manual: exige el código de aprobación', () => pay.chargeCard({ amount: total, manual: { last4: '1234' } }, seller), 'código de aprobación');
    await expectError('manual: exige los últimos 4 dígitos', () => pay.chargeCard({ amount: total, manual: { authCode: 'AB1234' } }, seller), 'últimos 4');
    const manual = await pay.chargeCard({ amount: total, manual: { authCode: 'ab1234', last4: '9876', brand: 'MASTERCARD' } }, seller);
    check('manual: aprueba con los datos del voucher', manual.status === 'APPROVED' && manual.authCode === 'AB1234' && manual.last4 === '9876' && manual.provider === 'MANUAL');
    const manualSale = track(await sell('TARJETA', { cardPaymentId: manual.id }));
    check('manual: la venta se registra con ese cobro', (await prisma.cardPayment.findUnique({ where: { id: manual.id } })).saleId === manualSale.id);

    // --- Cierre de caja: la tarjeta sigue separada del efectivo (por método de pago de la venta) ---
    check('las ventas con tarjeta conservan el método TARJETA', [plain, sale, manualSale].every(s => s.paymentMethod === 'TARJETA'));
  } catch (err) {
    console.error('ERROR inesperado:', err);
    failed++;
  } finally {
    const ids = created.sales;
    await basePrisma.cardPayment.deleteMany({ where: { companyId: company.id } });
    await basePrisma.inventoryLog.deleteMany({ where: { productId: created.product } });
    await basePrisma.saleDetail.deleteMany({ where: { saleId: { in: ids } } });
    await basePrisma.sale.deleteMany({ where: { id: { in: ids } } });
    if (created.product) await basePrisma.product.deleteMany({ where: { id: created.product } });
    if (created.category) await basePrisma.category.deleteMany({ where: { id: created.category } });
    await basePrisma.auditLog.deleteMany({ where: { companyId: company.id, entity: { in: ['card_payment', 'card_config'] } } });
    await basePrisma.cardProviderConfig.deleteMany({ where: { companyId: company.id } });
    if (configBefore) await basePrisma.cardProviderConfig.create({ data: configBefore });
    for (const seq of seqBefore) await basePrisma.nCFSequence.update({ where: { id: seq.id }, data: { current: seq.current } });
    await basePrisma.$disconnect();
  }
});

console.log(failed ? `\n${failed} FALLO(S)` : '\nTodo en orden');
process.exit(failed ? 1 : 0);
