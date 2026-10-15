// Prueba del canal de contacto por WhatsApp: GET /api/public/contact sin número (null) y con número (enlace wa.me).
// No usa base de datos ni toca el API de desarrollo: monta solo el router público en un puerto libre.
//   node --env-file=apps/api/.env scripts/test-contact.mjs
import http from 'node:http';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = new URL('../apps/api/src/', import.meta.url);

if (process.argv[2] === 'child') {
  const express = (await import('express')).default;
  const { default: router } = await import(new URL('modules/public/public.routes.js', root).href);
  const app = express();
  app.use('/public', router);
  const server = http.createServer(app);
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const res = await fetch(`http://127.0.0.1:${server.address().port}/public/contact`);
  console.log(JSON.stringify({ status: res.status, body: await res.json() }));
  process.exit(0);
}

let failed = 0;
const check = (name, ok, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`);
  if (!ok) failed++;
};
const run = env => {
  const out = spawnSync(process.execPath, [fileURLToPath(import.meta.url), 'child'], { env: { ...process.env, ...env }, encoding: 'utf8' });
  const line = out.stdout.trim().split('\n').at(-1);
  return JSON.parse(line);
};

const none = run({ WHATSAPP_NUMBER: '', WHATSAPP_WELCOME_MESSAGE: '' });
check('sin número configurado devuelve whatsapp y link nulos', none.status === 200 && none.body.whatsapp === null && none.body.link === null, JSON.stringify(none.body));

const withNumber = run({ WHATSAPP_NUMBER: '+1 (809) 555-0000', WHATSAPP_WELCOME_MESSAGE: '' });
check('con número devuelve el formato internacional', withNumber.body.whatsapp === '18095550000', withNumber.body.whatsapp);
check('usa el mensaje de bienvenida por defecto', withNumber.body.link === `https://wa.me/18095550000?text=${encodeURIComponent('Hola, quiero información sobre FACTOS.')}`, withNumber.body.link);

const custom = run({ WHATSAPP_NUMBER: '829-555-0001', WHATSAPP_WELCOME_MESSAGE: 'Buenas, quiero el plan Business' });
check('el mensaje de bienvenida es editable y el 829 se completa con el 1', custom.body.link === `https://wa.me/18295550001?text=${encodeURIComponent('Buenas, quiero el plan Business')}`, custom.body.link);

const bad = run({ WHATSAPP_NUMBER: 'no-es-un-numero', WHATSAPP_WELCOME_MESSAGE: '' });
check('un valor inválido se trata como sin configurar', bad.body.whatsapp === null && bad.body.link === null);

console.log(failed ? `\n${failed} comprobación(es) fallaron` : '\nTODO OK');
process.exit(failed ? 1 : 0);
