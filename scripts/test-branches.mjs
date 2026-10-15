// Prueba del módulo de sucursales: sucursal Principal automática, tope por plan (Gratis 1, Business 3), nombres y códigos únicos,
// la Principal no se desactiva, la caja, el turno y la venta heredan la sucursal, el vendedor con sucursal solo ve sus cajas
// y el aislamiento entre empresas. Usa el API en http://127.0.0.1:4010 (o TEST_API_URL) con tres empresas «ZZ Sucursal» que borra al terminar.
//
//   node --env-file=apps/api/.env scripts/test-branches.mjs
import { giveStock } from './lib/branch-stock.mjs';
const root = new URL('../apps/api/src/', import.meta.url);
const load = p => import(new URL(p, root).href);
const { basePrisma } = await load('config/db.js');
const { hashPassword } = await load('shared/utils/crypto.js');
const { createCompany } = await load('modules/platform/platform.service.js');

const API = process.env.TEST_API_URL || 'http://127.0.0.1:4010/api';
const PASSWORD = 'Clave-Sucursal-Segura-1';
let failed = 0;
const check = (name, ok, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`);
  if (!ok) failed++;
};
const call = async (method, path, { token, body } = {}) => {
  const res = await fetch(API + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  let json = null;
  try {
    json = await res.json();
  } catch {
    // sin cuerpo
  }
  return { status: res.status, json };
};
const login = async username => (await call('POST', '/auth/login', { body: { username, password: PASSWORD } })).json?.accessToken;

const suffix = String(Date.now() % 1e6);
const companies = [];

const makeCompany = async (label, plan) => {
  const made = await createCompany({ name: `ZZ Sucursal ${label} ${suffix}`, plan, admin: { fullName: `Admin ${label}`, username: `zz_suc_${label}_${suffix}`, password: PASSWORD } });
  companies.push(made.id);
  const seller = await basePrisma.user.create({ data: { companyId: made.id, username: `zz_suc_${label}_v_${suffix}`, fullName: `Vendedor ${label}`, role: 'VENDEDOR', passwordHash: await hashPassword(PASSWORD) } });
  const token = await login(`zz_suc_${label}_${suffix}`);
  const sellerToken = await login(seller.username);
  return { id: made.id, token, seller, sellerToken };
};

try {
  const free = await makeCompany('free', 'FREE');
  const biz = await makeCompany('biz', 'BUSINESS');
  const other = await makeCompany('otra', 'BUSINESS');
  check('las sesiones de prueba inician', Boolean(free.token && biz.token && other.token && biz.sellerToken));

  // --- Principal automática ---
  const listFree = (await call('GET', '/branches?all=1', { token: free.token })).json;
  check('toda empresa nueva nace con la sucursal Principal', listFree.length === 1 && listFree[0].isMain && listFree[0].name === 'Principal' && listFree[0].code === '001', JSON.stringify(listFree.map(b => b.name)));
  check('el uso del plan cuenta 1 sucursal real', (await call('GET', '/company/plan-usage', { token: free.token })).json.usage.branches.current === 1);

  // --- Tope por plan ---
  const blocked = await call('POST', '/branches', { token: free.token, body: { name: 'Otra tienda' } });
  check('Gratis: la segunda sucursal se rechaza con PLAN_LIMIT (403)', blocked.status === 403, `${blocked.status} ${JSON.stringify(blocked.json).slice(0, 120)}`);
  check('Gratis: la Principal no se puede desactivar', (await call('PUT', `/branches/${listFree[0].id}`, { token: free.token, body: { active: false } })).status === 400);

  const b2 = await call('POST', '/branches', { token: biz.token, body: { name: 'Santiago', address: 'Av. Estrella Sadhalá 10', phone: '809-555-0100' } });
  check('Business: crea la segunda sucursal (201) con código automático', b2.status === 201 && b2.json.code === '002' && !b2.json.isMain, `${b2.status} ${b2.json?.code}`);
  const b3 = await call('POST', '/branches', { token: biz.token, body: { name: 'Puerto Plata', code: 'PP' } });
  check('Business: crea la tercera con código propio', b3.status === 201 && b3.json.code === 'PP');
  check('Business: la cuarta se rechaza (tope 3)', (await call('POST', '/branches', { token: biz.token, body: { name: 'La Vega' } })).status === 403);

  // --- Únicos ---
  check('el nombre repetido se rechaza (409), sin importar mayúsculas', (await call('PUT', `/branches/${b3.json.id}`, { token: biz.token, body: { name: 'santiago' } })).status === 409);
  check('el código repetido se rechaza (409)', (await call('PUT', `/branches/${b3.json.id}`, { token: biz.token, body: { code: '002' } })).status === 409);
  check('otra empresa puede usar el mismo nombre y código', (await call('POST', '/branches', { token: other.token, body: { name: 'Santiago', code: '002' } })).status === 201);

  // --- Desactivar libera cupo; reactivar lo vuelve a contar ---
  check('desactivar una sucursal sin turnos abiertos (200)', (await call('PUT', `/branches/${b3.json.id}`, { token: biz.token, body: { active: false } })).status === 200);
  const b4 = await call('POST', '/branches', { token: biz.token, body: { name: 'La Vega' } });
  check('desactivar libera el cupo del plan', b4.status === 201);
  check('reactivar la desactivada supera el tope (403)', (await call('PUT', `/branches/${b3.json.id}`, { token: biz.token, body: { active: true } })).status === 403);
  check('la lista de selectores solo trae las activas', (await call('GET', '/branches', { token: biz.token })).json.every(b => b.active));

  // --- Aislamiento ---
  check('otra empresa no puede editar una sucursal ajena (404)', (await call('PUT', `/branches/${b2.json.id}`, { token: other.token, body: { name: 'Robada' } })).status === 404);
  const otherList = (await call('GET', '/branches?all=1', { token: other.token })).json;
  check('otra empresa solo ve las suyas', otherList.every(b => b.id !== b2.json.id));
  check('el vendedor no puede crear sucursales (403)', (await call('POST', '/branches', { token: biz.sellerToken, body: { name: 'Mala' } })).status === 403);

  // --- Cajas y vendedores por sucursal ---
  const main = (await call('GET', '/branches?all=1', { token: biz.token })).json.find(b => b.isMain);
  const caja1 = await call('POST', '/terminals', { token: biz.token, body: { name: 'Caja Principal', userIds: [biz.seller.id] } });
  check('una caja nueva queda en la sucursal Principal por omisión', caja1.status === 201 && caja1.json.branchId === main.id, `${caja1.status}`);
  const caja2 = await call('POST', '/terminals', { token: biz.token, body: { name: 'Caja Santiago', branchId: b2.json.id, userIds: [biz.seller.id] } });
  check('una caja puede crearse en otra sucursal', caja2.status === 201 && caja2.json.branchId === b2.json.id);
  check('una caja no puede ir a la sucursal de otra empresa', (await call('POST', '/terminals', { token: biz.token, body: { name: 'Caja X', branchId: otherList[0].id } })).status === 400);

  const mine0 = (await call('GET', '/terminals/my', { token: biz.sellerToken })).json.terminals;
  check('un vendedor sin sucursal asignada ve las cajas de todas', mine0.length === 2);
  const assign = await call('PUT', `/auth/users/${biz.seller.id}`, { token: biz.token, body: { branchId: b2.json.id } });
  check('el administrador asigna el vendedor a una sucursal', assign.status === 200 && assign.json?.branchId === b2.json.id, `${assign.status}`);
  const mine1 = (await call('GET', '/terminals/my', { token: biz.sellerToken })).json.terminals;
  check('con sucursal asignada solo ve las cajas de esa sucursal', mine1.length === 1 && mine1[0].id === caja2.json.id, JSON.stringify(mine1.map(t => t.name)));
  const wrongOpen = await call('POST', '/cashier/open', { token: biz.sellerToken, body: { terminalId: caja1.json.id, openingBalance: 0 } });
  check('no puede abrir turno en una caja de otra sucursal (403)', wrongOpen.status === 403, String(wrongOpen.status));

  // --- Turno y venta heredan la sucursal ---
  const category = await basePrisma.category.findFirst({ where: { companyId: biz.id, name: 'General' } });
  const product = await basePrisma.product.create({ data: { companyId: biz.id, name: 'Producto sucursal', code: `ZZS${suffix}`, categoryId: category.id, salePrice: 100, costPrice: 50, stock: 20 } });
  await giveStock(basePrisma, product, b2.json.id); // el stock está en Santiago, donde está la caja
  const consumer = await basePrisma.customer.findFirst({ where: { companyId: biz.id, documentId: '000000000' } });
  const shift = await call('POST', '/cashier/open', { token: biz.sellerToken, body: { terminalId: caja2.json.id, openingBalance: 0 } });
  check('el turno abierto guarda la sucursal de la caja', shift.status === 201 && shift.json.branchId === b2.json.id, `${shift.status}`);
  const sale = await call('POST', '/sales', { token: biz.sellerToken, body: { customerId: consumer.id, terminalId: caja2.json.id, details: [{ productId: product.id, quantity: 1, discount: 0 }], discount: 0, paymentMethod: 'EFECTIVO' } });
  const saved = sale.json?.id ? await basePrisma.sale.findUnique({ where: { id: sale.json.id } }) : null;
  check('la venta guarda la sucursal de la caja', sale.status === 201 && saved?.branchId === b2.json.id, `${sale.status}`);
  check('no se puede desactivar una sucursal con turno abierto (409)', (await call('PUT', `/branches/${b2.json.id}`, { token: biz.token, body: { active: false } })).status === 409);
  check('no se puede mover de sucursal una caja con turno abierto (409)', (await call('PUT', `/terminals/${caja2.json.id}`, { token: biz.token, body: { branchId: main.id } })).status === 409);

  // --- Registro autónomo: nace con la Principal y su primera caja ya asignada ---
  const signedUp = await call('POST', '/public/signup', { body: { plan: 'FREE', account: { fullName: 'Persona Sucursal', email: `zz.suc.${suffix}@example.com`, password: 'camino por la montaña 77 verde' }, company: { name: `ZZ Sucursal registro ${suffix}`, businessType: 'Otro' }, settings: { taxRate: 0.18, paymentMethods: ['EFECTIVO'], receiptFormat: 'A4', terminalName: 'Caja 1' }, termsAccepted: true, termsVersion: (await import('@factos/shared/legal.js')).TERMS_VERSION } });
  const signupCompany = await basePrisma.company.findFirst({ where: { name: `ZZ Sucursal registro ${suffix}` } });
  if (signupCompany) companies.push(signupCompany.id);
  const signupBranch = signupCompany && (await basePrisma.branch.findFirst({ where: { companyId: signupCompany.id, isMain: true } }));
  const signupTerminal = signupCompany && (await basePrisma.terminal.findFirst({ where: { companyId: signupCompany.id } }));
  check('el registro autónomo crea la Principal y le asigna la primera caja', signedUp.status === 201 && Boolean(signupBranch) && signupTerminal?.branchId === signupBranch.id, `${signedUp.status}`);

  // --- Plan de uso al final ---
  const usage = (await call('GET', '/company/plan-usage', { token: biz.token })).json.usage.branches;
  check('el uso de sucursales cuenta solo las activas (3 de 3)', usage.current === 3 && usage.limit === 3 && usage.blocksCreation === true, JSON.stringify(usage));
} catch (err) {
  console.error('ERROR inesperado:', err);
  failed++;
} finally {
  for (const companyId of companies) {
    const users = (await basePrisma.user.findMany({ where: { companyId }, select: { id: true } })).map(u => u.id);
    await basePrisma.session.deleteMany({ where: { userId: { in: users } } });
    await basePrisma.auditLog.deleteMany({ where: { companyId } });
    await basePrisma.saleDetail.deleteMany({ where: { companyId } });
    await basePrisma.sale.deleteMany({ where: { companyId } });
    await basePrisma.cashierClose.deleteMany({ where: { companyId } });
    await basePrisma.inventoryLog.deleteMany({ where: { companyId } });
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
