// Prueba de integración de planes y límites: topes de cajas, usuarios y productos, funciones bloqueadas por plan,
// ventas que NUNCA se bloquean, importación masiva parcial, exceso tras expirar la prueba y gracia.
// Crea empresas de prueba («ZZ Plan …») y las borra al terminar.
// Uso: node --env-file=apps/api/.env scripts/test-plan-limits.mjs
const root = new URL('../apps/api/src/', import.meta.url);
const load = p => import(new URL(p, root).href);
const { basePrisma, prisma } = await load('config/db.js');
const { runInTenant } = await load('config/tenant.js');
const { bootstrapCompany } = await load('modules/platform/bootstrap.js');
const terminals = await load('modules/terminals/terminals.service.js');
const auth = await load('modules/auth/auth.service.js');
const products = await load('modules/products/products.service.js');
const importer = await load('modules/inventory-import/inventory-import.service.js');
const ecfConfig = await load('modules/ecf/ecf.config.service.js');
const configService = await load('modules/config/config.service.js');
const sales = await load('modules/sales/sales.service.js');
const exportsService = await load('modules/exports/exports.service.js');
const { getPlanUsage } = await load('shared/plans.js');

let failed = 0;
const check = (name, ok, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`);
  if (!ok) failed++;
};
const expectCode = async (name, fn, code, extraCheck = () => true) => {
  try {
    await fn();
    check(name, false, 'no lanzó error');
  } catch (e) {
    check(name, e.code === code && e.statusCode === 403 && extraCheck(e), `${e.code}: ${e.message.slice(0, 90)}`);
  }
};

async function cleanup(companyIds) {
  for (const companyId of companyIds) {
    const w = { companyId };
    await basePrisma.exportJob.deleteMany({ where: w });
    await basePrisma.inventoryImport.deleteMany({ where: w });
    await basePrisma.saleBatchDetail.deleteMany({ where: w });
    await basePrisma.saleDetail.deleteMany({ where: w });
    await basePrisma.cashierClose.deleteMany({ where: w });
    await basePrisma.inventoryLog.deleteMany({ where: w });
    await basePrisma.sale.updateMany({ where: { companyId, relatedSaleId: { not: null } }, data: { relatedSaleId: null } });
    await basePrisma.sale.deleteMany({ where: w });
    await basePrisma.productBatch.deleteMany({ where: w });
    await basePrisma.productPresentation.deleteMany({ where: w });
    await basePrisma.product.deleteMany({ where: w });
    await basePrisma.category.deleteMany({ where: w });
    await basePrisma.customer.deleteMany({ where: w });
    await basePrisma.terminal.deleteMany({ where: w });
    await basePrisma.supplier.deleteMany({ where: w });
    await basePrisma.systemConfig.deleteMany({ where: w });
    await basePrisma.nCFSequence.deleteMany({ where: w });
    await basePrisma.auditLog.deleteMany({ where: w });
    const users = (await basePrisma.user.findMany({ where: w, select: { id: true } })).map(u => u.id);
    await basePrisma.session.deleteMany({ where: { userId: { in: users } } });
    await basePrisma.user.deleteMany({ where: w });
    await basePrisma.company.delete({ where: { id: companyId } }).catch(e => console.log('limpieza:', e.message.split('\n').pop()));
  }
}

const created = [];
async function makeCompany(label, data) {
  const company = await basePrisma.company.create({ data: { name: `ZZ Plan ${label}`, ...data } });
  created.push(company.id);
  await bootstrapCompany(company.id);
  const admin = await basePrisma.user.create({ data: { username: `zz_plan_${label}_admin_${Date.now() % 100000}`, passwordHash: 'x', fullName: 'Admin', role: 'ADMINISTRADOR', companyId: company.id } });
  return { company, admin, req: { userId: admin.id, fullName: 'Admin', role: 'ADMINISTRADOR' } };
}
const category = async companyId => (await basePrisma.category.findFirst({ where: { companyId, name: 'General' } })).id;
const day = 24 * 3600 * 1000;

// Restos de una corrida anterior que se haya interrumpido
await cleanup((await basePrisma.company.findMany({ where: { name: { startsWith: 'ZZ Plan' } }, select: { id: true } })).map(c => c.id));

try {
  // ======== FREE ========
  const free = await makeCompany('free', { plan: 'FREE' });
  await runInTenant(free.company.id, async () => {
    const usage0 = await getPlanUsage();
    check('FREE: sin fecha de prueba el estado es ACTIVE', usage0.status === 'ACTIVE' && usage0.effectivePlan === 'FREE');
    check('FREE: el uso trae los 5 recursos con sus topes', usage0.usage.terminals.limit === 1 && usage0.usage.users.limit === 2 && usage0.usage.branches.limit === 1 && usage0.usage.products.limit === 200 && usage0.usage.salesPerMonth.limit === 300);
    check('FREE: ya hay 1 usuario (el administrador)', usage0.usage.users.current === 1);

    // Cajas: tope 1
    const t1 = await terminals.createTerminal({ name: 'Caja 1' });
    await expectCode('FREE: la segunda caja se rechaza con PLAN_LIMIT', () => terminals.createTerminal({ name: 'Caja 2' }), 'PLAN_LIMIT', e => e.extra.resource === 'terminals' && e.extra.limit === 1 && e.extra.current === 1 && e.extra.plan === 'FREE' && /caja/.test(e.extra.message));
    await terminals.updateTerminal(t1.id, { active: false });
    const t2 = await terminals.createTerminal({ name: 'Caja 2' });
    check('FREE: desactivar una caja libera su cupo', Boolean(t2.id));
    await expectCode('FREE: reactivar la caja desactivada también cuenta contra el tope', () => terminals.updateTerminal(t1.id, { active: true }), 'PLAN_LIMIT');

    // Usuarios activos: tope 2 (el administrador + 1)
    const u2 = await auth.createUser({ username: 'zz_plan_free_u2', fullName: 'Usuario 2', role: 'VENDEDOR', password: 'Clave-Inicial-77' });
    await expectCode('FREE: el tercer usuario activo se rechaza', () => auth.createUser({ username: 'zz_plan_free_u3', fullName: 'Usuario 3', role: 'VENDEDOR', password: 'Clave-Inicial-77' }), 'PLAN_LIMIT', e => e.extra.resource === 'users');
    const u3 = await auth.createUser({ username: 'zz_plan_free_u3', fullName: 'Usuario 3', role: 'VENDEDOR', password: 'Clave-Inicial-77', active: false });
    check('FREE: un usuario inactivo no cuenta contra el tope', Boolean(u3.id));
    await expectCode('FREE: reactivar un usuario cuenta contra el tope', () => auth.updateUser(u3.id, { active: true }, free.admin.id), 'PLAN_LIMIT');
    await auth.updateUser(u2.id, { active: false }, free.admin.id);
    check('FREE: desactivar un usuario libera su cupo', (await auth.updateUser(u3.id, { active: true }, free.admin.id)).active === true);

    // Productos: tope 200
    const catId = await category(free.company.id);
    await basePrisma.product.createMany({ data: Array.from({ length: 199 }, (_, i) => ({ code: `ZZP-${i}`, name: `P${i}`, categoryId: catId, costPrice: 1, salePrice: 2, stock: 1000, minStock: 0, companyId: free.company.id })) });
    const p200 = await products.createProduct({ code: 'ZZP-200', name: 'Producto 200', categoryId: catId, costPrice: 1, salePrice: 2, stock: 1000, minStock: 0 }, free.admin.id, 'Admin');
    check('FREE: el producto 200 entra', Boolean(p200.id));
    await expectCode('FREE: el producto 201 se rechaza', () => products.createProduct({ code: 'ZZP-201', name: 'Producto 201', categoryId: catId, costPrice: 1, salePrice: 2, stock: 1, minStock: 0 }, free.admin.id, 'Admin'), 'PLAN_LIMIT', e => e.extra.resource === 'products' && e.extra.limit === 200 && e.extra.current === 200);
    await products.updateProduct(p200.id, { active: false }, free.admin.id, 'Admin');
    await expectCode('FREE: reactivar un producto cuenta contra el tope', async () => {
      await products.createProduct({ code: 'ZZP-201', name: 'Producto 201', categoryId: catId, costPrice: 1, salePrice: 2, stock: 1, minStock: 0 }, free.admin.id, 'Admin');
      await products.updateProduct(p200.id, { active: true }, free.admin.id, 'Admin');
    }, 'PLAN_LIMIT');

    // Funciones bloqueadas
    await expectCode('FREE: activar el e-CF se rechaza con PLAN_FEATURE', () => ecfConfig.updateConfig({ mode: 'PRECERT' }), 'PLAN_FEATURE', e => e.extra.feature === 'ecf' && e.extra.requiredPlan === 'STARTER');
    const cfg = await configService.getConfig();
    await expectCode('FREE: activar perecederos en Configuración se rechaza', () => configService.updateConfig({ perishable: { ...cfg.perishable, enabled: true } }), 'PLAN_FEATURE', e => e.extra.feature === 'perishables');
    await expectCode('FREE: crear un producto perecedero se rechaza', () => products.createProduct({ code: 'ZZP-PER', name: 'Perecedero', categoryId: catId, costPrice: 1, salePrice: 2, stock: 0, minStock: 0, isPerishable: true }, free.admin.id, 'Admin'), 'PLAN_FEATURE');
    const exportBasic = await exportsService.createJob({ userId: free.admin.id, fullName: 'Admin' }, { type: 'SALES', format: 'CSV' });
    check('FREE: la exportación CSV básica siempre se puede', exportBasic.status === 'PENDING');
    await exportsService.removeJob(exportBasic.id);
    await expectCode('FREE: el respaldo completo se rechaza', () => exportsService.createJob({ userId: free.admin.id, fullName: 'Admin' }, { type: 'FULL', format: 'CSV' }), 'PLAN_FEATURE', e => e.extra.feature === 'fullBackup');
    await expectCode('FREE: el formato JSON se rechaza', () => exportsService.createJob({ userId: free.admin.id, fullName: 'Admin' }, { type: 'SALES', format: 'JSON' }), 'PLAN_FEATURE');
    await basePrisma.exportJob.deleteMany({ where: { companyId: free.company.id } });

    // Ventas: JAMÁS se bloquean, aunque pasen el tope mensual
    const consumer = await basePrisma.customer.findFirst({ where: { companyId: free.company.id, documentId: '000000000' } });
    const product = await basePrisma.product.findFirst({ where: { companyId: free.company.id, code: 'ZZP-1' } });
    const terminal = t2;
    await basePrisma.sale.createMany({
      data: Array.from({ length: 300 }, (_, i) => ({ invoiceNumber: `ZZPLAN-${i}`, ncfType: 'B02', customerId: consumer.id, customerName: 'x', userId: free.admin.id, userName: 'x', subtotal: 1, tax: 0, discount: 0, total: 1, paymentMethod: 'EFECTIVO', companyId: free.company.id })),
    });
    // una nota de crédito (con relatedSaleId) no cuenta
    const firstSale = await basePrisma.sale.findFirst({ where: { companyId: free.company.id } });
    await basePrisma.sale.create({ data: { invoiceNumber: 'ZZPLAN-NC', ncfType: 'B04', customerId: consumer.id, customerName: 'x', userId: free.admin.id, userName: 'x', subtotal: -1, tax: 0, discount: 0, total: -1, paymentMethod: 'EFECTIVO', relatedSaleId: firstSale.id, companyId: free.company.id } });
    const usageFull = await getPlanUsage();
    check('FREE: el contador de ventas del mes no cuenta notas de crédito', usageFull.usage.salesPerMonth.current === 300);
    check('FREE: al 100 % de ventas el aviso es FULL y no bloquea la creación', usageFull.usage.salesPerMonth.level === 'FULL' && usageFull.usage.salesPerMonth.blocksCreation === false);
    let sale;
    try {
      sale = await sales.createSale({ customerId: consumer.id, terminalId: terminal.id, details: [{ productId: product.id, quantity: 1, discount: 0 }], discount: 0, paymentMethod: 'EFECTIVO' }, free.admin.id, 'Admin', free.req);
    } catch (e) {
      sale = { error: e.message };
    }
    check('FREE: la venta 301 del mes se registra igual (las ventas nunca se bloquean)', Boolean(sale?.id), sale?.error || '');
    check('FREE: tras la venta 301 el uso es 301 de 300', (await getPlanUsage()).usage.salesPerMonth.current === 301);
  });

  // ======== Importación parcial ========
  const imp = await makeCompany('import', { plan: 'FREE' });
  await runInTenant(imp.company.id, async () => {
    const catId = await category(imp.company.id);
    await basePrisma.product.createMany({ data: Array.from({ length: 195 }, (_, i) => ({ code: `ZZI-${i}`, name: `I${i}`, categoryId: catId, costPrice: 1, salePrice: 2, stock: 0, minStock: 0, companyId: imp.company.id })) });
    const job = await basePrisma.inventoryImport.create({ data: { fileName: 'zz.csv', status: 'STAGED', userId: imp.admin.id, userName: 'Admin', options: { defaultCategoryId: catId, updatePrices: false }, summary: { create: 12 }, companyId: imp.company.id } });
    const rows = Array.from({ length: 12 }, (_, i) => ({ importId: job.id, rowNumber: i + 2, raw: {}, action: 'CREATE', data: { code: `ZZN-${i}`, name: `Nuevo ${i}`, cost: 5, price: 9, stock: 3, unit: 'UND', minStock: 0, presentations: [] } }));
    // una fila perecedera: el plan gratis no la admite
    rows.push({ importId: job.id, rowNumber: 99, raw: {}, action: 'CREATE', data: { code: 'ZZN-PER', name: 'Perecedero', cost: 5, price: 9, stock: 3, unit: 'UND', minStock: 0, isPerishable: true, lot: 'L1', expiration: '2027-01-01', presentations: [] } });
    await basePrisma.inventoryImportRow.createMany({ data: rows });
    const result = await importer.applyImport(job.id, { userId: imp.admin.id, fullName: 'Admin' });
    const total = await prisma.product.count({ where: { active: true } });
    check('Importación: entra hasta el tope (195 + 5 = 200) y no falla todo el archivo', result.created === 5 && total === 200, JSON.stringify({ created: result.created, total }));
    check('Importación: el resto se devuelve como rechazado con su motivo', result.rejected === 8 && result.rejectedRows.every(r => /Tope de 200 productos|perecederos/.test(r.reason)), `${result.rejected} rechazadas`);
    check('Importación: el rechazo trae fila, código y motivo', result.rejectedRows[0].rowNumber && result.rejectedRows[0].code && result.rejectedRows[0].reason);
  });

  // ======== Prueba vencida (EXPIRED): exceso sin borrar nada ========
  const expired = await makeCompany('expired', { plan: 'STARTER', trialEndsAt: new Date(Date.now() - 30 * day) });
  await runInTenant(expired.company.id, async () => {
    for (let i = 1; i <= 3; i++) await basePrisma.terminal.create({ data: { name: `Caja ${i}`, companyId: expired.company.id } });
    const usage = await getPlanUsage();
    check('EXPIRED: el estado es EXPIRED y aplica el plan FREE', usage.status === 'EXPIRED' && usage.effectivePlan === 'FREE' && usage.plan === 'STARTER' && usage.downgraded === true);
    check('EXPIRED: se marca el exceso (3 cajas de 1) sin desactivar nada', usage.usage.terminals.exceeded === true && (await prisma.terminal.count({ where: { active: true } })) === 3);
    await expectCode('EXPIRED: no se puede crear otra caja', () => terminals.createTerminal({ name: 'Caja 4' }), 'PLAN_LIMIT');
    check('EXPIRED: las funciones de pago quedan bloqueadas', usage.features.ecf.allowed === false && usage.features.labels.allowed === false);
    await expectCode('EXPIRED: activar el e-CF se rechaza', () => ecfConfig.updateConfig({ mode: 'PRECERT' }), 'PLAN_FEATURE');
    const csv = await exportsService.createJob({ userId: expired.admin.id, fullName: 'Admin' }, { type: 'CUSTOMERS', format: 'CSV' });
    check('EXPIRED: la exportación básica sigue disponible', csv.status === 'PENDING');
    await exportsService.removeJob(csv.id);
    await basePrisma.exportJob.deleteMany({ where: { companyId: expired.company.id } });
  });

  // ======== Gracia (GRACE): mismos límites, con aviso ========
  const grace = await makeCompany('grace', { plan: 'STARTER', trialEndsAt: new Date(Date.now() - 3 * day) });
  await runInTenant(grace.company.id, async () => {
    const usage = await getPlanUsage();
    check('GRACE: estado GRACE con los límites de Starter y días de gracia restantes', usage.status === 'GRACE' && usage.effectivePlan === 'STARTER' && usage.graceDaysLeft === 4 && usage.usage.terminals.limit === 3, `quedan ${usage.graceDaysLeft}`);
    for (let i = 1; i <= 3; i++) await terminals.createTerminal({ name: `Caja ${i}` });
    await expectCode('GRACE: el tope de Starter (3 cajas) se respeta', () => terminals.createTerminal({ name: 'Caja 4' }), 'PLAN_LIMIT', e => e.extra.limit === 3 && e.extra.plan === 'STARTER');
    check('GRACE: las funciones de Starter siguen activas', usage.features.ecf.allowed && usage.features.perishables.allowed && usage.features.labels.allowed);
  });

  // ======== BUSINESS: productos sin tope ========
  const biz = await makeCompany('business', { plan: 'BUSINESS' });
  await runInTenant(biz.company.id, async () => {
    const usage = await getPlanUsage();
    check('BUSINESS: productos sin tope y 3 sucursales', usage.usage.products.limit === null && usage.usage.branches.limit === 3 && usage.usage.terminals.limit === 10);
    check('BUSINESS: respaldo completo y WhatsApp API como bandera', usage.features.fullBackup.allowed && usage.backup === 'full');
  });
} catch (err) {
  console.error('ERROR inesperado:', err);
  failed++;
} finally {
  await cleanup(created);
  await basePrisma.$disconnect();
}

console.log(failed ? `\n${failed} FALLO(S)` : '\nTodo en orden');
process.exit(failed ? 1 : 0);
