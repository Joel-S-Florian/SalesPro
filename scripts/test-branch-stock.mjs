// Prueba del stock por sucursal y de las transferencias: entradas y ventas por sucursal, la suma de sucursales siempre igual a
// Product.stock, notas de crédito que regresan a su sucursal, transferencias (enviar, recibir, anular, errores), perecederos con
// lotes por sucursal, ventas simultáneas sin sobreventa y aislamiento entre empresas.
// Usa el API en http://127.0.0.1:4010 (o TEST_API_URL) y servicios en proceso; crea empresas «ZZ Stock» que borra al terminar.
//
//   node --env-file=apps/api/.env scripts/test-branch-stock.mjs
const root = new URL('../apps/api/src/', import.meta.url);
const load = p => import(new URL(p, root).href);
const { basePrisma } = await load('config/db.js');
const { tenantStore } = await load('config/tenant.js');
const { hashPassword } = await load('shared/utils/crypto.js');
const { createCompany } = await load('modules/platform/platform.service.js');
const inventory = await load('modules/inventory/inventory.service.js');
const products = await load('modules/products/products.service.js');
const sales = await load('modules/sales/sales.service.js');
const configService = await load('modules/config/config.service.js');

const API = process.env.TEST_API_URL || 'http://127.0.0.1:4010/api';
const PASSWORD = 'Clave-Stock-Segura-1';
let failed = 0;
const check = (name, ok, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`);
  if (!ok) failed++;
};
const call = async (method, path, { token, body, branch } = {}) => {
  const res = await fetch(API + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(branch ? { 'X-Branch-Id': branch } : {}) }, body: body ? JSON.stringify(body) : undefined });
  let json = null;
  try {
    json = await res.json();
  } catch {
    // sin cuerpo
  }
  return { status: res.status, json };
};
const login = async username => (await call('POST', '/auth/login', { body: { username, password: PASSWORD } })).json?.accessToken;
const fails = async fn => {
  try {
    await fn();
    return null;
  } catch (err) {
    return err;
  }
};

const suffix = String(Date.now() % 1e6);
const companies = [];
const DAY = 24 * 3600 * 1000;

try {
  const made = await createCompany({ name: `ZZ Stock A ${suffix}`, plan: 'BUSINESS', admin: { fullName: 'Admin Stock', username: `zz_stock_a_${suffix}`, password: PASSWORD } });
  const madeB = await createCompany({ name: `ZZ Stock B ${suffix}`, plan: 'BUSINESS', admin: { fullName: 'Admin Otro', username: `zz_stock_b_${suffix}`, password: PASSWORD } });
  companies.push(made.id, madeB.id);
  const admin = await basePrisma.user.findUnique({ where: { username: `zz_stock_a_${suffix}` } });
  const token = await login(admin.username);
  const tokenB = await login(`zz_stock_b_${suffix}`);
  const cid = made.id;

  // Sucursales: Principal + Santiago + Puerto Plata
  const main = await basePrisma.branch.findFirst({ where: { companyId: cid, isMain: true } });
  const sgo = (await call('POST', '/branches', { token, body: { name: 'Santiago' } })).json;
  const pp = (await call('POST', '/branches', { token, body: { name: 'Puerto Plata' } })).json;
  check('hay tres sucursales para probar', Boolean(main && sgo?.id && pp?.id));

  // Contexto en proceso: la sucursal de trabajo se elige como lo hace el encabezado X-Branch-Id
  const at = (branchId, fn) => tenantStore.run({ companyId: cid, userBranchId: null, requestedBranchId: branchId || null }, fn);
  const requester = { userId: admin.id, role: 'ADMINISTRADOR', fullName: admin.fullName };

  const category = await basePrisma.category.findFirst({ where: { companyId: cid, name: 'General' } });
  const consumer = await basePrisma.customer.findFirst({ where: { companyId: cid, documentId: '000000000' } });
  await at(null, () => configService.updateConfig({ perishable: { enabled: true, yellowThresholdDays: 30, redThresholdDays: 7, autoDiscountEnabled: false, blockExpiredSales: true, discountRules: [] } }));

  const branchStock = async (productId, branchId) => (await basePrisma.branchStock.findUnique({ where: { branchId_productId: { branchId, productId } } }))?.stock ?? 0;
  const totalOf = async productId => (await basePrisma.product.findUnique({ where: { id: productId } })).stock;
  const sumOf = async productId => (await basePrisma.branchStock.aggregate({ where: { productId }, _sum: { stock: true } }))._sum.stock || 0;
  const invariant = async label => {
    const all = await basePrisma.product.findMany({ where: { companyId: cid } });
    let ok = true;
    let detail = '';
    for (const p of all) {
      const sum = await sumOf(p.id);
      if (Math.abs(sum - p.stock) > 0.001) {
        ok = false;
        detail += ` ${p.code}: total ${p.stock} vs sucursales ${sum};`;
      }
      if (p.isPerishable) {
        const batches = await basePrisma.productBatch.findMany({ where: { productId: p.id } });
        for (const b of await basePrisma.branch.findMany({ where: { companyId: cid } })) {
          const lots = batches.filter(x => x.branchId === b.id).reduce((s, x) => s + x.currentStock, 0);
          if (Math.abs(lots - (await branchStock(p.id, b.id))) > 0.001) {
            ok = false;
            detail += ` ${p.code}@${b.name}: lotes ${lots} vs stock ${await branchStock(p.id, b.id)};`;
          }
        }
      }
    }
    check(`invariante (${label}): Product.stock = suma de sucursales y lotes = stock de su sucursal`, ok, detail);
  };

  // ---------- Entradas por sucursal ----------
  const widget = await at(null, () => products.createProduct({ code: 'ZZ-STK-1', name: 'Widget ZZ', categoryId: category.id, costPrice: 50, salePrice: 100, stock: 10, minStock: 2 }, admin.id, admin.fullName));
  check('el stock inicial entra a la sucursal de trabajo (Principal)', (await branchStock(widget.id, main.id)) === 10 && (await totalOf(widget.id)) === 10);
  await at(sgo.id, () => inventory.adjustStock({ productId: widget.id, type: 'ENTRADA', quantity: 5, reason: 'Entrada en Santiago' }, admin.id, admin.fullName));
  check('una entrada con la sucursal Santiago va a Santiago y no a la Principal', (await branchStock(widget.id, sgo.id)) === 5 && (await branchStock(widget.id, main.id)) === 10 && (await totalOf(widget.id)) === 15);
  await at(pp.id, () => inventory.registerPurchase({ productId: widget.id, quantity: 2, unitCost: 60 }, admin.id, admin.fullName));
  check('una compra entra a la sucursal de trabajo y promedia el costo de toda la empresa', (await branchStock(widget.id, pp.id)) === 2 && (await totalOf(widget.id)) === 17);
  const overOut = await fails(() => at(pp.id, () => inventory.adjustStock({ productId: widget.id, type: 'SALIDA', quantity: 5, reason: 'más de lo que hay' }, admin.id, admin.fullName)));
  check('no se puede sacar de una sucursal más de lo que tiene (aunque la empresa lo tenga)', Boolean(overOut) && /no cubre|insuficiente/i.test(overOut.message), overOut?.message);
  await at(pp.id, () => inventory.adjustStock({ productId: widget.id, type: 'AJUSTE', quantity: 0, reason: 'conteo en cero' }, admin.id, admin.fullName));
  check('un ajuste fija solo el stock de su sucursal', (await branchStock(widget.id, pp.id)) === 0 && (await totalOf(widget.id)) === 15);
  await invariant('tras entradas y ajustes');

  // ---------- Listados por sucursal (encabezado X-Branch-Id) ----------
  const listMain = (await call('GET', '/products?limit=50', { token })).json.data.find(p => p.id === widget.id);
  const listSgo = (await call('GET', '/products?limit=50', { token, branch: sgo.id })).json.data.find(p => p.id === widget.id);
  check('el listado muestra el stock de la sucursal de trabajo y el total', listMain.stock === 10 && listSgo.stock === 5 && listSgo.totalStock === 15, `${listMain.stock}/${listSgo.stock}/${listSgo.totalStock}`);
  const detail = (await call('GET', `/products/${widget.id}`, { token, branch: sgo.id })).json;
  check('el detalle trae el stock de cada sucursal', detail.stock === 5 && detail.branchStocks.length === 3 && detail.branchStocks.find(b => b.branchId === main.id).stock === 10, JSON.stringify(detail.branchStocks));
  check('un encabezado con una sucursal inexistente se rechaza (400)', (await call('GET', '/products?limit=5', { token, branch: 'sucursal-que-no-existe' })).status === 400);
  const logsSgo = (await call('GET', '/inventory/logs?limit=50', { token, branch: sgo.id })).json.data;
  check('los movimientos del kárdex salen por sucursal', logsSgo.length >= 1 && logsSgo.every(l => l.branchId === sgo.id));
  const summarySgo = (await call('GET', '/inventory/summary', { token, branch: sgo.id })).json;
  check('el resumen de inventario es de la sucursal de trabajo', (summarySgo.data || summarySgo).totalStockUnits === 5, JSON.stringify(summarySgo).slice(0, 120));

  // ---------- Ventas y notas de crédito por sucursal ----------
  const terminalSgo = await basePrisma.terminal.create({ data: { companyId: cid, name: 'Caja Santiago', branchId: sgo.id } });
  const terminalMain = await basePrisma.terminal.create({ data: { companyId: cid, name: 'Caja Principal', branchId: main.id } });
  const sellAt = (terminalId, productId, quantity) => at(null, () => sales.createSale({ customerId: consumer.id, terminalId, details: [{ productId, quantity, discount: 0 }], discount: 0, paymentMethod: 'EFECTIVO' }, admin.id, admin.fullName, requester));
  const sale1 = await sellAt(terminalSgo.id, widget.id, 3);
  check('vender en Santiago descuenta de Santiago', (await branchStock(widget.id, sgo.id)) === 2 && (await branchStock(widget.id, main.id)) === 10 && (await totalOf(widget.id)) === 12);
  const overSale = await fails(() => sellAt(terminalSgo.id, widget.id, 3));
  check('Santiago no puede vender lo que solo tiene la Principal (INSUFFICIENT_STOCK)', Boolean(overSale) && /insuficiente/i.test(overSale.message), overSale?.message);
  await sellAt(terminalMain.id, widget.id, 4);
  check('vender en la Principal descuenta de la Principal', (await branchStock(widget.id, main.id)) === 6 && (await branchStock(widget.id, sgo.id)) === 2);
  const note = await at(null, () => sales.createCreditNote(sale1.id, { details: [{ productId: widget.id, quantity: 1 }], reason: 'devolución' }, admin.id, admin.fullName, requester));
  check('la nota de crédito regresa el stock a la sucursal de la venta original', (await branchStock(widget.id, sgo.id)) === 3 && (await branchStock(widget.id, main.id)) === 6 && Boolean(note.id));
  const log = await basePrisma.inventoryLog.findFirst({ where: { companyId: cid, productId: widget.id, type: 'DEVOLUCION' } });
  check('el movimiento de la devolución queda en la sucursal de la venta original', log?.branchId === sgo.id);
  await invariant('tras ventas y devolución');

  // ---------- Ventas simultáneas con la última unidad ----------
  const rare = await at(sgo.id, () => products.createProduct({ code: 'ZZ-STK-2', name: 'Pieza única ZZ', categoryId: category.id, costPrice: 10, salePrice: 20, stock: 1, minStock: 0 }, admin.id, admin.fullName));
  const racers = await Promise.allSettled(Array.from({ length: 5 }, () => sellAt(terminalSgo.id, rare.id, 1)));
  const won = racers.filter(r => r.status === 'fulfilled').length;
  check('cinco ventas simultáneas de la última unidad: una sola gana', won === 1 && (await branchStock(rare.id, sgo.id)) === 0, `ganadoras=${won}`);

  // ---------- Transferencias ----------
  const code = t => t.code;
  const t1 = await call('POST', '/transfers', { token, body: { fromBranchId: main.id, toBranchId: sgo.id, note: 'Reposición', lines: [{ productId: widget.id, quantity: 4 }] } });
  check('crear una transferencia (201, ENVIADA, con código T-)', t1.status === 201 && t1.json.status === 'ENVIADA' && /^T-\d{6}$/.test(code(t1.json)), `${t1.status} ${t1.json?.code}`);
  check('al enviar sale del origen y no entra aún al destino', (await branchStock(widget.id, main.id)) === 2 && (await branchStock(widget.id, sgo.id)) === 3 && (await totalOf(widget.id)) === 5);
  await invariant('con mercancía en tránsito');
  const rec = await call('POST', `/transfers/${t1.json.id}/receive`, { token });
  check('recibir la transferencia (RECIBIDA) suma al destino', rec.status === 200 && rec.json.status === 'RECIBIDA' && (await branchStock(widget.id, sgo.id)) === 7 && (await totalOf(widget.id)) === 9, `${rec.status}`);
  check('recibirla dos veces se rechaza (409) y no duplica el stock', (await call('POST', `/transfers/${t1.json.id}/receive`, { token })).status === 409 && (await branchStock(widget.id, sgo.id)) === 7);
  check('una recibida no se puede anular (409)', (await call('POST', `/transfers/${t1.json.id}/void`, { token })).status === 409);

  const t2 = await call('POST', '/transfers', { token, body: { fromBranchId: sgo.id, toBranchId: pp.id, lines: [{ productId: widget.id, quantity: 5 }] } });
  const voided = await call('POST', `/transfers/${t2.json.id}/void`, { token });
  check('anular en tránsito devuelve la mercancía al origen', voided.status === 200 && voided.json.status === 'ANULADA' && (await branchStock(widget.id, sgo.id)) === 7 && (await branchStock(widget.id, pp.id)) === 0);
  check('una anulada no se puede recibir (409)', (await call('POST', `/transfers/${t2.json.id}/receive`, { token })).status === 409);
  await invariant('tras recibir y anular');

  check('transferir más de lo que hay en el origen se rechaza (400)', (await call('POST', '/transfers', { token, body: { fromBranchId: pp.id, toBranchId: main.id, lines: [{ productId: widget.id, quantity: 1 }] } })).status === 400);
  check('el origen y el destino deben ser distintos (400)', (await call('POST', '/transfers', { token, body: { fromBranchId: main.id, toBranchId: main.id, lines: [{ productId: widget.id, quantity: 1 }] } })).status === 400);
  check('un producto repetido en la transferencia se rechaza (400)', (await call('POST', '/transfers', { token, body: { fromBranchId: sgo.id, toBranchId: main.id, lines: [{ productId: widget.id, quantity: 1 }, { productId: widget.id, quantity: 1 }] } })).status === 400);
  check('el vendedor no puede transferir (403)', (await (async () => {
    const seller = await basePrisma.user.create({ data: { companyId: cid, username: `zz_stock_v_${suffix}`, fullName: 'Vendedor', role: 'VENDEDOR', passwordHash: await hashPassword(PASSWORD) } });
    return call('GET', '/transfers', { token: await login(seller.username) });
  })()).status === 403);
  const listed = (await call('GET', '/transfers?status=RECIBIDA', { token })).json;
  check('el listado filtra por estado', listed.data.length === 1 && listed.data[0].id === t1.json.id && listed.pagination.total === 1);
  const kardexOut = await basePrisma.inventoryLog.count({ where: { companyId: cid, productId: widget.id, type: 'TRANSFER_OUT' } });
  const kardexIn = await basePrisma.inventoryLog.count({ where: { companyId: cid, productId: widget.id, type: 'TRANSFER_IN' } });
  check('cada traslado deja movimientos TRANSFER_OUT y TRANSFER_IN en su sucursal', kardexOut === 2 && kardexIn === 2, `${kardexOut}/${kardexIn}`);

  // Dos transferencias simultáneas de lo que alcanza para una
  const scarce = await at(main.id, () => products.createProduct({ code: 'ZZ-STK-3', name: 'Escaso ZZ', categoryId: category.id, costPrice: 10, salePrice: 20, stock: 3, minStock: 0 }, admin.id, admin.fullName));
  const moves = await Promise.all([1, 2, 3].map(() => call('POST', '/transfers', { token, body: { fromBranchId: main.id, toBranchId: sgo.id, lines: [{ productId: scarce.id, quantity: 2 }] } })));
  check('transferencias simultáneas: solo una cabe en el stock', moves.filter(m => m.status === 201).length === 1 && (await branchStock(scarce.id, main.id)) === 1, moves.map(m => m.status).join(','));

  // ---------- Perecederos: lotes por sucursal ----------
  const exp = new Date(Date.now() + 40 * DAY).toISOString().slice(0, 10);
  const milk = await at(main.id, () => products.createProduct({ code: 'ZZ-STK-4', name: 'Leche ZZ', categoryId: category.id, costPrice: 30, salePrice: 60, stock: 10, minStock: 1, isPerishable: true, batchNumber: 'L1', expirationDate: exp }, admin.id, admin.fullName));
  const lotsMain = await basePrisma.productBatch.findMany({ where: { productId: milk.id } });
  check('el stock inicial de un perecedero crea su lote en la sucursal de trabajo', lotsMain.length === 1 && lotsMain[0].branchId === main.id && lotsMain[0].currentStock === 10);
  const tm = await call('POST', '/transfers', { token, body: { fromBranchId: main.id, toBranchId: sgo.id, lines: [{ productId: milk.id, quantity: 4 }] } });
  const tmLine = tm.json?.lines?.[0];
  check('la transferencia de un perecedero guarda lote y vencimiento', tm.status === 201 && tmLine?.lots?.[0]?.batchNumber === 'L1' && tmLine.lots[0].quantity === 4, JSON.stringify(tmLine?.lots));
  check('el lote baja en el origen mientras va en camino', (await basePrisma.productBatch.findFirst({ where: { productId: milk.id, branchId: main.id } })).currentStock === 6);
  await call('POST', `/transfers/${tm.json.id}/receive`, { token });
  const lotSgo = await basePrisma.productBatch.findFirst({ where: { productId: milk.id, branchId: sgo.id } });
  check('al recibir se crea el mismo lote en el destino con el mismo vencimiento', lotSgo?.batchNumber === 'L1' && lotSgo.currentStock === 4 && lotSgo.expirationDate.toISOString().slice(0, 10) === exp);
  await invariant('con perecederos transferidos');
  const milkSale = await sellAt(terminalSgo.id, milk.id, 3);
  check('una venta en Santiago consume solo el lote de Santiago (FEFO por sucursal)', (await basePrisma.productBatch.findFirst({ where: { productId: milk.id, branchId: sgo.id } })).currentStock === 1 && (await basePrisma.productBatch.findFirst({ where: { productId: milk.id, branchId: main.id } })).currentStock === 6 && Boolean(milkSale.id));
  const milkOver = await fails(() => sellAt(terminalSgo.id, milk.id, 2));
  check('Santiago no vende lotes que están en la Principal', Boolean(milkOver) && /insuficiente/i.test(milkOver.message), milkOver?.message);
  const tv = await call('POST', '/transfers', { token, body: { fromBranchId: main.id, toBranchId: pp.id, lines: [{ productId: milk.id, quantity: 2 }] } });
  await call('POST', `/transfers/${tv.json.id}/void`, { token });
  check('anular una transferencia de perecedero devuelve el lote al origen', (await basePrisma.productBatch.findFirst({ where: { productId: milk.id, branchId: main.id } })).currentStock === 6);
  await invariant('al final');

  // ---------- Reportes por sucursal (?branchId=) ----------
  const allSales = await basePrisma.sale.findMany({ where: { companyId: cid } }); // el reporte incluye las notas de crédito (en negativo)
  const salesOf = branchId => allSales.filter(x => x.branchId === branchId);
  const sumTotal = list => Math.round(list.reduce((sum, x) => sum + Number(x.total), 0) * 100) / 100;
  const reportTotal = async branchId => {
    const rows = (await call('GET', `/reports/sales?groupBy=month${branchId ? `&branchId=${branchId}` : ''}`, { token })).json;
    return { count: rows.reduce((a, r) => a + r.count, 0), total: Math.round(rows.reduce((a, r) => a + r.total, 0) * 100) / 100 };
  };
  const repAll = await reportTotal(null);
  const repSgo = await reportTotal(sgo.id);
  const repMain = await reportTotal(main.id);
  check('el reporte de ventas sin filtro suma toda la empresa', repAll.count === allSales.length && repAll.total === sumTotal(allSales), `${repAll.count}/${allSales.length}`);
  check('el reporte de ventas filtrado por Santiago solo cuenta sus ventas', repSgo.count === salesOf(sgo.id).length && repSgo.total === sumTotal(salesOf(sgo.id)) && repSgo.count > 0, `${repSgo.count}/${salesOf(sgo.id).length}`);
  check('Santiago + Principal = toda la empresa', repSgo.count + repMain.count === repAll.count && Math.round((repSgo.total + repMain.total) * 100) / 100 === repAll.total);
  const listSgo2 = (await call('GET', `/sales?limit=100&branchId=${sgo.id}`, { token })).json;
  check('el historial de ventas se filtra por sucursal (y trae el nombre de la sucursal)', listSgo2.data.length > 0 && listSgo2.data.every(x => x.branchId === sgo.id && x.branch?.name === 'Santiago'), `${listSgo2.data.length}`);
  const sale1Detail = (await call('GET', `/sales/${sale1.id}`, { token })).json;
  check('el detalle de una venta trae los datos de su sucursal para el ticket', sale1Detail.branch?.name === 'Santiago' && 'address' in sale1Detail.branch && 'isMain' in sale1Detail.branch);
  check('un id de sucursal ajeno devuelve vacío, no datos de otra empresa', (await call('GET', `/reports/sales?groupBy=month&branchId=${(await basePrisma.branch.findFirst({ where: { companyId: madeB.id } })).id}`, { token })).json.length === 0);
  const closes = (await call('GET', `/cashier?branchId=${sgo.id}`, { token })).json;
  const closeRows = closes.data || closes;
  check('los cierres de caja se filtran por sucursal', Array.isArray(closeRows) && closeRows.every(c => c.branchId === sgo.id));

  // ---------- Aislamiento entre empresas ----------
  check('otra empresa no ve la transferencia (404)', (await call('GET', `/transfers/${t1.json.id}`, { token: tokenB })).status === 404);
  check('otra empresa no puede recibirla (404)', (await call('POST', `/transfers/${tm.json.id}/receive`, { token: tokenB })).status === 404);
  const prodB = await basePrisma.product.create({ data: { companyId: madeB.id, code: 'ZZ-STK-B', name: 'Ajeno', categoryId: (await basePrisma.category.findFirst({ where: { companyId: madeB.id } })).id, costPrice: 1, salePrice: 2, stock: 0 } });
  check('no se puede transferir con sucursales de otra empresa (400)', (await call('POST', '/transfers', { token, body: { fromBranchId: (await basePrisma.branch.findFirst({ where: { companyId: madeB.id } })).id, toBranchId: sgo.id, lines: [{ productId: prodB.id, quantity: 1 }] } })).status === 400);
  check('el listado de otra empresa no trae mis transferencias', (await call('GET', '/transfers', { token: tokenB })).json.data.length === 0);
} catch (err) {
  console.error('ERROR inesperado:', err);
  failed++;
} finally {
  for (const companyId of companies) {
    const users = (await basePrisma.user.findMany({ where: { companyId }, select: { id: true } })).map(u => u.id);
    await basePrisma.session.deleteMany({ where: { userId: { in: users } } });
    await basePrisma.auditLog.deleteMany({ where: { companyId } });
    await basePrisma.stockTransferLine.deleteMany({ where: { companyId } });
    await basePrisma.stockTransfer.deleteMany({ where: { companyId } });
    await basePrisma.saleBatchDetail.deleteMany({ where: { companyId } });
    await basePrisma.saleDetail.deleteMany({ where: { companyId } });
    await basePrisma.sale.deleteMany({ where: { companyId } });
    await basePrisma.cashierClose.deleteMany({ where: { companyId } });
    await basePrisma.inventoryLog.deleteMany({ where: { companyId } });
    await basePrisma.productBatch.deleteMany({ where: { companyId } });
    await basePrisma.branchStock.deleteMany({ where: { companyId } });
    await basePrisma.productPresentation.deleteMany({ where: { companyId } });
    for (const model of ['product', 'category', 'customer', 'supplier', 'systemConfig', 'nCFSequence']) await basePrisma[model].deleteMany({ where: { companyId } });
    await basePrisma.user.updateMany({ where: { companyId }, data: { defaultTerminalId: null } });
    await basePrisma.terminal.deleteMany({ where: { companyId } });
    await basePrisma.user.deleteMany({ where: { companyId } });
    await basePrisma.exportJob.deleteMany({ where: { companyId } });
    await basePrisma.subscriptionPayment.deleteMany({ where: { companyId } });
    await basePrisma.branch.deleteMany({ where: { companyId } });
    await basePrisma.company.delete({ where: { id: companyId } }).catch(e => console.log('limpieza:', e.message.split('\n').pop()));
  }
  await basePrisma.$disconnect();
}
console.log(failed ? `\n${failed} comprobación(es) fallaron` : '\nTodo bien');
process.exit(failed ? 1 : 0);
