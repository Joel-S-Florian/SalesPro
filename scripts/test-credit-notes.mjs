// Prueba de integración de ventas y notas de crédito (B01/B02/B04) contra la base real.
// Usa solo la empresa «Empresa Prueba» y deja todo como estaba.
// Uso: node --env-file=apps/api/.env scripts/test-credit-notes.mjs
const root = new URL('../apps/api/src/', import.meta.url);
const load = p => import(new URL(p, root).href);
const { basePrisma, prisma } = await load('config/db.js');
const { runInTenant } = await load('config/tenant.js');
const sales = await load('modules/sales/sales.service.js');
const analytics = await load('modules/reports/analytics.service.js');

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
const created = { sales: [], product: null, customer: null, category: null };

await runInTenant(company.id, async () => {
  try {
    const consumer = await prisma.customer.findFirst({ where: { documentId: '000000000' } });
    const category = await prisma.category.create({ data: { name: 'ZZ-TEST-CN' } });
    created.category = category.id;
    const product = await prisma.product.create({ data: { code: 'ZZ-CN-1', name: 'Producto prueba NC', categoryId: category.id, costPrice: 50, salePrice: 100, stock: 10, minStock: 1 } });
    created.product = product.id;
    const rncCustomer = await prisma.customer.create({ data: { documentId: '131880738', name: 'ZZ Cliente RNC', rnc: '131880738' } });
    created.customer = rncCustomer.id;

    const stock = async () => (await prisma.product.findUnique({ where: { id: product.id } })).stock;
    const req = { userId: admin.id, role: 'ADMINISTRADOR' };

    // Venta 1: consumidor final -> B02
    const s1 = await sales.createSale({ customerId: consumer.id, details: [{ productId: product.id, quantity: 4, discount: 0 }], discount: 0, paymentMethod: 'EFECTIVO' }, admin.id, admin.fullName, req);
    created.sales.push(s1.id);
    check('consumidor final emite B02', s1.ncfType === 'B02' && s1.invoiceNumber.startsWith('B02'), s1.invoiceNumber);
    // Venta 2: cliente con RNC -> B01 (con descuento de 20)
    const s2 = await sales.createSale({ customerId: rncCustomer.id, details: [{ productId: product.id, quantity: 2, discount: 0 }], discount: 20, paymentMethod: 'TARJETA' }, admin.id, admin.fullName, req);
    created.sales.push(s2.id);
    check('cliente con RNC emite B01', s2.ncfType === 'B01' && s2.invoiceNumber.startsWith('B01'), s2.invoiceNumber);
    check('stock tras 2 ventas = 4', (await stock()) === 4, String(await stock()));

    // Nota de crédito parcial sobre la venta 1 (1 de 4)
    const n1 = await sales.createCreditNote(s1.id, { reason: 'Producto defectuoso', details: [{ productId: product.id, quantity: 1 }] }, admin.id, admin.fullName, req);
    created.sales.push(n1.id);
    check('nota de crédito es B04', n1.ncfType === 'B04' && n1.invoiceNumber.startsWith('B04'), n1.invoiceNumber);
    check('montos de la nota en negativo (100 + 18 ITBIS)', n1.subtotal === -100 && n1.tax === -18 && n1.total === -118, `${n1.subtotal}/${n1.tax}/${n1.total}`);
    check('cantidad de la línea en negativo', n1.details[0].quantity === -1 && n1.details[0].subtotal === -100);
    check('referencia a la venta original', n1.relatedSaleId === s1.id);
    check('devuelve el stock (4 -> 5)', (await stock()) === 5, String(await stock()));
    const log = await prisma.inventoryLog.findFirst({ where: { productId: product.id, type: 'DEVOLUCION' } });
    check('movimiento DEVOLUCION registrado', !!log && log.quantity === 1);

    // Límites
    await expectError('no deja devolver más de lo vendido', () => sales.createCreditNote(s1.id, { reason: 'Exceso', details: [{ productId: product.id, quantity: 4 }] }, admin.id, admin.fullName, req), 'Solo se pueden devolver 3');
    await expectError('no permite nota sobre nota', () => sales.createCreditNote(n1.id, { reason: 'Nota sobre nota', details: [{ productId: product.id, quantity: 1 }] }, admin.id, admin.fullName, req), 'nota de crédito');

    // Segunda nota sobre la venta con descuento (proporcional): 1 de 2 unidades
    const n2 = await sales.createCreditNote(s2.id, { reason: 'Cliente cambió de opinión', details: [{ productId: product.id, quantity: 1 }] }, admin.id, admin.fullName, req);
    created.sales.push(n2.id);
    // venta 2: subtotal 200, descuento 20 -> base 180, ITBIS 32.40. Mitad: 100 - 10 = 90 + 16.20 = 106.20
    check('descuento e ITBIS proporcionales', n2.subtotal === -100 && n2.discount === -10 && n2.tax === -16.2 && n2.total === -106.2, `${n2.subtotal}/${n2.discount}/${n2.tax}/${n2.total}`);

    // Reportes: ventas netas del día = s1 + s2 - n1 - n2
    const { dayKey } = await load('shared/utils/tz.js'); const today = dayKey(new Date());
    const expected = Number((s1.total + s2.total - 118 - 106.2).toFixed(2));
    const ov = await analytics.getOverview({ from: today, to: today });
    check('resumen: ventas netas descuentan las notas', Math.abs(ov.kpis.total.value - expected) < 0.01, `${ov.kpis.total.value} vs ${expected}`);
    check('resumen: facturas no cuentan las notas', ov.kpis.invoices.value === 2 && ov.creditNotes === 2, `${ov.kpis.invoices.value} / ${ov.creditNotes}`);
    const fiscal = await analytics.getFiscalReport({ from: today, to: today });
    check('fiscal: neto = ventas - notas', Math.abs(fiscal.net.total - expected) < 0.01, `${fiscal.net.total}`);
    const types = fiscal.byType.map(t => `${t.ncfType}:${t.label}`).sort().join(',');
    check('etiquetas DGII en el reporte fiscal', types === 'B01:Crédito fiscal,B02:Consumo,B04:Nota de crédito', types);
    const cash = await prisma.sale.aggregate({ where: { paymentMethod: 'EFECTIVO' }, _sum: { total: true } });
    check('caja (suma de efectivo) resta la devolución', Math.abs(cash._sum.total - (s1.total - 118)) < 0.01, `${cash._sum.total}`);
  } finally {
    // Limpieza total de lo creado por la prueba
    const ids = created.sales;
    await basePrisma.inventoryLog.deleteMany({ where: { companyId: company.id, productId: created.product } });
    await basePrisma.sale.deleteMany({ where: { id: { in: ids.slice().reverse() }, companyId: company.id, relatedSaleId: { not: null } } });
    await basePrisma.sale.deleteMany({ where: { id: { in: ids }, companyId: company.id } });
    if (created.product) await basePrisma.product.delete({ where: { id: created.product } }).catch(() => {});
    if (created.customer) await basePrisma.customer.delete({ where: { id: created.customer } }).catch(() => {});
    if (created.category) await basePrisma.category.delete({ where: { id: created.category } }).catch(() => {});
    for (const seq of seqBefore) {
      await basePrisma.nCFSequence.update({ where: { id: seq.id }, data: { current: seq.current } });
    }
    const left = await basePrisma.sale.count({ where: { companyId: company.id } });
    console.log('limpieza: ventas restantes en Empresa Prueba =', left);
  }
});

console.log(failed ? `\n${failed} FALLO(S)` : '\nTODO OK');
await basePrisma.$disconnect();
process.exit(failed ? 1 : 0);
