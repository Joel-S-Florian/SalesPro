// Prueba de integración de perecederos: lotes, FEFO, descuento por vencimiento, devoluciones y alertas.
// Usa solo la empresa «Empresa Prueba» y deja todo como estaba.
// Uso: node --env-file=apps/api/.env scripts/test-batches-fefo.mjs
import { giveStock } from './lib/branch-stock.mjs';
const root = new URL('../apps/api/src/', import.meta.url);
const load = p => import(new URL(p, root).href);
const { basePrisma, prisma } = await load('config/db.js');
const { runInTenant } = await load('config/tenant.js');
const sales = await load('modules/sales/sales.service.js');
const inventory = await load('modules/inventory/inventory.service.js');
const products = await load('modules/products/products.service.js');
const batchesService = await load('modules/inventory/batches.service.js');
const configService = await load('modules/config/config.service.js');
const food = await load('modules/reports/food.service.js');
const { dayKey, addDays } = await load('shared/utils/tz.js');

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
const configBefore = await basePrisma.systemConfig.findMany({ where: { companyId: company.id, key: 'perishable' } });
const created = { sales: [], products: [], category: null };
const today = dayKey(new Date());
const day = n => addDays(today, n);

await runInTenant(company.id, async () => {
  try {
    const consumer = await prisma.customer.findFirst({ where: { documentId: '000000000' } });
    const category = await prisma.category.create({ data: { name: 'ZZ-TEST-FEFO' } });
    created.category = category.id;
    const req = { userId: admin.id, role: 'ADMINISTRADOR' };
    const sell = (productId, quantity, extra = {}) =>
      sales.createSale({ customerId: consumer.id, details: [{ productId, quantity, discount: 0 }], discount: 0, paymentMethod: 'EFECTIVO', ...extra }, admin.id, admin.fullName, req);
    const stockOf = async id => (await prisma.product.findUnique({ where: { id } })).stock;
    const batchSum = async id => (await prisma.productBatch.aggregate({ where: { productId: id }, _sum: { currentStock: true } }))._sum.currentStock || 0;
    const batchOf = async (id, number) => (await prisma.productBatch.findFirst({ where: { productId: id, batchNumber: number } }));

    // Configuración
    await expectError('módulo apagado: no deja crear perecederos', () => products.createProduct({ code: 'ZZ-PER-0', name: 'x', categoryId: category.id, costPrice: 1, salePrice: 2, stock: 0, isPerishable: true }, admin.id, admin.fullName), 'perecederos');
    await expectError('rojo debe ser menor que amarillo', () => configService.updateConfig({ perishable: { enabled: true, yellowThresholdDays: 5, redThresholdDays: 9 } }), 'menor');
    const cfg = await configService.updateConfig({ perishable: { enabled: true, yellowThresholdDays: 30, redThresholdDays: 7, autoDiscountEnabled: true, blockExpiredSales: true, discountRules: [{ daysRemaining: 3, discountPercent: 30 }, { daysRemaining: 7, discountPercent: 15 }] } });
    check('configuración de perecederos persiste', cfg.perishable.enabled && cfg.perishable.discountRules.length === 2 && cfg.perishable.yellowThresholdDays === 30);
    check('el resto de la configuración sigue intacto', cfg.taxRate === 0.18 && cfg.paymentMethods.length >= 1);

    // Producto y lotes
    const milk = await products.createProduct({ code: 'ZZ-PER-1', name: 'Leche ZZ', categoryId: category.id, costPrice: 50, salePrice: 100, stock: 0, minStock: 1, isPerishable: true }, admin.id, admin.fullName);
    created.products.push(milk.id);
    check('producto creado como perecedero', milk.isPerishable === true);

    const buy = (batchNumber, expirationDate, quantity) => inventory.registerPurchase({ productId: milk.id, quantity, unitCost: 50, supplier: 'Proveedor ZZ', batchNumber, expirationDate }, admin.id, admin.fullName);
    await expectError('compra sin lote es rechazada', () => inventory.registerPurchase({ productId: milk.id, quantity: 5, unitCost: 50, supplier: 'Proveedor ZZ' }, admin.id, admin.fullName), 'lote');
    await expectError('compra sin vencimiento es rechazada', () => inventory.registerPurchase({ productId: milk.id, quantity: 5, unitCost: 50, supplier: 'Proveedor ZZ', batchNumber: 'L0' }, admin.id, admin.fullName), 'vencimiento');
    await buy('LA', day(2), 5);
    await buy('LB', day(20), 10);
    await buy('LC', day(6), 5);
    await inventory.adjustStock({ productId: milk.id, type: 'ENTRADA', quantity: 4, reason: 'Lote ya vencido', batchNumber: 'LD', expirationDate: day(-3) }, admin.id, admin.fullName);
    check('stock del producto = suma de lotes (24)', (await stockOf(milk.id)) === 24 && (await batchSum(milk.id)) === 24, `${await stockOf(milk.id)}/${await batchSum(milk.id)}`);
    await expectError('mismo lote con otra fecha es rechazado', () => buy('LA', day(9), 1), 'otra fecha');
    await buy('LA', day(2), 0 + 1);
    await inventory.adjustStock({ productId: milk.id, type: 'SALIDA', quantity: 1, reason: 'Corrige entrada de prueba' }, admin.id, admin.fullName);
    check('mismo lote suma sin duplicarse', (await prisma.productBatch.count({ where: { productId: milk.id, batchNumber: 'LA' } })) === 1);
    // la salida manual FEFO tomó del lote vencido (primero que vence)
    check('salida manual descuenta primero el más próximo a vencer', (await batchOf(milk.id, 'LD')).currentStock === 3 && (await batchOf(milk.id, 'LA')).currentStock === 6);
    await inventory.adjustStock({ productId: milk.id, type: 'ENTRADA', quantity: 1, reason: 'Repone', batchNumber: 'LD', expirationDate: day(-3) }, admin.id, admin.fullName);
    await inventory.adjustStock({ productId: milk.id, type: 'SALIDA', quantity: 1, reason: 'Ajusta LA', }, admin.id, admin.fullName);
    // Estado actual: LD 3 (tras +1 y -1 FEFO -> LD), LA 6, LC 5, LB 10
    const snap = async () => Object.fromEntries((await prisma.productBatch.findMany({ where: { productId: milk.id }, orderBy: { batchNumber: 'asc' } })).map(b => [b.batchNumber, b.currentStock]));
    check('lotes antes de vender', JSON.stringify(await snap()) === JSON.stringify({ LA: 6, LB: 10, LC: 5, LD: 3 }), JSON.stringify(await snap()));

    // Venta FEFO con descuento: 8 uds = LA 6 (30%) + LC 2 (15%) (el vencido LD no se vende)
    const s1 = await sell(milk.id, 8);
    created.sales.push(s1.id);
    const afterSale = await snap();
    check('FEFO: consume LA y luego LC; ignora el vencido', afterSale.LA === 0 && afterSale.LC === 3 && afterSale.LD === 3 && afterSale.LB === 10, JSON.stringify(afterSale));
    // descuento: 6*100*30% = 180 + 2*100*15% = 30 -> 210; base 590; ITBIS 106.2; total 696.2
    check('descuento por vencimiento calculado en el servidor', s1.subtotal === 800 && s1.discount === 210 && s1.tax === 106.2 && s1.total === 696.2, `${s1.subtotal}/${s1.discount}/${s1.tax}/${s1.total}`);
    check('trazabilidad por lote (2 registros)', (await prisma.saleBatchDetail.count({ where: { saleDetailId: s1.details[0].id } })) === 2);
    check('stock del producto = suma de lotes tras la venta', (await stockOf(milk.id)) === (await batchSum(milk.id)), `${await stockOf(milk.id)}/${await batchSum(milk.id)}`);
    check('el cliente no puede forzar el descuento (se ignora lo enviado)', (await sell(milk.id, 1, {}).then(s => { created.sales.push(s.id); return s; })).discount === 15, 'LC a 4 días: 15% de 100');

    // Stock vigente insuficiente: quedan LC 2 + LB 10 = 12 vigentes (LD vencido no cuenta)
    await expectError('no vende más que los lotes vigentes', () => sell(milk.id, 13), 'Stock insuficiente');

    // Nota de crédito: devuelve a los lotes de origen (más recientes primero: LC antes que LA)
    const n1 = await sales.createCreditNote(s1.id, { reason: 'Prueba lotes', details: [{ productId: milk.id, quantity: 3 }] }, admin.id, admin.fullName, req);
    created.sales.push(n1.id);
    const afterNote = await snap();
    check('devolución vuelve a los lotes de la venta', afterNote.LC === 4 && afterNote.LA === 1, JSON.stringify(afterNote));
    check('stock = suma de lotes tras la devolución', (await stockOf(milk.id)) === (await batchSum(milk.id)));
    check('devolución registra lote en negativo', (await prisma.saleBatchDetail.count({ where: { saleDetailId: n1.details[0].id, quantity: { lt: 0 } } })) >= 1);

    // Reporte de vencimientos: descuentos otorgados y mermas
    const ld = await prisma.productBatch.findFirst({ where: { productId: milk.id, batchNumber: 'LD' } });
    await inventory.adjustStock({ productId: milk.id, type: 'MERMA', quantity: 2, reason: 'Vencido', batchId: ld.id }, admin.id, admin.fullName);
    const expiryReport = await food.getExpiryReport({});
    // 210 de la venta grande (8 uds) + 15 de la venta de 1 unidad
    check('reporte: descuento por vencimiento otorgado (225)', Math.abs(expiryReport.discounts.total - 225) < 0.01 && expiryReport.discounts.byProduct[0].productName === 'Leche ZZ', JSON.stringify(expiryReport.discounts.byProduct[0]));
    check('reporte: merma con costo perdido (2 x 50 = 100)', expiryReport.writeOffs.total === 100 && expiryReport.writeOffs.rows[0].quantity === 2, JSON.stringify(expiryReport.writeOffs.rows[0]));
    check('reporte: lotes en riesgo incluyen vencidos y críticos', expiryReport.risk.lots.some(l => l.status === 'EXPIRED') && expiryReport.risk.lots.some(l => l.status === 'RED'));
    check('reporte: el stock sigue cuadrando tras la merma', (await stockOf(milk.id)) === (await batchSum(milk.id)));
    // Alertas
    const expiring = await batchesService.getExpiringBatches({});
    const mine = expiring.data.filter(b => b.productId === milk.id);
    const statuses = Object.fromEntries(mine.map(b => [b.batchNumber, b.status]));
    check('alertas: vencido, rojo y amarillo', statuses.LD === 'EXPIRED' && statuses.LC === 'RED' && statuses.LA === 'RED' && statuses.LB === 'YELLOW', JSON.stringify(statuses));
    check('resumen cuenta vencidos y valor en riesgo', expiring.summary.expired >= 1 && expiring.summary.valueAtRisk > 0, JSON.stringify(expiring.summary));
    const catalog = await products.getProducts({ q: 'ZZ-PER-1', limit: 5 });
    check('catálogo expone el lote más próximo con su descuento', !!catalog.data[0].nearestBatch && catalog.data[0].nearestBatch.batchNumber !== 'LD', JSON.stringify(catalog.data[0].nearestBatch));

    // Concurrencia: dos ventas de 9 uds con 6 vigentes en LC/LA + 10 LB = 16: solo cabe una
    const settled = await Promise.allSettled([sell(milk.id, 9), sell(milk.id, 9)]);
    settled.forEach(r => r.status === 'fulfilled' && created.sales.push(r.value.id));
    const okCount = settled.filter(r => r.status === 'fulfilled').length;
    const negatives = await prisma.productBatch.count({ where: { productId: milk.id, currentStock: { lt: 0 } } });
    check('ventas simultáneas no sobrevenden', okCount === 1 && negatives === 0, `exitosas=${okCount} negativos=${negatives}`);
    check('stock = suma de lotes tras la concurrencia', (await stockOf(milk.id)) === (await batchSum(milk.id)), `${await stockOf(milk.id)}/${await batchSum(milk.id)}`);

    // Un producto existente pasa a perecedero: su stock queda en SIN-LOTE
    const plain = await prisma.product.create({ data: { code: 'ZZ-PER-2', name: 'Queso ZZ', categoryId: category.id, costPrice: 20, salePrice: 40, stock: 7, minStock: 1 } });
    await giveStock(prisma, plain);
    created.products.push(plain.id);
    await products.updateProduct(plain.id, { isPerishable: true }, admin.id, admin.fullName);
    const generic = await batchOf(plain.id, 'SIN-LOTE');
    check('al marcar perecedero el stock queda en SIN-LOTE', generic?.currentStock === 7 && generic.expirationDate === null);
    const s2 = await sell(plain.id, 3);
    created.sales.push(s2.id);
    check('SIN-LOTE se vende sin descuento ni alertas', s2.discount === 0 && (await stockOf(plain.id)) === 4 && (await batchSum(plain.id)) === 4);
    await products.updateProduct(plain.id, { isPerishable: false }, admin.id, admin.fullName);
    check('se puede desmarcar si no hay lotes con vencimiento', (await prisma.product.findUnique({ where: { id: plain.id } })).isPerishable === false);
    await expectError('no se desmarca con lotes que vencen y tienen stock', () => products.updateProduct(milk.id, { isPerishable: false }, admin.id, admin.fullName), 'lotes con vencimiento');
  } finally {
    const ids = created.sales;
    await basePrisma.inventoryLog.deleteMany({ where: { companyId: company.id, productId: { in: created.products } } });
    await basePrisma.sale.deleteMany({ where: { id: { in: ids.slice().reverse() }, companyId: company.id, relatedSaleId: { not: null } } });
    await basePrisma.sale.deleteMany({ where: { id: { in: ids }, companyId: company.id } });
    await basePrisma.productBatch.deleteMany({ where: { companyId: company.id, productId: { in: created.products } } });
    await basePrisma.product.deleteMany({ where: { id: { in: created.products } } });
    if (created.category) await basePrisma.category.delete({ where: { id: created.category } }).catch(() => {});
    await basePrisma.systemConfig.deleteMany({ where: { companyId: company.id, key: 'perishable' } });
    for (const row of configBefore) await basePrisma.systemConfig.create({ data: { companyId: company.id, key: row.key, value: row.value } });
    for (const seq of seqBefore) await basePrisma.nCFSequence.update({ where: { id: seq.id }, data: { current: seq.current } });
    await basePrisma.auditLog.deleteMany({ where: { companyId: company.id, createdAt: { gte: new Date(Date.now() - 30 * 60 * 1000) }, action: { in: ['UPDATE_CONFIG'] } } });
    const left = await basePrisma.sale.count({ where: { companyId: company.id } });
    const leftBatches = await basePrisma.productBatch.count({ where: { companyId: company.id } });
    console.log(`limpieza: ventas restantes = ${left}, lotes restantes = ${leftBatches}`);
  }
});

console.log(failed ? `\n${failed} FALLO(S)` : '\nTODO OK');
await basePrisma.$disconnect();
process.exit(failed ? 1 : 0);
