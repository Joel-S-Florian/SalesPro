// Ensayo completo del certificado digital .p12 contra el API real y el simulador de la DGII:
// todos los casos (correcto, 3DES, por vencer, de otro RNC, vencido, no vigente, sin llave, contraseña mala), la firma de un e-CF
// con el certificado guardado (y su verificación), el cambio de certificado y el borrado. Es el mismo recorrido que se hará con el
// certificado real, con archivos inventados. Usa «Mi Empresa» (pone un RNC temporal y deja todo como estaba).
//
//   node --env-file=apps/api/.env scripts/test-ecf-certificate.mjs
import http from 'node:http';
import express from 'express';

process.env.PORT ||= '4010';
const root = new URL('../apps/api/src/', import.meta.url);
const load = p => import(new URL(p, root).href);

const { createDgiiSimulator } = await load('modules/ecf/sim/dgii-simulator.js');
const { generateTestPkcs12, TEST_CERT_SCENARIOS, TEST_CERT_PASSWORD, parsePkcs12 } = await load('modules/ecf/ecf.certificate.js');
const { signXml, verifySignedXml, securityCodeOf } = await load('modules/ecf/ecf.signer.js');
const { loadCredentialsFromDb } = await load('modules/ecf/ecf.token.service.js');
const { basePrisma } = await load('config/db.js');

const sim = createDgiiSimulator();
const simServer = http.createServer(sim.app);
await new Promise(r => simServer.listen(0, '127.0.0.1', r));
process.env.ECF_BASE_URL_OVERRIDE = `http://127.0.0.1:${simServer.address().port}`;

const { default: app } = await load('app.js');
const server = express();
server.use('/api', app);
const apiServer = http.createServer(server);
await new Promise(r => apiServer.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${apiServer.address().port}/api`;

let failed = 0;
const check = (name, ok, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`);
  if (!ok) failed++;
};
const call = async (method, path, { token, body } = {}) => {
  const res = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  let json = null;
  try {
    json = await res.json();
  } catch {
    // sin cuerpo
  }
  return { status: res.status, json, text: JSON.stringify(json) };
};

const RNC = '131880738';
const company = await basePrisma.company.findFirst({ where: { name: 'Mi Empresa' } });
const previousRnc = company.rnc;
await basePrisma.company.update({ where: { id: company.id }, data: { rnc: RNC } });

try {
  const token = (await call('POST', '/auth/login', { body: { username: 'admin', password: 'admin' } })).json.accessToken;
  const upload = (p12, password = TEST_CERT_PASSWORD) => call('POST', '/ecf/certificate', { token, body: { fileBase64: p12.toString('base64'), password } });
  const files = {};

  // --- Todos los casos, uno por uno ---
  for (const scenario of TEST_CERT_SCENARIOS) {
    const { p12 } = generateTestPkcs12({ rnc: RNC, password: TEST_CERT_PASSWORD, ...scenario.options });
    files[scenario.id] = p12;
    const res = await upload(p12);
    if (scenario.expect === 'error') {
      check(`${scenario.id}: se rechaza con un mensaje claro`, res.status === 400 && scenario.message.test(res.text), res.json?.error);
    } else if (scenario.expect === 'warning') {
      check(`${scenario.id}: se guarda pero avisa`, res.status === 201 && scenario.message.test(res.json.warning || '') && res.json.config.certificate.rncMatch === false, res.json?.warning);
    } else {
      check(`${scenario.id}: se guarda sin avisos`, res.status === 201 && !res.json.warning && res.json.config.certificate.rncMatch === true);
    }
  }
  check('contraseña equivocada se rechaza', (await upload(files['valido-aes'], 'mala')).json?.error?.includes('contraseña'));
  const afterFailures = (await call('GET', '/ecf/config', { token })).json;
  check('los rechazos no dejaron nada guardado de más (queda el último certificado aceptado: «otro-rnc»)', afterFailures.certificate.loaded && afterFailures.certificate.rncMatch === false);

  // --- Certificado correcto: conexión, activación y firma ---
  const first = await upload(files['valido-aes']);
  const fingerprint1 = first.json.config.certificate.fingerprint;
  check('el certificado correcto reemplaza al anterior', first.status === 201 && first.json.config.certificate.rncMatch === true && !!fingerprint1);
  const tokensBefore = sim.state.issuedTokens;
  const probe = await call('POST', '/ecf/test-connection', { token });
  check('el simulador emite el token firmando con el certificado', probe.json?.ok === true && sim.state.issuedTokens === tokensBefore + 1, probe.json?.note);
  const on = await call('PUT', '/ecf/config', { token, body: { mode: 'PRECERT', legalName: 'MI EMPRESA SRL', municipalityCode: '010101', provinceCode: '01' } });
  check('se activa la pre-certificación', on.status === 200 && on.json.mode === 'PRECERT');

  const xml = '<ECF><Encabezado><IdDoc><eNCF>E320000000001</eNCF></IdDoc></Encabezado></ECF>';
  const creds1 = await loadCredentialsFromDb(company.id, { purpose: 'sign-ecf', documentId: 'E320000000001' });
  const signed1 = signXml(xml, creds1);
  check('firma un e-CF con el certificado guardado y la firma verifica', verifySignedXml(signed1).valid === true);
  check('el código de seguridad tiene 6 caracteres', securityCodeOf(signed1).length === 6, securityCodeOf(signed1));
  check('la firma lleva el certificado guardado (misma huella)', parsePkcs12(files['valido-aes'], TEST_CERT_PASSWORD).info.fingerprint === fingerprint1);
  check('alterar el documento firmado invalida la firma', verifySignedXml(signed1.replace('E320000000001', 'E320000000009')).valid === false);

  // --- Cambio de certificado ---
  const second = await upload(files['valido-3des']);
  const fingerprint2 = second.json.config.certificate.fingerprint;
  check('cambiar de certificado actualiza la huella', second.status === 201 && fingerprint2 && fingerprint2 !== fingerprint1);
  const tokensMid = sim.state.issuedTokens;
  const probe2 = await call('POST', '/ecf/test-connection', { token });
  check('tras el cambio se pide un token nuevo (se olvidó el anterior)', probe2.json?.ok === true && sim.state.issuedTokens === tokensMid + 1);
  const creds2 = await loadCredentialsFromDb(company.id, { purpose: 'sign-arecf' });
  check('las credenciales en uso cambiaron al certificado nuevo', creds2.certPem !== creds1.certPem && verifySignedXml(signXml(xml, creds2)).valid === true);

  // --- Seguridad ---
  const row = await basePrisma.ecfConfig.findUnique({ where: { companyId: company.id } });
  check('el .p12 y su contraseña están cifrados en la base de datos', row.certificateEnc.startsWith('v1.') && !row.certificatePassEnc.includes(TEST_CERT_PASSWORD));
  const cfgText = JSON.stringify((await call('GET', '/ecf/config', { token })).json);
  check('la configuración nunca devuelve el certificado ni la contraseña', !cfgText.includes(TEST_CERT_PASSWORD) && !/certificateEnc|certificatePassEnc|PRIVATE KEY/.test(cfgText));

  // --- Auditoría del uso del certificado ---
  let rejectedPurpose = false;
  try {
    await loadCredentialsFromDb(company.id);
  } catch (error) {
    rejectedPurpose = /propósito/.test(error.message);
  }
  check('usar el certificado sin declarar un propósito se rechaza (no hay uso sin rastro)', rejectedPurpose);
  await new Promise(resolve => setTimeout(resolve, 500));
  const uses = await basePrisma.auditLog.findMany({ where: { companyId: company.id, action: 'ECF_CERT_USED' }, orderBy: { createdAt: 'asc' } });
  const purposes = uses.map(u => u.newData?.purpose);
  check('cada uso quedó registrado con su propósito (test-connection, sign-ecf, sign-arecf)', ['test-connection', 'sign-ecf', 'sign-arecf'].every(p => purposes.includes(p)), purposes.join(','));
  check('el uso de un documento guarda su identificador', uses.some(u => u.entityId === 'E320000000001'));
  const usageText = JSON.stringify(uses);
  check('el registro nunca guarda el certificado, la contraseña, el token ni el XML', !usageText.includes(TEST_CERT_PASSWORD) && !/PRIVATE KEY|BEGIN CERTIFICATE|<ECF|certificateEnc|token":/.test(usageText));
  const { runInTenant } = await load('config/tenant.js');
  const listed = await runInTenant(company.id, async () => (await load('modules/ecf/ecf.config.service.js')).listCertificateUsage(50));
  check('el tablero lista los usos (más reciente primero) sin datos del certificado', listed.length >= 3 && new Date(listed[0].at) >= new Date(listed.at(-1).at) && !JSON.stringify(listed).includes('PRIVATE KEY'));

  // --- Quitar ---
  const removed = await call('DELETE', '/ecf/certificate', { token });
  check('quitar el certificado apaga la facturación y borra todo', removed.status === 200 && removed.json.mode === 'OFF' && removed.json.certificate.loaded === false);
  let blocked = false;
  try {
    await loadCredentialsFromDb(company.id, { purpose: 'sign-ecf' });
  } catch {
    blocked = true;
  }
  check('sin certificado ya no se puede firmar', blocked);
} finally {
  await basePrisma.ecfSequence.deleteMany({ where: { companyId: company.id } });
  await basePrisma.ecfConfig.deleteMany({ where: { companyId: company.id } });
  await basePrisma.auditLog.deleteMany({ where: { companyId: company.id, entity: { in: ['ecf_config', 'ecf_sequence', 'ecf_certificate'] } } });
  await basePrisma.company.update({ where: { id: company.id }, data: { rnc: previousRnc } });
  apiServer.close();
  simServer.close();
}

console.log(failed ? `\n${failed} FALLO(S)` : '\nTODO OK');
await basePrisma.$disconnect();
process.exit(failed ? 1 : 0);
