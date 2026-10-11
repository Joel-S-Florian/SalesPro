// Prueba de integración de la configuración de facturación electrónica (API real + base de datos + simulador DGII).
// Usa el administrador de desarrollo («admin») de «Mi Empresa»; pone un RNC temporal y deja todo como estaba.
//
//   node --env-file=apps/api/.env scripts/test-ecf-config.mjs
import http from 'node:http';
import express from 'express';

process.env.PORT ||= '4010';
const root = new URL('../apps/api/src/', import.meta.url);
const load = p => import(new URL(p, root).href);

const { createDgiiSimulator } = await load('modules/ecf/sim/dgii-simulator.js');
const { generateTestPkcs12 } = await load('modules/ecf/ecf.certificate.js');
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
  const res = await fetch(base + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    // sin cuerpo
  }
  return { status: res.status, json, text: JSON.stringify(json) };
};

const company = await basePrisma.company.findFirst({ where: { name: 'Mi Empresa' } });
const previousRnc = company.rnc;
await basePrisma.company.update({ where: { id: company.id }, data: { rnc: '131880738' } });

try {
  const login = await call('POST', '/auth/login', { body: { username: 'admin', password: 'admin' } });
  const token = login.json.accessToken;
  const seller = await call('POST', '/auth/login', { body: { username: 'vendedor', password: 'vendedor' } });

  check('un vendedor no puede ver la configuración e-CF', (await call('GET', '/ecf/config', { token: seller.json.accessToken })).status === 403);
  check('sin sesión se rechaza', (await call('GET', '/ecf/config')).status === 401);

  let cfg = (await call('GET', '/ecf/config', { token })).json;
  check('configuración inicial apagada y sin certificado', cfg.mode === 'OFF' && cfg.certificate.loaded === false);
  check('la llave de cifrado está configurada', cfg.encryptionReady === true);
  check('muestra las URL a registrar en la DGII', cfg.receiverUrls.reception.endsWith('/api/ecf-receptor/131880738/fe/recepcion/api/ecf'), cfg.receiverUrls.reception);

  const cert = generateTestPkcs12({ rnc: '131880738', password: 'prueba123' });
  const up = (password, buffer = cert.p12) => call('POST', '/ecf/certificate', { token, body: { fileBase64: buffer.toString('base64'), password } });

  const wrong = await up('incorrecta');
  check('contraseña incorrecta se rechaza con mensaje claro', wrong.status === 400 && /contraseña/.test(wrong.text), wrong.json?.error);
  const junk = await up('x', Buffer.from('esto no es un certificado'));
  check('archivo inválido se rechaza', junk.status === 400 && /no es un certificado/.test(junk.text));

  const ok = await up('prueba123');
  check('certificado válido se guarda', ok.status === 201 && ok.json.config.certificate.loaded === true);
  check('el titular coincide con el RNC', ok.json.config.certificate.rncMatch === true && !ok.json.warning);
  const leaked = ok.text.includes('prueba123') || ok.text.includes(cert.p12.toString('base64').slice(0, 60)) || /certificateEnc|certificatePassEnc/.test(ok.text);
  check('la respuesta no filtra certificado ni contraseña', !leaked);

  const row = await basePrisma.ecfConfig.findUnique({ where: { companyId: company.id } });
  check('en la base de datos va cifrado', row.certificateEnc.startsWith('v1.') && row.certificatePassEnc.startsWith('v1.') && !row.certificatePassEnc.includes('prueba123'));

  const before = (await call('GET', '/ecf/config', { token })).json;
  check('el modo sigue apagado hasta activarlo', before.mode === 'OFF');

  const probe = await call('POST', '/ecf/test-connection', { token });
  check('probar conexión obtiene el token del simulador', probe.status === 200 && probe.json.ok === true && probe.json.usingSimulator === true, probe.json?.note);
  check('probar conexión no activa la facturación', (await call('GET', '/ecf/config', { token })).json.mode === 'OFF');
  check('el simulador emitió un token', sim.state.issuedTokens === 1);

  const on = await call('PUT', '/ecf/config', { token, body: { mode: 'PRECERT', legalName: 'MI EMPRESA SRL', municipalityCode: '010101', provinceCode: '01' } });
  check('activar pre-certificación', on.status === 200 && on.json.mode === 'PRECERT' && on.json.legalName === 'MI EMPRESA SRL');
  check('guarda la conexión verificada', on.json.connection.ok === true);

  const prod = await call('PUT', '/ecf/config', { token, body: { mode: 'PROD' } });
  check('no deja activar Producción apuntando a un simulador', prod.status === 400 && /simulador/.test(prod.text));

  // Secuencias autorizadas
  const s1 = await call('POST', '/ecf/sequences', { token, body: { ecfType: 'E32', rangeFrom: 1, rangeTo: 50000000, validUntil: '2028-12-31' } });
  check('crea un rango E32', s1.status === 201 && s1.json.remaining === 50000000, s1.text);
  const overlap = await call('POST', '/ecf/sequences', { token, body: { ecfType: 'E32', rangeFrom: 100, rangeTo: 200 } });
  check('rechaza rangos que se cruzan', overlap.status === 409);
  const bad = await call('POST', '/ecf/sequences', { token, body: { ecfType: 'E99', rangeFrom: 1, rangeTo: 5 } });
  check('rechaza tipos inexistentes', bad.status === 422 || bad.status === 400);
  const s2 = await call('POST', '/ecf/sequences', { token, body: { ecfType: 'E31', rangeFrom: 1, rangeTo: 1000 } });
  const list = await call('GET', '/ecf/sequences', { token });
  check('lista los rangos', list.json.length === 2);
  const off = await call('PUT', `/ecf/sequences/${s2.json.id}`, { token, body: { active: false } });
  check('desactiva un rango', off.status === 200 && off.json.active === false);
  const del = await call('DELETE', `/ecf/sequences/${s2.json.id}`, { token });
  check('elimina un rango sin usar', del.status === 200);

  // Aislamiento entre empresas
  const { runInTenant } = await load('config/tenant.js');
  const configService = await load('modules/ecf/ecf.config.service.js');
  const other = await basePrisma.company.findFirst({ where: { name: 'Empresa Prueba' } });
  const otherCfg = await runInTenant(other.id, () => configService.getConfig());
  const otherSeq = await runInTenant(other.id, () => configService.listSequences());
  check('otra empresa no ve el certificado ni los rangos', otherCfg.certificate.loaded === false && otherSeq.length === 0);

  const removed = await call('DELETE', '/ecf/certificate', { token });
  check('quitar el certificado apaga la facturación electrónica', removed.status === 200 && removed.json.mode === 'OFF' && removed.json.certificate.loaded === false);

  const audits = await basePrisma.auditLog.findMany({ where: { companyId: company.id, entity: { in: ['ecf_config', 'ecf_sequence'] } } });
  const auditText = JSON.stringify(audits);
  check('queda auditado y sin secretos', audits.length >= 6 && !auditText.includes('prueba123') && !/certificateEnc/.test(auditText), `${audits.length} registros`);
} finally {
  await basePrisma.ecfSequence.deleteMany({ where: { companyId: company.id } });
  await basePrisma.ecfConfig.deleteMany({ where: { companyId: company.id } });
  await basePrisma.auditLog.deleteMany({ where: { companyId: company.id, entity: { in: ['ecf_config', 'ecf_sequence'] } } });
  await basePrisma.company.update({ where: { id: company.id }, data: { rnc: previousRnc } });
  apiServer.close();
  simServer.close();
}

console.log(failed ? `\n${failed} FALLO(S)` : '\nTODO OK');
await basePrisma.$disconnect();
process.exit(failed ? 1 : 0);
