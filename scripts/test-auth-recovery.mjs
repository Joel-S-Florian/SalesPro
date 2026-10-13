// Prueba de integración: recuperación de contraseña, clave temporal, cierre por inactividad y aviso de solicitudes.
// Usa solo la empresa «Empresa Prueba» y deja todo como estaba.
// Uso: node --env-file=apps/api/.env scripts/test-auth-recovery.mjs
import { createHash, randomBytes } from 'node:crypto';

const root = new URL('../apps/api/src/', import.meta.url);
const load = p => import(new URL(p, root).href);
const { basePrisma } = await load('config/db.js');
const { runInTenant } = await load('config/tenant.js');
const auth = await load('modules/auth/auth.service.js');
const leads = await load('modules/leads/leads.service.js');

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
const hash = token => createHash('sha256').update(token).digest('hex');
const makeToken = async (userId, { minutes = 30, used = false } = {}) => {
  const token = randomBytes(32).toString('base64url');
  await basePrisma.passwordReset.create({ data: { userId, tokenHash: hash(token), expiresAt: new Date(Date.now() + minutes * 60000), usedAt: used ? new Date() : null } });
  return token;
};

const company = await basePrisma.company.findFirst({ where: { name: 'Empresa Prueba' } });
const admin = await basePrisma.user.findFirst({ where: { companyId: company.id, role: 'ADMINISTRADOR' } });
const securityBefore = await basePrisma.systemConfig.findUnique({ where: { companyId_key: { companyId: company.id, key: 'security' } } });
const leadsBefore = await basePrisma.lead.count();
const mailAddress = `zz.recovery.${Date.now()}@example.com`;
let userId;

try {
  await runInTenant(company.id, async () => {
    // --- Alta con correo ---
    const created = await auth.createUser({ username: 'zz_recovery', fullName: 'ZZ Recovery', role: 'VENDEDOR', password: 'Clave-Inicial1', email: mailAddress.toUpperCase() });
    userId = created.id;
    check('createUser guarda el correo en minúsculas', created.email === mailAddress, created.email);
    await expectError('correo repetido en otra cuenta se rechaza', () => auth.createUser({ username: 'zz_recovery2', fullName: 'Otro', role: 'VENDEDOR', password: 'Clave-Inicial1', email: mailAddress }), 'ya está registrado');
    await expectError('correo con forma inválida se rechaza', () => auth.updateUser(userId, { email: 'no-es-correo' }, admin.id), 'no es válido');

    // --- Solicitud de enlace ---
    await auth.forgotPassword('usuario_que_no_existe');
    check('usuario inexistente: responde sin error y no crea enlace', (await basePrisma.passwordReset.count({ where: { userId } })) === 0);
    await auth.forgotPassword('zz_recovery');
    check('con correo registrado se crea un enlace', (await basePrisma.passwordReset.count({ where: { userId } })) === 1);
    await auth.forgotPassword(mailAddress);
    await auth.forgotPassword('zz_recovery');
    await auth.forgotPassword('zz_recovery');
    check('máximo 3 enlaces por hora', (await basePrisma.passwordReset.count({ where: { userId } })) === 3);
    const open = await basePrisma.passwordReset.count({ where: { userId, usedAt: null } });
    check('al pedir uno nuevo, los anteriores quedan inválidos (solo 1 vigente)', open === 1, String(open));
    await basePrisma.passwordReset.deleteMany({ where: { userId } });

    // --- Restablecer ---
    await auth.login('zz_recovery', 'Clave-Inicial1');
    check('hay una sesión abierta antes de restablecer', (await basePrisma.session.count({ where: { userId } })) === 1);
    const token = await makeToken(userId);
    await auth.resetPassword(token, 'Clave-Nueva-2');
    const afterLogin = await auth.login('zz_recovery', 'Clave-Nueva-2');
    check('la contraseña nueva funciona', Boolean(afterLogin.accessToken));
    await expectError('la contraseña vieja ya no funciona', () => auth.login('zz_recovery', 'Clave-Inicial1'), 'Credenciales');
    check('restablecer cierra las sesiones anteriores (queda solo la nueva)', (await basePrisma.session.count({ where: { userId } })) === 1);
    await expectError('un enlace no se puede usar dos veces', () => auth.resetPassword(token, 'Otra-Clave-3'), 'no es válido');
    await expectError('enlace vencido se rechaza', async () => auth.resetPassword(await makeToken(userId, { minutes: -1 }), 'Otra-Clave-3'), 'no es válido');
    await expectError('enlace inventado se rechaza', () => auth.resetPassword('x'.repeat(43), 'Otra-Clave-3'), 'no es válido');
    const raw = await basePrisma.passwordReset.findMany({ where: { userId } });
    check('solo se guarda el hash del enlace, nunca el enlace', raw.every(r => r.tokenHash.length === 64));

    // --- Clave temporal ---
    const own = await auth.updateUser(userId, { password: 'Propia-Clave-4' }, userId);
    check('cambiar la propia clave no la marca temporal', own.mustChangePassword === false);
    const temp = await auth.updateUser(userId, { password: 'Temporal-Clave-5' }, admin.id);
    check('clave asignada por un administrador es temporal', temp.mustChangePassword === true);
    const tempLogin = await auth.login('zz_recovery', 'Temporal-Clave-5');
    check('el login avisa que debe cambiarla', tempLogin.user.mustChangePassword === true);
    await auth.changePassword(userId, 'Temporal-Clave-5', 'Definitiva-Clave-6');
    const finalLogin = await auth.login('zz_recovery', 'Definitiva-Clave-6');
    check('al cambiarla deja de ser temporal', finalLogin.user.mustChangePassword === false);

    // --- Cierre por inactividad (servidor) ---
    const session = await auth.login('zz_recovery', 'Definitiva-Clave-6');
    const touchSession = minutesAgo => basePrisma.session.updateMany({ where: { token: session.refreshToken }, data: { lastActivityAt: new Date(Date.now() - minutesAgo * 60000) } });
    await touchSession(10);
    const renewed = await auth.refreshTokens(session.refreshToken);
    check('sesión con actividad reciente se renueva', Boolean(renewed.accessToken));
    await basePrisma.session.updateMany({ where: { token: renewed.refreshToken }, data: { lastActivityAt: new Date(Date.now() - 90 * 60000) } });
    await expectError('sesión abandonada (90 min) no se renueva', () => auth.refreshTokens(renewed.refreshToken), 'inactividad');
    check('la sesión abandonada se elimina', (await basePrisma.session.count({ where: { token: renewed.refreshToken } })) === 0);

    await basePrisma.systemConfig.upsert({ where: { companyId_key: { companyId: company.id, key: 'security' } }, create: { companyId: company.id, key: 'security', value: { idleTimeoutMinutes: 0 } }, update: { value: { idleTimeoutMinutes: 0 } } });
    const never = await auth.login('zz_recovery', 'Definitiva-Clave-6');
    await basePrisma.session.updateMany({ where: { token: never.refreshToken }, data: { lastActivityAt: new Date(Date.now() - 600 * 60000) } });
    check('con el límite en 0 nunca se cierra por inactividad', Boolean((await auth.refreshTokens(never.refreshToken)).accessToken));
    await basePrisma.systemConfig.update({ where: { companyId_key: { companyId: company.id, key: 'security' } }, data: { value: { idleTimeoutMinutes: 5 } } });
    const short = await auth.login('zz_recovery', 'Definitiva-Clave-6');
    await basePrisma.session.updateMany({ where: { token: short.refreshToken }, data: { lastActivityAt: new Date(Date.now() - 25 * 60000) } });
    await expectError('con límite de 5 min, 25 min sin actividad cierra', () => auth.refreshTokens(short.refreshToken), 'inactividad');
  });

  // --- Solicitud de la landing (sin SMTP no debe fallar) ---
  const lead = await leads.createLead({ name: 'ZZ Persona', business: 'ZZ Negocio', businessType: 'Colmado', contact: 'zz@example.com', note: 'prueba' }, '127.0.0.1');
  check('la solicitud de la landing se guarda aunque no haya correo configurado', Boolean(lead.id));
  await basePrisma.lead.delete({ where: { id: lead.id } });
} catch (err) {
  console.error('ERROR inesperado:', err);
  failed++;
} finally {
  if (userId) {
    await basePrisma.passwordReset.deleteMany({ where: { userId } });
    await basePrisma.session.deleteMany({ where: { userId } });
    await basePrisma.auditLog.deleteMany({ where: { userId } });
    await basePrisma.user.deleteMany({ where: { id: userId } });
  }
  await basePrisma.user.deleteMany({ where: { username: 'zz_recovery2' } });
  if (securityBefore) await basePrisma.systemConfig.update({ where: { companyId_key: { companyId: company.id, key: 'security' } }, data: { value: securityBefore.value } });
  else await basePrisma.systemConfig.deleteMany({ where: { companyId: company.id, key: 'security' } });
  check('limpieza: sin solicitudes sobrantes', (await basePrisma.lead.count()) === leadsBefore);
  await basePrisma.$disconnect();
}

console.log(failed ? `\n${failed} FALLO(S)` : '\nTodo en orden');
process.exit(failed ? 1 : 0);
