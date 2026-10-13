// Prueba de integración de la devuelta por billetes y monedas: conteo de apertura, efectivo recibido/devuelto y caja resultante.
// Usa solo la empresa «Empresa Prueba» y deja todo como estaba.
// Uso: node --env-file=apps/api/.env scripts/test-cash-change.mjs
const root = new URL('../apps/api/src/', import.meta.url);
const load = p => import(new URL(p, root).href);
const { basePrisma, prisma } = await load('config/db.js');
const { runInTenant } = await load('config/tenant.js');
const sales = await load('modules/sales/sales.service.js');
const cashier = await load('modules/cashier/cashier.service.js');
const { makeChange, changeDue } = await load('shared/utils/cashChange.js');

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
const seqBefore = await basePrisma.nCFSequence.findMany({ where: { companyId: company.id } });
const created = { sales: [], product: null, category: null, terminal: null, shift: null };

await runInTenant(company.id, async () => {
  try {
    const consumer = await prisma.customer.findFirst({ where: { documentId: '000000000' } });
    const category = await prisma.category.create({ data: { name: 'ZZ-TEST-CASH' } });
    created.category = category.id;
    const product = await prisma.product.create({ data: { code: 'ZZ-CASH-1', name: 'Producto prueba efectivo', categoryId: category.id, costPrice: 10, salePrice: 100, stock: 100, minStock: 1 } });
    created.product = product.id;
    const terminal = await prisma.terminal.create({ data: { name: 'ZZ Caja efectivo' } });
    created.terminal = terminal.id;
    const req = { userId: admin.id, role: 'ADMINISTRADOR' };

    // --- Apertura con conteo ---
    await expectError('el conteo de apertura rechaza denominaciones inventadas', () => cashier.openShift(req, { terminalId: terminal.id, openingCount: { 300: 2 } }), 'Denominación desconocida');
    await expectError('el fondo debe coincidir con el conteo', () => cashier.openShift(req, { terminalId: terminal.id, openingBalance: 999, openingCount: { 100: 5, 25: 8 } }), 'no coincide');
    const shift = await cashier.openShift(req, { terminalId: terminal.id, openingCount: { 100: 5, 50: 4, 25: 8, 10: 10, 5: 10, 1: 20 } });
    created.shift = shift.id;
    check('el fondo inicial es la suma del conteo (500+200+200+100+50+20 = 1070)', shift.openingBalance === 1070, String(shift.openingBalance));

    let drawer = await cashier.getDrawer(req, shift.id);
    check('la caja al abrir = el conteo', drawer.total === 1070 && drawer.counts[100] === 5 && drawer.complete === true, JSON.stringify(drawer.counts));

    const sell = (cash, qty = 1) =>
      sales.createSale({ customerId: consumer.id, terminalId: terminal.id, details: [{ productId: product.id, quantity: qty, discount: 0 }], discount: 0, paymentMethod: 'EFECTIVO', ...(cash ? { cash } : {}) }, admin.id, admin.fullName, req);
    const track = s => { created.sales.push(s.id); return s; };

    // Total de 1 unidad = 118 (100 + 18 % ITBIS)
    const total = 118;
    const paid = { 100: 1, 25: 1 }; // 125 → devuelta 7
    const due = changeDue(125, total);
    check('devuelta de 125 sobre 118 = 7', due.due === 7 && due.rounding === 0);
    const suggestion = makeChange(due.due, drawer.counts);
    check('la devuelta sale de lo que hay en caja (5 + 1 + 1)', suggestion.exact && Object.entries(suggestion.pieces).every(([d, c]) => c <= (drawer.counts[d] || 0)), JSON.stringify(suggestion.pieces));

    // --- Validaciones ---
    await expectError('el efectivo recibido debe cubrir el total', () => sell({ received: { 100: 1 }, change: {} }), 'no cubre');
    await expectError('la devuelta debe ser la diferencia exacta', () => sell({ received: paid, change: { 5: 1 } }), 'no coincide');
    await expectError('una denominación inválida se rechaza', () => sell({ received: { 77: 1 }, change: {} }), 'Denominación desconocida');

    // --- Venta en efectivo con devuelta ---
    const s1 = track(await sell({ received: paid, change: suggestion.pieces }));
    check('la venta guarda lo recibido y la devuelta', s1.cashReceived && s1.cashChange && s1.paymentMethod === 'EFECTIVO');
    drawer = await cashier.getDrawer(req, shift.id);
    const expectedTotal = 1070 + 125 - 7;
    check('la caja se actualiza: + lo recibido − la devuelta', drawer.total === expectedTotal, `${drawer.total} esperado ${expectedTotal}`);
    check('el efectivo esperado del cierre sigue siendo fondo + ventas (1070 + 118)', Math.abs((await cashier.getCurrentShift(req, terminal.id)).summary.cashSales + 1070 - 1188) < 0.01);

    // --- Venta con cambio exacto (sin devuelta) y venta sin desglose (como antes) ---
    const s2 = track(await sell({ received: { 100: 1, 10: 1, 5: 1, 1: 3 }, change: {} }));
    check('pago exacto: devuelta vacía', Object.keys(s2.cashChange).length === 0);
    const s3 = track(await sell(null));
    check('sin desglose la venta en efectivo funciona como siempre', s3.cashReceived === null);

    // --- Caja sin conteo de apertura ---
    await cashier.closeShift(req, shift.id, { declaredCash: 0 });
    const shift2 = await cashier.openShift(req, { terminalId: terminal.id, openingBalance: 500 });
    drawer = await cashier.getDrawer(req, shift2.id);
    check('sin conteo de apertura, la caja se reporta como incompleta (pero responde)', drawer.hasOpeningCount === false && drawer.complete === false && drawer.total === 0);
    created.shift = [shift.id, shift2.id];
  } catch (err) {
    console.error('ERROR inesperado:', err);
    failed++;
  } finally {
    const shifts = [].concat(created.shift || []);
    await basePrisma.inventoryLog.deleteMany({ where: { productId: created.product } });
    await basePrisma.saleDetail.deleteMany({ where: { saleId: { in: created.sales } } });
    await basePrisma.sale.deleteMany({ where: { id: { in: created.sales } } });
    await basePrisma.cashierClose.deleteMany({ where: { id: { in: shifts } } });
    if (created.terminal) await basePrisma.terminal.deleteMany({ where: { id: created.terminal } });
    if (created.product) await basePrisma.product.deleteMany({ where: { id: created.product } });
    if (created.category) await basePrisma.category.deleteMany({ where: { id: created.category } });
    await basePrisma.auditLog.deleteMany({ where: { companyId: company.id, entity: 'cashier', createdAt: { gte: new Date(Date.now() - 30 * 60 * 1000) } } });
    for (const seq of seqBefore) await basePrisma.nCFSequence.update({ where: { id: seq.id }, data: { current: seq.current } });
    await basePrisma.$disconnect();
  }
});

console.log(failed ? `\n${failed} FALLO(S)` : '\nTodo en orden');
process.exit(failed ? 1 : 0);
