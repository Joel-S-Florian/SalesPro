// Prueba de aislamiento multi-empresa contra una API en ejecución.
//
//   API_URL=http://localhost:4010/api node scripts/test-tenant-isolation.mjs
//
// Variables: SUPERADMIN_USER / SUPERADMIN_PASSWORD (por defecto superadmin/superadmin).
// Crea dos empresas "ZZTEST ..." con datos de prueba y las elimina al terminar (usa DATABASE_URL).
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const API = process.env.API_URL || 'http://localhost:4010/api';
const SUPER = {
  username: process.env.SUPERADMIN_USER || 'superadmin',
  password: process.env.SUPERADMIN_PASSWORD || 'superadmin',
};
const stamp = Date.now().toString(36);

let passed = 0;
let failed = 0;
const check = (label, condition, extra = '') => {
  if (condition) passed += 1;
  else failed += 1;
  console.log(`${condition ? '  ✓' : '  ✗ FALLÓ'} ${label}${condition ? '' : ` ${extra}`}`);
};

async function call(method, path, token, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    // sin cuerpo
  }
  return { status: res.status, data };
}

const login = async (username, password) => {
  const res = await call('POST', '/auth/login', null, { username, password });
  return { ...res, token: res.data?.accessToken };
};
const list = r => (Array.isArray(r.data) ? r.data : r.data?.data || []);

async function setupCompany(superToken, label) {
  const admin = { username: `zz${label}${stamp}`, password: 'Prueba1234', fullName: `Admin ${label}` };
  const created = await call('POST', '/platform/companies', superToken, {
    name: `ZZTEST ${label} ${stamp}`,
    admin,
  });
  check(`Super-admin crea la empresa ${label}`, created.status === 201, JSON.stringify(created.data));
  const session = await login(admin.username, admin.password);
  check(`Admin de ${label} inicia sesión`, !!session.token);
  return { id: created.data?.id, admin, token: session.token };
}

async function seedData(company, label) {
  const { token } = company;
  const category = await call('POST', '/categories', token, { name: 'Categoría compartida', description: label });
  const product = await call('POST', '/products', token, {
    code: 'SHARED-001',
    name: `Producto ${label}`,
    categoryId: category.data?.id,
    costPrice: 10,
    salePrice: 20,
    stock: 50,
    minStock: 1,
  });
  const customer = await call('POST', '/customers', token, { documentId: '000000000', name: `Cliente ${label}` });
  check(`${label}: crea categoría/producto/cliente con los mismos códigos que la otra empresa`,
    category.status === 201 && product.status === 201 && customer.status === 201,
    JSON.stringify([category.data, product.data, customer.data]));
  const sale = await call('POST', '/sales', token, {
    customerId: customer.data?.id,
    details: [{ productId: product.data?.id, quantity: 2 }],
  });
  check(`${label}: registra una venta`, sale.status === 201, JSON.stringify(sale.data));
  return { category: category.data, product: product.data, customer: customer.data, sale: sale.data };
}

async function cleanup() {
  const prisma = new PrismaClient();
  try {
    const companies = await prisma.company.findMany({ where: { name: { startsWith: 'ZZTEST' } }, select: { id: true } });
    for (const { id: companyId } of companies) {
      const where = { companyId };
      await prisma.auditLog.deleteMany({ where });
      await prisma.saleDetail.deleteMany({ where });
      await prisma.sale.deleteMany({ where });
      await prisma.inventoryLog.deleteMany({ where });
      await prisma.cashierClose.deleteMany({ where });
      await prisma.terminal.deleteMany({ where });
      await prisma.inventoryImport.deleteMany({ where });
      await prisma.product.deleteMany({ where });
      await prisma.category.deleteMany({ where });
      await prisma.customer.deleteMany({ where });
      await prisma.supplier.deleteMany({ where });
      await prisma.nCFSequence.deleteMany({ where });
      await prisma.systemConfig.deleteMany({ where });
      await prisma.session.deleteMany({ where: { user: { companyId } } });
      await prisma.user.deleteMany({ where });
      await prisma.company.delete({ where: { id: companyId } });
    }
    console.log(`\nLimpieza: ${companies.length} empresas de prueba eliminadas`);
  } finally {
    await prisma.$disconnect();
  }
}

async function main() {
  console.log(`API: ${API}\n`);
  const superLogin = await login(SUPER.username, SUPER.password);
  if (!superLogin.token) throw new Error(`No se pudo iniciar sesión como super-admin (${superLogin.status})`);
  const st = superLogin.token;

  console.log('Preparación');
  const A = await setupCompany(st, 'A');
  const B = await setupCompany(st, 'B');
  const dataA = await seedData(A, 'A');
  const dataB = await seedData(B, 'B');

  console.log('\nAislamiento de lectura');
  const productsA = list(await call('GET', '/products?limit=100', A.token));
  const productsB = list(await call('GET', '/products?limit=100', B.token));
  check('A solo ve sus productos', productsA.length === 1 && productsA[0].id === dataA.product.id, JSON.stringify(productsA.map(p => p.name)));
  check('B solo ve sus productos', productsB.length === 1 && productsB[0].id === dataB.product.id);
  check('A solo ve sus ventas', list(await call('GET', '/sales', A.token)).every(s => s.id === dataA.sale.id));
  check('A solo ve sus clientes', list(await call('GET', '/customers', A.token)).every(c => c.id === dataA.customer.id));
  check('A solo ve sus categorías', list(await call('GET', '/categories', A.token)).every(c => c.id === dataA.category.id));
  check('Las secuencias NCF son independientes por empresa', dataA.sale.invoiceNumber === dataB.sale.invoiceNumber,
    `${dataA.sale.invoiceNumber} vs ${dataB.sale.invoiceNumber}`);
  const usersA = list(await call('GET', '/auth/users', A.token));
  check('A solo ve a sus propios usuarios', usersA.length === 1 && usersA[0].username === A.admin.username.toLowerCase());

  console.log('\nAcceso cruzado por id');
  check('B no puede leer un producto de A', (await call('GET', `/products/${dataA.product.id}`, B.token)).status === 404);
  check('B no puede leer una venta de A', [403, 404].includes((await call('GET', `/sales/${dataA.sale.id}`, B.token)).status));
  check('B no puede modificar un producto de A', (await call('PUT', `/products/${dataA.product.id}`, B.token, { name: 'hack' })).status === 404);
  check('B no puede eliminar un cliente de A', (await call('DELETE', `/customers/${dataA.customer.id}`, B.token)).status === 404);
  const cross = await call('POST', '/sales', B.token, {
    customerId: dataA.customer.id,
    details: [{ productId: dataB.product.id, quantity: 1 }],
  });
  check('B no puede vender a un cliente de A', cross.status === 404, JSON.stringify(cross.data));
  const cross2 = await call('POST', '/sales', B.token, {
    customerId: dataB.customer.id,
    details: [{ productId: dataA.product.id, quantity: 1 }],
  });
  check('B no puede vender un producto de A', cross2.status === 404, JSON.stringify(cross2.data));
  const stillA = await call('GET', `/products/${dataA.product.id}`, A.token);
  check('El producto de A sigue intacto', stillA.data?.name === 'Producto A' && stillA.data?.stock === 48);

  console.log('\nConfiguración independiente');
  await call('PUT', '/config', A.token, { taxRate: 0.05 });
  check('Cambiar el ITBIS de A no afecta a B', (await call('GET', '/config', B.token)).data?.taxRate === 0.18);

  console.log('\nRoles de plataforma');
  check('Un administrador de empresa no puede usar /platform', (await call('GET', '/platform/companies', A.token)).status === 403);
  check('El super-admin no puede operar datos de empresa', (await call('GET', '/products', st)).status === 403);
  const listed = (await call('GET', '/platform/companies?q=ZZTEST', st)).data || [];
  check('El super-admin ve ambas empresas con sus conteos', listed.length >= 2 && listed.every(c => c._count?.users === 1));

  console.log('\nSuspensión');
  const suspended = await call('PUT', `/platform/companies/${A.id}`, st, { active: false });
  check('El super-admin suspende la empresa A', suspended.status === 200 && suspended.data?.active === false);
  check('Los usuarios de A quedan bloqueados de inmediato', (await call('GET', '/products', A.token)).status === 403);
  check('A no puede volver a iniciar sesión', (await login(A.admin.username, A.admin.password)).status === 403);
  check('B no se ve afectada', (await call('GET', '/products', B.token)).status === 200);
}

let exitCode = 0;
try {
  await main();
} catch (error) {
  console.error('\nError inesperado:', error.message);
  exitCode = 1;
} finally {
  await cleanup();
}
console.log(`\nResultado: ${passed} correctas, ${failed} fallidas`);
process.exit(exitCode || (failed ? 1 : 0));
