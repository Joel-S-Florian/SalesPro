// Prueba de integración: usuarios con cédula y teléfono, política de contraseñas, Proveedor general y límite de intentos de login.
// Usa solo la empresa «Empresa Prueba» y deja todo como estaba. El límite de login requiere el API en http://localhost:4010.
// Uso: node --env-file=apps/api/.env scripts/test-users-suppliers.mjs
const root = new URL('../apps/api/src/', import.meta.url);
const load = p => import(new URL(p, root).href);
const { basePrisma, prisma } = await load('config/db.js');
const { runInTenant } = await load('config/tenant.js');
const auth = await load('modules/auth/auth.service.js');
const suppliers = await load('modules/suppliers/suppliers.service.js');
const inventory = await load('modules/inventory/inventory.service.js');
const { bootstrapCompany } = await load('modules/platform/bootstrap.js');

const API = process.env.TEST_API_URL || 'http://localhost:4010/api';
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

// Cédula válida (algoritmo de la JCE) para las pruebas
const cedula = base => {
  const weights = [1, 2, 1, 2, 1, 2, 1, 2, 1, 2];
  let sum = 0;
  for (let i = 0; i < 10; i++) {
    let product = Number(base[i]) * weights[i];
    if (product >= 10) product = Math.floor(product / 10) + (product % 10);
    sum += product;
  }
  return base + ((10 - (sum % 10)) % 10);
};
const CED_1 = cedula('0011234567');
const CED_2 = cedula('0017654321');

const company = await basePrisma.company.findFirst({ where: { name: 'Empresa Prueba' } });
const created = { users: [], product: null, category: null, logs: [] };
const defaultsBefore = await basePrisma.supplier.count({ where: { companyId: company.id, isDefault: true } });

await runInTenant(company.id, async () => {
  try {
    // --- Usuarios: cédula y teléfono ---
    const base = { fullName: 'ZZ Usuario Prueba', role: 'VENDEDOR', password: 'Clave-Inicial-77' };
    const u1 = await auth.createUser({ ...base, username: 'zz_user_a', documentId: CED_1.replace(/^(\d{3})(\d{7})(\d)$/, '$1-$2-$3'), phone: '809-555-0101' });
    created.users.push(u1.id);
    check('la cédula se guarda solo con dígitos y el teléfono tal cual', u1.documentId === CED_1 && u1.phone === '809-555-0101', `${u1.documentId} / ${u1.phone}`);
    await expectError('la cédula repetida en la misma empresa se rechaza', () => auth.createUser({ ...base, username: 'zz_user_b', documentId: CED_1 }), 'cédula');
    const u2 = await auth.createUser({ ...base, username: 'zz_user_c', documentId: CED_2 });
    created.users.push(u2.id);
    const edited = await auth.updateUser(u2.id, { phone: '829-555-0202', documentId: null }, u1.id);
    check('se puede editar el teléfono y quitar la cédula', edited.phone === '829-555-0202' && edited.documentId === null, JSON.stringify([edited.phone, edited.documentId]));
    await expectError('no se puede mover a una cédula ya usada', () => auth.updateUser(u2.id, { documentId: CED_1 }, u1.id), 'cédula');
    const found = await auth.getUsers({ page: 1, limit: 20, q: CED_1.slice(0, 6) });
    check('la lista encuentra por cédula', found.data.some(u => u.id === u1.id));

    // --- Contraseñas ---
    await expectError('contraseña corta rechazada al crear', () => auth.createUser({ ...base, username: 'zz_user_d', password: 'Corta1' }), 'al menos');
    await expectError('contraseña con el usuario rechazada', () => auth.createUser({ ...base, username: 'zz_user_e', password: 'zz_user_e-2024-ok' }), 'usuario');
    await expectError('contraseña común rechazada al cambiarla', () => auth.updateUser(u1.id, { password: 'Administrador99' }, u1.id), 'común');

    // --- Proveedor general ---
    await bootstrapCompany(company.id);
    await bootstrapCompany(company.id);
    const defaults = await prisma.supplier.findMany({ where: { isDefault: true } });
    check('la empresa tiene exactamente un Proveedor general (y bootstrap es idempotente)', defaults.length === 1 && defaults[0].name === 'Proveedor general', String(defaults.length));
    const general = defaults[0];
    await expectError('el Proveedor general no se puede desactivar (updateSupplier)', () => suppliers.updateSupplier(general.id, { active: false }), 'no se puede desactivar');
    await expectError('el Proveedor general no se puede desactivar (deactivateSupplier)', () => suppliers.deactivateSupplier(general.id), 'no se puede desactivar');
    const hijack = await suppliers.createSupplier({ name: 'ZZ Proveedor Prueba', isDefault: true });
    check('isDefault no se puede fijar desde la API', hijack.isDefault === false);
    await suppliers.updateSupplier(hijack.id, { isDefault: true });
    check('ni al editar', (await prisma.supplier.findMany({ where: { isDefault: true } })).length === 1);
    await basePrisma.supplier.deleteMany({ where: { id: hijack.id } });
    const list = await suppliers.getSuppliers({ page: 1, limit: 20 });
    check('el Proveedor general sale primero en la lista', list.data[0]?.isDefault === true);

    // --- Compra sin proveedor → Proveedor general ---
    const category = await prisma.category.create({ data: { name: 'ZZ-TEST-SUP' } });
    created.category = category.id;
    const product = await prisma.product.create({ data: { code: 'ZZ-SUP-1', name: 'Producto prueba proveedor', categoryId: category.id, costPrice: 10, salePrice: 20, stock: 0, minStock: 1 } });
    created.product = product.id;
    const purchase = await inventory.registerPurchase({ productId: product.id, quantity: 5, unitCost: 10 }, u1.id, 'ZZ');
    const log = await basePrisma.inventoryLog.findFirst({ where: { productId: product.id }, orderBy: { createdAt: 'desc' } });
    check('una compra sin proveedor se registra con el Proveedor general', purchase.success !== false && log?.supplierId === general.id, String(log?.supplierId));
  } catch (err) {
    console.error('ERROR inesperado:', err);
    failed++;
  }
});

// --- Límite de intentos de login (HTTP) ---
try {
  const attempt = username =>
    fetch(`${API}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password: 'incorrecta-123' }) }).then(r => r.status);
  const name = `zz_lim_${Date.now()}`;
  const statuses = [];
  for (let i = 0; i < 10; i++) statuses.push(await attempt(name));
  check('los primeros intentos fallidos responden 401', statuses.slice(0, 8).every(s => s === 401), statuses.join(','));
  check('el intento 9 del mismo usuario se bloquea (429)', statuses[8] === 429 && statuses[9] === 429, statuses.slice(8).join(','));
  check('otro usuario desde la misma conexión no queda bloqueado', (await attempt(`zz_otro_${Date.now()}`)) === 401);
} catch (err) {
  console.log('SKIP  límite de login (¿API apagado?):', err.message);
}

// Limpieza
await basePrisma.inventoryLog.deleteMany({ where: { productId: created.product || '__none__' } });
await basePrisma.session.deleteMany({ where: { userId: { in: created.users } } });
await basePrisma.auditLog.deleteMany({ where: { userId: { in: created.users } } });
await basePrisma.user.deleteMany({ where: { id: { in: created.users } } });
if (created.product) await basePrisma.product.deleteMany({ where: { id: created.product } });
if (created.category) await basePrisma.category.deleteMany({ where: { id: created.category } });
if (defaultsBefore === 0) await basePrisma.supplier.deleteMany({ where: { companyId: company.id, isDefault: true } });
await basePrisma.$disconnect();

console.log(failed ? `\n${failed} FALLO(S)` : '\nTodo en orden');
process.exit(failed ? 1 : 0);
