// Prueba de integración: productos a granel (lb/kg), presentaciones (paquete/caja) y eliminación de categorías.
// Usa solo la empresa «Empresa Prueba» y deja todo como estaba.
// Uso: node --env-file=apps/api/.env scripts/test-units.mjs
const root = new URL('../apps/api/src/', import.meta.url);
const load = p => import(new URL(p, root).href);
const { basePrisma, prisma } = await load('config/db.js');
const { runInTenant } = await load('config/tenant.js');
const sales = await load('modules/sales/sales.service.js');
const inventory = await load('modules/inventory/inventory.service.js');
const products = await load('modules/products/products.service.js');
const categories = await load('modules/categories/categories.service.js');
const configService = await load('modules/config/config.service.js');
const food = await load('modules/reports/food.service.js');
const { addDays, dayKey } = await load('shared/utils/tz.js');

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
const created = { sales: [], products: [], categories: [] };
const today = dayKey(new Date());

await runInTenant(company.id, async () => {
  try {
    const consumer = await prisma.customer.findFirst({ where: { documentId: '000000000' } });
    const category = await prisma.category.create({ data: { name: 'ZZ-TEST-UNITS' } });
    created.categories.push(category.id);
    const req = { userId: admin.id, role: 'ADMINISTRADOR' };
    const sell = (details, extra = {}) => sales.createSale({ customerId: consumer.id, details, discount: 0, paymentMethod: 'EFECTIVO', ...extra }, admin.id, admin.fullName, req);
    const stockOf = async id => (await prisma.product.findUnique({ where: { id } })).stock;

    // ---- A granel: tomate por libra a $40
    const tomato = await products.createProduct({ code: 'ZZ-TOM-1', name: 'Tomate ZZ', categoryId: category.id, costPrice: 25, salePrice: 40, stock: 100, minStock: 5, unit: 'LB' }, admin.id, admin.fullName);
    created.products.push(tomato.id);
    check('producto a granel guarda su unidad y stock decimal', tomato.unit === 'LB' && tomato.stock === 100);
    await expectError('unidad inválida es rechazada', () => products.createProduct({ code: 'ZZ-X', name: 'x', categoryId: category.id, costPrice: 1, salePrice: 2, stock: 0, unit: 'XYZ' }, admin.id, admin.fullName), 'Unidad');

    const s1 = await sell([{ productId: tomato.id, quantity: 1.25, discount: 0 }]);
    created.sales.push(s1.id);
    check('venta de 1.25 lb a $40 = $50 + ITBIS', s1.subtotal === 50 && s1.tax === 9 && s1.total === 59 && s1.details[0].quantity === 1.25 && s1.details[0].unit === 'LB', `${s1.subtotal}/${s1.tax}/${s1.total}`);
    check('descuenta el peso del stock (98.75)', (await stockOf(tomato.id)) === 98.75, String(await stockOf(tomato.id)));
    await expectError('más de 2 decimales es rechazado', () => sell([{ productId: tomato.id, quantity: 1.255, discount: 0 }]), '2 decimales');
    await expectError('cantidad cero o negativa es rechazada', () => sell([{ productId: tomato.id, quantity: 0, discount: 0 }]), 'mayor que cero');
    await expectError('no vende más del stock', () => sell([{ productId: tomato.id, quantity: 500, discount: 0 }]), 'Stock insuficiente');

    // Nota de crédito parcial por peso
    const n1 = await sales.createCreditNote(s1.id, { reason: 'Devuelve media libra', details: [{ productId: tomato.id, quantity: 0.5 }] }, admin.id, admin.fullName, req);
    created.sales.push(n1.id);
    check('nota de crédito por 0.5 lb = -$20 -ITBIS', n1.subtotal === -20 && n1.tax === -3.6 && n1.total === -23.6 && n1.details[0].quantity === -0.5, `${n1.subtotal}/${n1.tax}/${n1.total}`);
    check('la devolución regresa el peso al stock (99.25)', (await stockOf(tomato.id)) === 99.25, String(await stockOf(tomato.id)));
    await expectError('no devuelve más de lo vendido', () => sales.createCreditNote(s1.id, { reason: 'x', details: [{ productId: tomato.id, quantity: 1 }] }, admin.id, admin.fullName, req), 'Solo se pueden devolver 0.75 lb');

    // Ruido de coma flotante: 0.1 + 0.1 + 0.1 debe poder venderse completo desde 0.3
    const spice = await products.createProduct({ code: 'ZZ-SPI-1', name: 'Orégano ZZ', categoryId: category.id, costPrice: 10, salePrice: 100, stock: 0.3, minStock: 0, unit: 'LB' }, admin.id, admin.fullName);
    created.products.push(spice.id);
    for (let i = 0; i < 3; i++) created.sales.push((await sell([{ productId: spice.id, quantity: 0.1, discount: 0 }])).id);
    check('0.1 + 0.1 + 0.1 agota 0.3 sin residuos', (await stockOf(spice.id)) === 0, String(await stockOf(spice.id)));
    await expectError('con stock 0 no se vende', () => sell([{ productId: spice.id, quantity: 0.01, discount: 0 }]), 'Stock insuficiente');

    // ---- Unidad entera: no admite fracciones
    const milk = await products.createProduct({ code: 'ZZ-LEC-1', name: 'Leche ZZ', categoryId: category.id, costPrice: 12, salePrice: 20, stock: 100, minStock: 5, unit: 'UND',
      presentations: [{ name: 'Paquete x12', factor: 12, salePrice: 200, barcode: 'ZZ-PQ-12' }, { name: 'Caja x24', factor: 24, salePrice: 380 }] }, admin.id, admin.fullName);
    created.products.push(milk.id);
    await expectError('unidad entera no admite 1.5', () => sell([{ productId: milk.id, quantity: 1.5, discount: 0 }]), 'entera');
    check('el producto guarda sus presentaciones', (await prisma.productPresentation.count({ where: { productId: milk.id } })) === 2);
    const listed = await products.getProducts({ q: 'ZZ-PQ-12', limit: 5 });
    check('el código de barras del paquete encuentra el producto', listed.data.length === 1 && listed.data[0].id === milk.id && listed.data[0].presentations.length === 2);
    await expectError('código de barras repetido entre productos', () => products.createProduct({ code: 'ZZ-LEC-2', name: 'Otra', categoryId: category.id, costPrice: 1, salePrice: 2, stock: 0, presentations: [{ name: 'Paq', factor: 6, salePrice: 10, barcode: 'ZZ-PQ-12' }] }, admin.id, admin.fullName), 'código de barras');

    // ---- Presentaciones
    const pack = (await prisma.productPresentation.findFirst({ where: { productId: milk.id, name: 'Paquete x12' } }));
    const s2 = await sell([{ productId: milk.id, quantity: 2, presentationId: pack.id, discount: 0 }]);
    created.sales.push(s2.id);
    const d2 = s2.details[0];
    check('2 paquetes x12 = 24 unidades base a $400', d2.quantity === 24 && d2.presentationQty === 2 && d2.presentationName === 'Paquete x12' && s2.subtotal === 400, `${d2.quantity}/${d2.presentationQty}/${s2.subtotal}`);
    check('el stock baja 24 unidades (76)', (await stockOf(milk.id)) === 76, String(await stockOf(milk.id)));
    const loose = await sell([{ productId: milk.id, quantity: 3, discount: 0 }]);
    created.sales.push(loose.id);
    check('unidades sueltas se cobran a su precio ($60)', loose.subtotal === 60 && (await stockOf(milk.id)) === 73);
    await expectError('presentación de otro producto es rechazada', () => sell([{ productId: tomato.id, quantity: 1, presentationId: pack.id, discount: 0 }]), 'presentación');
    await expectError('paquetes no admiten fracciones', () => sell([{ productId: milk.id, quantity: 1.5, presentationId: pack.id, discount: 0 }]), 'entera');
    await expectError('no vende más paquetes que el stock', () => sell([{ productId: milk.id, quantity: 7, presentationId: pack.id, discount: 0 }]), 'Stock insuficiente');
    // Devolución de 5 unidades del paquete vendido (precio de paquete 200/12 por unidad)
    const n2 = await sales.createCreditNote(s2.id, { reason: 'Se dañaron 5', details: [{ productId: milk.id, quantity: 5 }] }, admin.id, admin.fullName, req);
    created.sales.push(n2.id);
    check('devolver 5 unidades cobra al precio del paquete (83.33)', n2.subtotal === -83.33 && (await stockOf(milk.id)) === 78, `${n2.subtotal}/${await stockOf(milk.id)}`);

    // ---- Presentaciones: edición reemplaza el conjunto
    await products.updateProduct(milk.id, { presentations: [{ name: 'Paquete x6', factor: 6, salePrice: 105 }] }, admin.id, admin.fullName);
    const after = await prisma.productPresentation.findMany({ where: { productId: milk.id } });
    check('editar presentaciones reemplaza el conjunto', after.length === 1 && after[0].name === 'Paquete x6');
    await expectError('no pasa a unidad entera con decimales en stock', () => products.updateProduct(tomato.id, { unit: 'UND' }, admin.id, admin.fullName), 'decimales');

    // ---- Perecedero a granel con lotes decimales (FEFO)
    await configService.updateConfig({ perishable: { enabled: true, yellowThresholdDays: 30, redThresholdDays: 7, autoDiscountEnabled: true, blockExpiredSales: true, discountRules: [{ daysRemaining: 3, discountPercent: 30 }, { daysRemaining: 7, discountPercent: 15 }] } });
    const cheese = await products.createProduct({ code: 'ZZ-QUE-1', name: 'Queso ZZ', categoryId: category.id, costPrice: 100, salePrice: 200, stock: 0, unit: 'LB', isPerishable: true }, admin.id, admin.fullName);
    created.products.push(cheese.id);
    await inventory.registerPurchase({ productId: cheese.id, quantity: 4.5, unitCost: 100, supplier: 'ZZ', batchNumber: 'Q1', expirationDate: addDays(today, 2) }, admin.id, admin.fullName);
    await inventory.registerPurchase({ productId: cheese.id, quantity: 10.25, unitCost: 100, supplier: 'ZZ', batchNumber: 'Q2', expirationDate: addDays(today, 30) }, admin.id, admin.fullName);
    check('compra a granel acepta decimales (14.75 lb)', (await stockOf(cheese.id)) === 14.75, String(await stockOf(cheese.id)));
    const s3 = await sell([{ productId: cheese.id, quantity: 6, discount: 0 }]);
    created.sales.push(s3.id);
    // 4.5 lb del lote que vence en 2 días (30%) + 1.5 lb del otro (0%): 4.5*200*0.3 = 270
    const batches = Object.fromEntries((await prisma.productBatch.findMany({ where: { productId: cheese.id } })).map(b => [b.batchNumber, b.currentStock]));
    check('FEFO con pesos: Q1 se agota y Q2 queda en 8.75', batches.Q1 === 0 && batches.Q2 === 8.75, JSON.stringify(batches));
    check('descuento por vencimiento sobre el peso del lote (270)', s3.discount === 270 && s3.subtotal === 1200, `${s3.discount}/${s3.subtotal}`);
    const n3 = await sales.createCreditNote(s3.id, { reason: 'Devuelve 2 lb', details: [{ productId: cheese.id, quantity: 2 }] }, admin.id, admin.fullName, req);
    created.sales.push(n3.id);
    check('la devolución vuelve a los lotes y el stock cuadra', Math.abs((await stockOf(cheese.id)) - (await prisma.productBatch.aggregate({ where: { productId: cheese.id }, _sum: { currentStock: true } }))._sum.currentStock) < 0.001);

    // ---- Reporte de granel y presentaciones
    const bulk = await food.getBulkReport({});
    const tomatoRow = bulk.bulk.find(b => b.productName === 'Tomate ZZ');
    check('reporte granel: tomate neto de devolución (0.75 lb, 30 pesos)', tomatoRow && tomatoRow.quantity === 0.75 && tomatoRow.amount === 30, JSON.stringify(tomatoRow));
    const packRow = bulk.presentations.find(p => p.presentation === 'Paquete x12');
    check('reporte presentaciones: 2 paquetes vendidos', packRow && packRow.packs === 2 && packRow.units === 24 && packRow.amount === 400, JSON.stringify(packRow));
    check('reporte: peso es parte de las ventas', bulk.summary.bulkRevenue > 0 && bulk.byUnit.some(u => u.unit === 'LB'));

    // ---- Categorías: eliminar moviendo los productos
    const cat2 = await prisma.category.create({ data: { name: 'ZZ-TEST-UNITS-2' } });
    created.categories.push(cat2.id);
    await expectError('no elimina una categoría con productos sin destino', () => categories.deleteCategory(category.id), 'producto(s)');
    await expectError('el destino no puede ser la misma categoría', () => categories.deleteCategory(category.id, { moveToCategoryId: category.id }), 'distinta');
    await expectError('el destino debe existir', () => categories.deleteCategory(category.id, { moveToCategoryId: 'inexistente' }), 'destino');
    const moved = await categories.deleteCategory(category.id, { moveToCategoryId: cat2.id });
    const stillThere = await prisma.product.count({ where: { id: { in: created.products }, categoryId: cat2.id } });
    check('mueve los productos y elimina la categoría', moved.moved === created.products.length && stillThere === created.products.length && !(await prisma.category.findUnique({ where: { id: category.id } })), JSON.stringify(moved));
    const empty = await prisma.category.create({ data: { name: 'ZZ-TEST-UNITS-3' } });
    check('una categoría vacía se elimina directo', (await categories.deleteCategory(empty.id)).moved === 0);
  } finally {
    const ids = created.sales;
    await basePrisma.inventoryLog.deleteMany({ where: { companyId: company.id, productId: { in: created.products } } });
    await basePrisma.sale.deleteMany({ where: { id: { in: ids.slice().reverse() }, companyId: company.id, relatedSaleId: { not: null } } });
    await basePrisma.sale.deleteMany({ where: { id: { in: ids }, companyId: company.id } });
    await basePrisma.productBatch.deleteMany({ where: { companyId: company.id, productId: { in: created.products } } });
    await basePrisma.productPresentation.deleteMany({ where: { companyId: company.id, productId: { in: created.products } } });
    await basePrisma.product.deleteMany({ where: { id: { in: created.products } } });
    await basePrisma.category.deleteMany({ where: { companyId: company.id, name: { startsWith: 'ZZ-TEST-UNITS' } } });
    await basePrisma.systemConfig.deleteMany({ where: { companyId: company.id, key: 'perishable' } });
    for (const row of configBefore) await basePrisma.systemConfig.create({ data: { companyId: company.id, key: row.key, value: row.value } });
    for (const seq of seqBefore) await basePrisma.nCFSequence.update({ where: { id: seq.id }, data: { current: seq.current } });
    await basePrisma.auditLog.deleteMany({ where: { companyId: company.id, createdAt: { gte: new Date(Date.now() - 30 * 60 * 1000) }, action: { in: ['UPDATE_CONFIG'] } } });
    console.log(`limpieza: ventas restantes = ${await basePrisma.sale.count({ where: { companyId: company.id } })}, productos = ${await basePrisma.product.count({ where: { companyId: company.id } })}`);
  }
});

console.log(failed ? `\n${failed} FALLO(S)` : '\nTODO OK');
await basePrisma.$disconnect();
process.exit(failed ? 1 : 0);
