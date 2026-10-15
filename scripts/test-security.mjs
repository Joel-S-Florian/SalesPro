// Prueba de seguridad de acceso: claves temporales generadas por el servidor (una sola vez, 48 h), política de contraseñas por rol,
// bloqueo progresivo de inicios de sesión (sin revelar si el usuario existe), auditoría sin secretos y arranque en producción.
// Usa el API en http://localhost:4010 (o TEST_API_URL) y una empresa de prueba «ZZ Sec» que borra al terminar.
// Uso: node --env-file=apps/api/.env scripts/test-security.mjs
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { TERMS_VERSION } from '../packages/shared/legal.js';

const root = new URL('../apps/api/src/', import.meta.url);
const load = p => import(new URL(p, root).href);
const { basePrisma } = await load('config/db.js');
const { hashPassword } = await load('shared/utils/crypto.js');
const { findDevSuperadmins } = await load('shared/utils/startupChecks.js');
const platform = await load('modules/platform/platform.service.js');

const API = process.env.TEST_API_URL || 'http://127.0.0.1:4010/api';
const ADMIN_PASSWORD = 'Clave-Admin-Segura-1';
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
  return { status: res.status, json, text: JSON.stringify(json) };
};
const login = (username, password) => call('POST', '/auth/login', { body: { username, password } });

const created = { companies: [], users: [] };
const suffix = String(Date.now() % 1e6);
const company = await basePrisma.company.create({ data: { name: 'ZZ Sec Colmado Aurora', plan: 'BUSINESS' } });
created.companies.push(company.id);
const adminName = `zz_sec_admin_${suffix}`;
const admin = await basePrisma.user.create({ data: { companyId: company.id, username: adminName, fullName: 'Admin Sec', role: 'ADMINISTRADOR', passwordHash: await hashPassword(ADMIN_PASSWORD) } });

try {
  const adminLogin = await login(adminName, ADMIN_PASSWORD);
  check('el administrador de prueba inicia sesión', adminLogin.status === 200 && adminLogin.json.accessToken, String(adminLogin.status));
  const token = adminLogin.json?.accessToken;

  // --- Compatibilidad: un hash antiguo (bcryptjs, 12 rondas) sigue sirviendo con bcrypt nativo, y se rebaja a las rondas actuales ---
  const bcryptjs = createRequire(new URL('../apps/api/package.json', import.meta.url))('bcryptjs');
  const oldName = `zz_sec_old_${suffix}`;
  const oldHash = bcryptjs.hashSync('Clave-Antigua-Segura-1', 12);
  const oldUser = await basePrisma.user.create({ data: { companyId: company.id, username: oldName, fullName: 'Hash Antiguo', role: 'VENDEDOR', passwordHash: oldHash } });
  const oldLogin = await login(oldName, 'Clave-Antigua-Segura-1');
  check('un hash antiguo de bcryptjs (12 rondas) sigue funcionando con bcrypt nativo', oldHash.startsWith('$2') && oldLogin.status === 200, String(oldLogin.status));
  const rehashed = await basePrisma.user.findUnique({ where: { id: oldUser.id } });
  check('al entrar se rehace con las rondas actuales (11) y la clave sigue sirviendo', rehashed.passwordHash !== oldHash && bcryptjs.getRounds(rehashed.passwordHash) === 11 && (await login(oldName, 'Clave-Antigua-Segura-1')).status === 200, String(bcryptjs.getRounds(rehashed.passwordHash)));
  check('una clave incorrecta con un hash antiguo se rechaza', (await login(oldName, 'otra-clave-cualquiera-9')).status === 401);

  // --- Crear usuario: la clave temporal la genera el servidor ---
  const u1Name = `zz_sec_u1_${suffix}`;
  const created1 = await call('POST', '/auth/users', { token, body: { username: u1Name, fullName: 'Usuario Uno', role: 'VENDEDOR', password: 'Clave-Manual-9999-x' } });
  const temp1 = created1.json?.temporaryPassword;
  check('crear usuario devuelve una clave temporal de 14 caracteres', created1.status === 201 && /^[A-Za-z0-9]{4}-[A-Za-z0-9]{4}-[A-Za-z0-9]{4}$/.test(temp1 || ''), temp1);
  check('la clave que escribió el cliente se ignora (la API ya no la recibe)', (await login(u1Name, 'Clave-Manual-9999-x')).status === 401);
  const row1 = await basePrisma.user.findUnique({ where: { username: u1Name } });
  created.users.push(row1.id);
  const hours = (row1.tempPasswordExpiresAt - Date.now()) / 3600000;
  check('queda marcada como temporal: obliga a cambiarla y caduca en 48 horas', row1.mustChangePassword === true && hours > 47.9 && hours <= 48.01, `${hours.toFixed(2)} h`);
  check('el servidor solo guarda el hash (nunca la clave)', row1.passwordHash.startsWith('$2') && !row1.passwordHash.includes(temp1));

  // --- La auditoría no guarda la clave ---
  const audits = await basePrisma.auditLog.findMany({ where: { companyId: company.id } });
  const auditText = JSON.stringify(audits);
  check('la auditoría de la creación NO contiene la clave temporal', audits.some(a => a.action === 'CREATE_USER') && !auditText.includes(temp1) && auditText.includes('[oculto]'));

  // --- Entrar con la clave temporal ---
  const tempLogin = await login(u1Name, temp1);
  check('con la clave temporal se entra y se pide cambiarla', tempLogin.status === 200 && tempLogin.json.user.mustChangePassword === true);

  // --- Caducidad de 48 horas ---
  await basePrisma.user.update({ where: { id: row1.id }, data: { tempPasswordExpiresAt: new Date(Date.now() - 1000) } });
  const expired = await login(u1Name, temp1);
  check('pasadas las 48 horas la clave temporal ya no sirve (TEMP_PASSWORD_EXPIRED)', expired.status === 401 && expired.json.code === 'TEMP_PASSWORD_EXPIRED', expired.json?.error);

  // --- Restablecer: otra clave temporal ---
  const reset = await call('POST', `/auth/users/${row1.id}/reset-password`, { token });
  const temp2 = reset.json?.temporaryPassword;
  check('restablecer genera otra clave temporal distinta', reset.status === 200 && temp2 && temp2 !== temp1, temp2);
  check('la clave anterior deja de servir y la nueva sirve', (await login(u1Name, temp1)).status === 401 && (await login(u1Name, temp2)).status === 200);
  check('el administrador no puede restablecer su propia clave por esa vía', (await call('POST', `/auth/users/${admin.id}/reset-password`, { token })).status === 400);
  check('la auditoría del restablecimiento tampoco guarda la clave', !JSON.stringify(await basePrisma.auditLog.findMany({ where: { companyId: company.id } })).includes(temp2));

  // --- Política al cambiar la propia clave ---
  const u1Token = (await login(u1Name, temp2)).json.accessToken;
  const change = (oldPassword, newPassword, tk = u1Token) => call('PUT', '/auth/password', { token: tk, body: { oldPassword, newPassword } });
  const rejected = async pw => [400, 422].includes((await change(temp2, pw)).status);
  check('una clave de 9 caracteres se rechaza (mínimo 10)', await rejected('nueve-abc'));
  check('una clave común se rechaza', await rejected('Contrasena12345'));
  check('una clave con el nombre de la empresa se rechaza', await rejected('aurora-brillante-77'));
  check('una clave con «factos» se rechaza', await rejected('mi-factos-secreto-1'));
  const ok = await change(temp2, 'camino bajo la lluvia');
  check('una frase larga sin números sirve', ok.status === 200);
  const rowAfter = await basePrisma.user.findUnique({ where: { id: row1.id } });
  check('al cambiarla se quita la marca de temporal', rowAfter.mustChangePassword === false && rowAfter.tempPasswordExpiresAt === null);
  const adminToken = token;
  const adminShort = await change(ADMIN_PASSWORD, 'once cafes!', adminToken);
  check('un ADMINISTRADOR necesita 12 caracteres (11 se rechaza)', adminShort.status === 400 && /12 caracteres/.test(adminShort.text), adminShort.json?.error);
  check('y con 12 sí puede', (await change(ADMIN_PASSWORD, 'doce cafes!!', adminToken)).status === 200);

  // --- Bloqueo progresivo ---
  const lockName = u1Name;
  const statuses = [];
  for (let i = 0; i < 7; i++) statuses.push((await login(lockName, `incorrecta-${i}-xyz`)).status);
  check('5 fallos seguidos bloquean la cuenta: el 6.º intento responde 429', statuses.slice(0, 5).every(s => s === 401) && statuses[5] === 429 && statuses[6] === 429, statuses.join(','));
  const lockedRight = await login(lockName, 'camino bajo la lluvia');
  check('estando bloqueada, ni la clave correcta entra (no es permanente: dura 15 minutos)', lockedRight.status === 429 && lockedRight.json.code === 'LOGIN_LOCKED' && lockedRight.json.retryAfterSeconds > 800 && lockedRight.json.retryAfterSeconds <= 900, String(lockedRight.json?.retryAfterSeconds));
  const ghost = `zz_fantasma_${suffix}`;
  const ghostStatuses = [];
  for (let i = 0; i < 6; i++) ghostStatuses.push(await login(ghost, 'incorrecta-123-abc'));
  check('un usuario que NO existe se comporta igual (401 y a la 6.ª, 429): no revela si existe', ghostStatuses.slice(0, 5).every(r => r.status === 401) && ghostStatuses[5].status === 429);
  check('el mensaje del bloqueo es idéntico para un usuario real y uno inexistente', lockedRight.json.error === ghostStatuses[5].json.error);
  check('otro usuario no queda bloqueado', (await login(adminName, 'doce cafes!!')).status === 200);
  await new Promise(resolve => setTimeout(resolve, 300));
  const lockAudit = await basePrisma.auditLog.findMany({ where: { companyId: company.id, action: 'LOGIN_LOCKED' } });
  check('el bloqueo queda en la auditoría de la empresa', lockAudit.length === 1 && lockAudit[0].newData.scope === 'account' && lockAudit[0].newData.lockedMinutes === 15);

  // --- Registro autónomo: política del administrador (12) con correo y empresa ---
  const signup = password => ({
    plan: 'FREE',
    account: { fullName: 'Persona Prueba', email: `zz.sec.${suffix}@example.com`, password },
    company: { name: 'Ferretería La Esperanza', businessType: 'Otro' },
    settings: { taxRate: 0.18, paymentMethods: ['EFECTIVO'], receiptFormat: 'A4', terminalName: 'Caja 1' },
    termsAccepted: true,
    termsVersion: TERMS_VERSION,
  });
  for (const [label, password, expect] of [
    ['11 caracteres (el administrador necesita 12)', 'once cafes!', /12 caracteres/],
    ['una clave común', 'Contrasena12345', /común/],
    ['con su correo', 'zz.sec.' + suffix + '-hola', /correo/],
    ['con el nombre de su empresa', 'esperanza-del-barrio-9', /empresa/],
  ]) {
    const res = await call('POST', '/public/signup', { body: signup(password) });
    check(`registro: se rechaza ${label}`, res.status === 422 && expect.test(res.text), `${res.status} ${JSON.stringify(res.json?.details?.[0]?.message || res.json?.error)}`);
  }

  // --- Registro: aceptación de los términos ---
  const noTerms = await call('POST', '/public/signup', { body: { ...signup('camino por la montaña 77'), termsAccepted: false } });
  check('registro: sin aceptar los términos se rechaza', noTerms.status === 422 && /términos/.test(noTerms.text), String(noTerms.status));
  const oldTerms = await call('POST', '/public/signup', { body: { ...signup('camino por la montaña 77'), termsVersion: 'version-vieja' } });
  check('registro: una versión de términos que ya no es la vigente se rechaza', oldTerms.status === 400 && /cambiaron/.test(oldTerms.text), String(oldTerms.status));
  const good = await call('POST', '/public/signup', { body: signup('camino por la montaña 77') });
  check('registro: con términos aceptados y una buena contraseña se crea la cuenta', good.status === 201, String(good.status));
  const signedUser = await basePrisma.user.findUnique({ where: { username: `zz.sec.${suffix}@example.com` } });
  if (signedUser) created.companies.push(signedUser.companyId);
  const signedCompany = signedUser && (await basePrisma.company.findUnique({ where: { id: signedUser.companyId } }));
  check('registro: se guarda la aceptación con su fecha y versión', signedCompany?.termsVersion === TERMS_VERSION && Math.abs(Date.now() - signedCompany.termsAcceptedAt) < 60000, `${signedCompany?.termsVersion}`);

  // --- Plataforma: clave temporal del primer administrador y restablecimiento ---
  const made = await platform.createCompany({ name: 'ZZ Sec Plataforma', admin: { fullName: 'Primer Admin', username: `zz_sec_pa_${suffix}` } });
  created.companies.push(made.id);
  check('crear una empresa devuelve la clave temporal del primer administrador (una vez)', /^[A-Za-z0-9]{4}-[A-Za-z0-9]{4}-[A-Za-z0-9]{4}$/.test(made.adminTemporaryPassword || ''));
  check('ese primer administrador entra con ella y debe cambiarla', (await login(made.adminUsername, made.adminTemporaryPassword)).json?.user?.mustChangePassword === true);
  const paId = (await basePrisma.user.findUnique({ where: { username: made.adminUsername } })).id;
  const platformReset = await platform.resetCompanyUserPassword(made.id, paId);
  check('el super-administrador restablece con una clave generada (no escribe la clave)', platformReset.temporaryPassword && platformReset.temporaryPassword !== made.adminTemporaryPassword && (await login(made.adminUsername, platformReset.temporaryPassword)).status === 200);

  // --- Arranque en producción con la clave de desarrollo ---
  const saName = `zz_sa_${suffix}`;
  const sa = await basePrisma.user.create({ data: { username: saName, fullName: 'SA Prueba', role: 'SUPERADMIN', passwordHash: await hashPassword('superadmin') } });
  created.users.push(sa.id);
  check('se detecta un SUPERADMIN con la contraseña de desarrollo', (await findDevSuperadmins()).includes(saName));
  const apiDir = fileURLToPath(new URL('../apps/api/', import.meta.url));
  const out = await new Promise(resolve => {
    let log = '';
    const child = spawn(process.execPath, ['src/server.js'], { cwd: apiDir, env: { ...process.env, NODE_ENV: 'production', PORT: '4092' }, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.on('data', d => (log += d));
    child.stderr.on('data', d => (log += d));
    const timer = setTimeout(() => {
      child.kill();
      resolve({ code: 'timeout', log });
    }, 25000);
    child.on('exit', code => {
      clearTimeout(timer);
      resolve({ code, log });
    });
  });
  check('en producción el API se niega a iniciar (código 1) con un mensaje claro', out.code === 1 && /ARRANQUE CANCELADO/.test(out.log) && out.log.includes(saName), `salida ${out.code}`);
  await basePrisma.user.delete({ where: { id: sa.id } });
  created.users.pop();
} catch (err) {
  console.error('ERROR inesperado:', err);
  failed++;
} finally {
  for (const companyId of created.companies) {
    const users = (await basePrisma.user.findMany({ where: { companyId }, select: { id: true } })).map(u => u.id);
    await basePrisma.session.deleteMany({ where: { userId: { in: users } } });
    await basePrisma.auditLog.deleteMany({ where: { companyId } });
    await basePrisma.exportJob.deleteMany({ where: { companyId } });
    await basePrisma.nCFSequence.deleteMany({ where: { companyId } });
    await basePrisma.supplier.deleteMany({ where: { companyId } });
    await basePrisma.customer.deleteMany({ where: { companyId } });
    await basePrisma.category.deleteMany({ where: { companyId } });
    await basePrisma.systemConfig.deleteMany({ where: { companyId } });
    await basePrisma.user.deleteMany({ where: { companyId } });
    await basePrisma.company.delete({ where: { id: companyId } }).catch(e => console.log('limpieza:', e.message.split('\n').pop()));
  }
  await basePrisma.user.deleteMany({ where: { id: { in: created.users } } });
  await basePrisma.$disconnect();
}

console.log(failed ? `\n${failed} FALLO(S)` : '\nTodo en orden');
process.exit(failed ? 1 : 0);
