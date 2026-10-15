// Crea (si no existe) la empresa de prueba del plan Gratis con un administrador y un vendedor, y muestra qué usuarios
// de prueba hay por plan. Es idempotente. Los datos QUEDAN en la base de desarrollo, para entrar a probar.
//
//   node --env-file=apps/api/.env scripts/seed-test-companies.mjs
const root = new URL('../apps/api/src/', import.meta.url);
const load = p => import(new URL(p, root).href);
const { basePrisma } = await load('config/db.js');
const { hashPassword } = await load('shared/utils/crypto.js');
const { createCompany } = await load('modules/platform/platform.service.js');

const PASSWORD = 'Factos-Prueba-2026!';
const NAME = 'Empresa Gratis';
const ADMIN = 'gratis@prueba.factos';
const SELLER = 'vendedor.gratis@prueba.factos';

let company = await basePrisma.company.findFirst({ where: { name: NAME } });
if (!company) {
  await createCompany({ name: NAME, email: ADMIN, plan: 'FREE', admin: { username: ADMIN, fullName: 'Administrador Gratis', password: PASSWORD } });
  company = await basePrisma.company.findFirst({ where: { name: NAME } });
  console.log(`Creada ${NAME} (${company.id})`);
}
if (company.plan !== 'FREE' || company.trialEndsAt) {
  company = await basePrisma.company.update({ where: { id: company.id }, data: { plan: 'FREE', trialEndsAt: null } });
}
if (!(await basePrisma.user.findUnique({ where: { username: SELLER } }))) {
  await basePrisma.user.create({ data: { companyId: company.id, username: SELLER, fullName: 'Vendedor Gratis', passwordHash: await hashPassword(PASSWORD), role: 'VENDEDOR' } });
  console.log('Creado el vendedor de la empresa gratis');
}

const companies = await basePrisma.company.findMany({ orderBy: { createdAt: 'asc' }, select: { name: true, plan: true, users: { select: { username: true, role: true }, orderBy: { createdAt: 'asc' } } } });
console.log('\nEmpresas y usuarios de prueba:');
for (const c of companies) console.log(`- ${c.name} [${c.plan}]: ${c.users.map(u => `${u.username} (${u.role})`).join(', ')}`);
console.log(`\nClave de ${ADMIN} y ${SELLER}: ${PASSWORD}`);
await basePrisma.$disconnect();
