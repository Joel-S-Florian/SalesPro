// Genera certificados digitales .p12 de PRUEBA (autofirmados) para ensayar la carga en Configuración → Facturación electrónica.
// Cada archivo representa un caso real: correcto, antiguo (3DES), por vencer, de otro RNC, vencido, aún no vigente y sin llave privada.
// NO sirven ante la DGII real: solo ensayan el flujo. Contraseña de todos: prueba123.
//
//   node scripts/gen-test-cert.mjs [--rnc 131880738] [--out storage/test-certs]
import fs from 'node:fs';
import path from 'node:path';

const root = new URL('../apps/api/src/', import.meta.url);
const { generateTestPkcs12, TEST_CERT_SCENARIOS, TEST_CERT_PASSWORD } = await import(new URL('modules/ecf/ecf.certificate.js', root).href);

const arg = name => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const rnc = (arg('rnc') || '131880738').replace(/\D/g, '');
const out = path.resolve(arg('out') || 'storage/test-certs');
fs.mkdirSync(out, { recursive: true });

const lines = [
  'Certificados de PRUEBA de FACTOS (autofirmados; no sirven ante la DGII real)',
  `RNC del titular: ${rnc}  ·  Contraseña de todos: ${TEST_CERT_PASSWORD}`,
  `Generados: ${new Date().toISOString()}`,
  '',
  'Súbalos en Configuración → Facturación electrónica y compare con el resultado esperado:',
  '',
];
for (const scenario of TEST_CERT_SCENARIOS) {
  const { p12 } = generateTestPkcs12({ rnc, password: TEST_CERT_PASSWORD, ...scenario.options, ...(scenario.options.rnc ? { rnc: scenario.options.rnc } : {}) });
  fs.writeFileSync(path.join(out, scenario.file), p12);
  const expected = { ok: 'Se guarda sin avisos', warning: 'Se guarda CON advertencia', error: 'Se rechaza' }[scenario.expect];
  lines.push(`${scenario.file}\n    ${scenario.description}\n    Resultado esperado: ${expected}\n`);
  console.log(`✔ ${scenario.file}  (${scenario.expect})`);
}
lines.push('Además pruebe la contraseña equivocada con cualquiera de ellos (se rechaza con «La contraseña del certificado es incorrecta»).');
fs.writeFileSync(path.join(out, 'LEEME.txt'), lines.join('\r\n') + '\r\n');
console.log(`\nListo: ${TEST_CERT_SCENARIOS.length} archivos en ${out}`);
