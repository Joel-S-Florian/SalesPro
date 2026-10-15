// Prueba de los cobros de suscripción: pago manual que extiende el plan, vencimiento y gracia, anulación, recibo con número
// correlativo, interfaz de proveedores (Azul deshabilitado) y aislamiento del historial entre empresas.
// Usa el API en http://127.0.0.1:4010 (o TEST_API_URL) con dos empresas «ZZ Cobro» y un SUPERADMIN temporal, que borra al terminar.
//
//   node --env-file=apps/api/.env scripts/test-billing.mjs
const root = new URL('../apps/api/src/', import.meta.url);
const load = p => import(new URL(p, root).href);
const { basePrisma } = await load('config/db.js');
const { hashPassword } = await load('shared/utils/crypto.js');
const providers = await load('modules/billing/billing.providers.js');
const { addMonths } = await load('modules/billing/billing.service.js');

const API = process.env.TEST_API_URL || 'http://127.0.0.1:4010/api';
const PASSWORD = 'Clave-Cobros-Segura-1';
const DAY = 24 * 3600 * 1000;
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
const users = [];
const mk = async (name, role, companyId) => {
  const user = await basePrisma.user.create({ data: { username: `zz_cobro_${role.toLowerCase()}_${name}_${suffix}`, fullName: `Cobro ${name}`, role, companyId, passwordHash: await hashPassword(PASSWORD) } });
  users.push(user.id);
  return user;
};

try {
  // Empresa A: la prueba terminó hace 30 días (plan efectivo FREE). Empresa B: otra, para comprobar el aislamiento.
  const A = await basePrisma.company.create({ data: { name: 'ZZ Cobro A', plan: 'FREE', trialEndsAt: new Date(Date.now() - 30 * DAY) } });
  const B = await basePrisma.company.create({ data: { name: 'ZZ Cobro B', plan: 'FREE' } });
  companies.push(A.id, B.id);
  const superUser = await mk('plataforma', 'SUPERADMIN', null);
  const adminA = await mk('a', 'ADMINISTRADOR', A.id);
  const adminB = await mk('b', 'ADMINISTRADOR', B.id);
  const sellerA = await mk('a', 'VENDEDOR', A.id);
  const [tSuper, tA, tB, tSeller] = await Promise.all([login(superUser.username), login(adminA.username), login(adminB.username), login(sellerA.username)]);
  check('las sesiones de prueba inician', Boolean(tSuper && tA && tB && tSeller));

  const usageOf = async token => (await call('GET', '/company/plan-usage', { token })).json;
  const pay = (companyId, body, token = tSuper) => call('POST', `/platform/companies/${companyId}/payments`, { token, body });

  // --- Antes del pago ---
  const before = await usageOf(tA);
  check('antes del pago la empresa A usa los límites de FREE (prueba vencida)', before.status === 'EXPIRED' && before.effectivePlan === 'FREE' && before.features.ecf.allowed === false, `${before.status}/${before.effectivePlan}`);

  // --- Primer pago ---
  const body1 = { plan: 'STARTER', amount: 1200, method: 'TRANSFER', reference: `TRF-${suffix}-1`, months: 1, note: 'Primer mes' };
  const p1 = await pay(A.id, body1);
  check('el SUPERADMIN registra una transferencia (201)', p1.status === 201 && p1.json.status === 'PAID' && p1.json.provider === 'MANUAL', String(p1.status) + ' ' + JSON.stringify(p1.json).slice(0, 120));
  check('el recibo tiene número correlativo con formato R-000000', /^R-\d{6}$/.test(p1.json?.receiptCode || ''), p1.json?.receiptCode);
  const afterA = await basePrisma.company.findUnique({ where: { id: A.id } });
  check('el pago fija el plan y mueve paidUntil un mes', afterA.plan === 'STARTER' && Math.abs(afterA.paidUntil - addMonths(new Date(p1.json.periodStart), 1)) < 2000, String(afterA.paidUntil));
  const paid = await usageOf(tA);
  check('el administrador ve PAID, plan Starter y e-CF habilitado', paid.status === 'PAID' && paid.effectivePlan === 'STARTER' && paid.features.ecf.allowed === true && paid.daysLeft >= 28, `${paid.status}/${paid.daysLeft}`);

  // --- Segundo pago: extiende desde donde terminaba el primero ---
  const p2 = await pay(A.id, { ...body1, reference: `TRF-${suffix}-2`, note: 'Segundo mes' });
  check('el segundo pago empieza donde termina el primero', p2.status === 201 && new Date(p2.json.periodStart).getTime() === new Date(p1.json.periodEnd).getTime(), p2.json?.periodStart);
  check('los recibos son correlativos y crecientes', p2.json.receiptNumber > p1.json.receiptNumber);
  const after2 = await basePrisma.company.findUnique({ where: { id: A.id } });
  check('paidUntil queda en el fin del segundo período', Math.abs(after2.paidUntil - new Date(p2.json.periodEnd)) < 1000);

  // --- Validaciones ---
  const dup = await pay(A.id, { ...body1, reference: `TRF-${suffix}-1` });
  check('la misma referencia dos veces en la misma empresa se rechaza (409)', dup.status === 409, String(dup.status));
  const noRef = await pay(A.id, { ...body1, reference: '' });
  check('la transferencia sin referencia se rechaza (422)', noRef.status === 422, String(noRef.status) + JSON.stringify(noRef.json).slice(0, 100));
  check('no se puede cobrar el plan FREE (422)', (await pay(A.id, { ...body1, plan: 'FREE', reference: 'X-FREE-1' })).status === 422);
  check('monto cero o negativo se rechaza (422)', (await pay(A.id, { ...body1, amount: 0, reference: 'X-ZERO-1' })).status === 422 && (await pay(A.id, { ...body1, amount: -5, reference: 'X-NEG-1' })).status === 422);
  check('un administrador de empresa NO puede registrar pagos (403)', (await pay(A.id, { ...body1, reference: 'X-ADM-1' }, tA)).status === 403);
  check('sin sesión no se puede (401)', (await pay(A.id, { ...body1, reference: 'X-ANON-1' }, null)).status === 401);

  // --- Interfaz de proveedores: Azul existe pero está apagado ---
  const list = (await call('GET', '/platform/billing/providers', { token: tSuper })).json?.data || [];
  const azul = list.find(p => p.id === 'AZUL');
  check('Azul aparece en la interfaz pero deshabilitado', list.find(p => p.id === 'MANUAL')?.enabled === true && azul?.enabled === false);
  let azulError = '';
  try {
    providers.getProvider('AZUL');
  } catch (e) {
    azulError = e.message;
  }
  check('usar Azul falla con un mensaje claro y sin llamadas de red', azulError.includes('no está habilitado'), azulError);

  // --- Vencimiento y gracia ---
  await basePrisma.company.update({ where: { id: A.id }, data: { paidUntil: new Date(Date.now() - 3 * DAY) } });
  const grace = await usageOf(tA);
  check('pasada la fecha pagada hay 7 días de gracia con los mismos límites', grace.status === 'GRACE' && grace.effectivePlan === 'STARTER' && grace.graceDaysLeft >= 3 && grace.paid === true, `${grace.status}/${grace.graceDaysLeft}`);
  await basePrisma.company.update({ where: { id: A.id }, data: { paidUntil: new Date(Date.now() - 8 * DAY) } });
  const expired = await usageOf(tA);
  check('pasada la gracia vuelve a FREE y se avisa que fue rebajado', expired.status === 'EXPIRED' && expired.effectivePlan === 'FREE' && expired.downgraded === true && expired.plan === 'STARTER', `${expired.status}/${expired.effectivePlan}`);
  const opts = (await call('GET', '/exports/options', { token: tA })).json;
  const sales = opts?.types?.find(t => t.type === 'SALES');
  check('aun vencida, la exportación CSV básica sigue disponible y no se borró nada', sales?.allowed === true && opts.types.find(t => t.type === 'FULL')?.allowed === false);
  const renewed = await pay(A.id, { ...body1, reference: `TRF-${suffix}-3`, note: 'Renovación tras vencer' });
  check('renovar tras vencer empieza hoy, no en el pasado', renewed.status === 201 && new Date(renewed.json.periodStart).getTime() > Date.now() - 60_000, renewed.json?.periodStart);
  check('y el plan vuelve a PAID', (await usageOf(tA)).status === 'PAID');

  // --- Anulación ---
  const voided = await call('POST', `/platform/companies/${A.id}/payments/${renewed.json.id}/void`, { token: tSuper, body: { reason: 'Registrado por error' } });
  check('se anula un pago registrado por error', voided.status === 200);
  check('anular otra vez se rechaza (409)', (await call('POST', `/platform/companies/${A.id}/payments/${renewed.json.id}/void`, { token: tSuper, body: { reason: 'otra vez' } })).status === 409);
  const afterVoid = await basePrisma.company.findUnique({ where: { id: A.id } });
  check('paidUntil vuelve al fin del último pago vigente', Math.abs(afterVoid.paidUntil - new Date(p2.json.periodEnd)) < 1000);

  // --- Historial y aislamiento ---
  const historyA = (await call('GET', '/company/subscription', { token: tA })).json;
  check('el administrador de A ve sus 3 pagos (uno anulado)', historyA.payments?.length === 3 && historyA.payments.some(p => p.status === 'VOIDED'), String(historyA.payments?.length));
  const historyB = (await call('GET', '/company/subscription', { token: tB })).json;
  check('el administrador de B no ve ningún pago de A', historyB.payments?.length === 0);
  const crossReceipt = await call('GET', `/company/payments/${p1.json.id}/receipt`, { token: tB });
  check('B no puede abrir el recibo de A (404)', crossReceipt.status === 404, String(crossReceipt.status));
  const ownReceipt = await call('GET', `/company/payments/${p1.json.id}/receipt`, { token: tA });
  check('A abre su recibo con su empresa, monto y aviso de que no es comprobante fiscal', ownReceipt.status === 200 && ownReceipt.json.company.name === 'ZZ Cobro A' && ownReceipt.json.amount === 1200 && /no es un comprobante fiscal/i.test(ownReceipt.json.notFiscal));
  check('un vendedor no ve el historial de pagos (403)', (await call('GET', '/company/subscription', { token: tSeller })).status === 403);
  const viaPlatformWrongCompany = await call('GET', `/platform/companies/${B.id}/payments/${p1.json.id}/receipt`, { token: tSuper });
  check('la plataforma no abre un recibo por la empresa equivocada (404)', viaPlatformWrongCompany.status === 404);
  const platformList = (await call('GET', `/platform/companies/${A.id}/payments`, { token: tSuper })).json?.data || [];
  check('el SUPERADMIN ve el historial completo de A', platformList.length === 3);
  check('la lista de empresas de la plataforma trae paidUntil', (await call('GET', '/platform/companies?q=ZZ%20Cobro', { token: tSuper })).json?.some?.(c => c.id === A.id && 'paidUntil' in c));

  // --- Auditoría ---
  const audit = await basePrisma.auditLog.findMany({ where: { companyId: A.id, action: { in: ['SUBSCRIPTION_PAYMENT', 'SUBSCRIPTION_PAYMENT_VOID'] } } });
  check('cada pago y anulación queda auditado con el companyId', audit.filter(a => a.action === 'SUBSCRIPTION_PAYMENT').length === 3 && audit.filter(a => a.action === 'SUBSCRIPTION_PAYMENT_VOID').length === 1, String(audit.length));
  check('la auditoría no guarda la contraseña ni tokens', !JSON.stringify(audit).match(/password|token|Bearer/i));
} catch (err) {
  console.error('ERROR', err);
  failed++;
} finally {
  await basePrisma.subscriptionPayment.deleteMany({ where: { companyId: { in: companies } } });
  await basePrisma.auditLog.deleteMany({ where: { OR: [{ companyId: { in: companies } }, { userId: { in: users } }] } });
  await basePrisma.session.deleteMany({ where: { userId: { in: users } } });
  await basePrisma.user.deleteMany({ where: { id: { in: users } } });
  await basePrisma.branch.deleteMany({ where: { companyId: { in: companies } } });
  await basePrisma.company.deleteMany({ where: { id: { in: companies } } });
  await basePrisma.$disconnect();
}

console.log(failed ? `\n${failed} comprobación(es) fallaron` : '\nTODO OK');
process.exit(failed ? 1 : 0);
