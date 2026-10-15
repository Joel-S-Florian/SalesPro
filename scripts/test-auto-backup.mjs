// Prueba del respaldo automático: solo empresas con el plan BUSINESS efectivo, frecuencia respetada, retención de 4,
// cifrado en reposo (AES-256-GCM), descarga que descifra, sin secretos, aislamiento entre empresas y cambio a diario.
// Corre con su PROPIA base de datos (factos_test_backup) y su propia carpeta de archivos; no toca el desarrollo.
//
//   node --env-file=apps/api/.env scripts/test-auto-backup.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pipeline } from 'node:stream/promises';
import { Writable } from 'node:stream';

import { createIsolatedDb } from './lib/isolated-db.mjs';

const require = createRequire(new URL('../package.json', import.meta.url));
const JSZip = require('jszip');

const isolated = await createIsolatedDb('factos_test_backup');
const exportDir = fs.mkdtempSync(path.join(os.tmpdir(), 'factos-backup-'));
process.env.EXPORT_DIR = exportDir;
delete process.env.BACKUP_FREQUENCY;
delete process.env.BACKUP_KEEP;
const root = new URL('../apps/api/src/', import.meta.url);
const load = p => import(new URL(p, root).href);
const { basePrisma } = await load('config/db.js');
const auto = await load('modules/exports/exports.auto.js');
const svc = await load('modules/exports/exports.service.js');
const { createDecryptStream } = await load('modules/exports/exports.crypto.js');

let failed = 0;
const check = (name, ok, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`);
  if (!ok) failed++;
};
const sleep = ms => new Promise(r => setTimeout(r, ms));
const DAY = 24 * 3600 * 1000;

const readPlain = async filePath => {
  const chunks = [];
  await pipeline(createDecryptStream(filePath), new Writable({ write: (c, _e, cb) => (chunks.push(c), cb()) }));
  const zip = await JSZip.loadAsync(Buffer.concat(chunks));
  const files = {};
  for (const name of Object.keys(zip.files)) files[name] = await zip.files[name].async('string');
  return files;
};

async function mkCompany(name, plan, extra = {}) {
  const c = await basePrisma.company.create({ data: { name, plan, ...extra } });
  await basePrisma.user.create({ data: { companyId: c.id, username: `u_${c.id.slice(-6)}`, fullName: `Admin ${name}`, role: 'ADMINISTRADOR', passwordHash: `SECRETO-HASH-${name}` } });
  await basePrisma.category.create({ data: { name: `Cat ${name}`, companyId: c.id } });
  return c;
}

try {
  const biz = await mkCompany('Respaldo Negocio SRL', 'BUSINESS');
  const starter = await mkCompany('Respaldo Starter SRL', 'STARTER');
  const free = await mkCompany('Respaldo Gratis SRL', 'FREE');
  const expired = await mkCompany('Respaldo Vencida SRL', 'BUSINESS', { trialEndsAt: new Date(Date.now() - 30 * DAY) });
  const jobsOf = companyId => basePrisma.exportJob.findMany({ where: { companyId, auto: true }, orderBy: { createdAt: 'asc' } });

  // --- Quién recibe respaldo automático ---
  let scheduled = await auto.scheduleAutoBackups();
  check('solo la empresa con plan BUSINESS efectivo se programa', scheduled.length === 1 && scheduled[0] === biz.id, JSON.stringify(scheduled));
  check('STARTER, FREE y BUSINESS vencido (ya en FREE) no reciben respaldo automático', (await jobsOf(starter.id)).length + (await jobsOf(free.id)).length + (await jobsOf(expired.id)).length === 0);
  check('frecuencia por defecto = semanal', auto.backupFrequency() === 'weekly');

  scheduled = await auto.scheduleAutoBackups();
  check('no se programa otro antes de que pase la semana', scheduled.length === 0);

  await svc.kick();
  const [first] = await jobsOf(biz.id);
  check('el respaldo termina en DONE, es automático, FULL/CSV y a nombre de «Sistema»', first.status === 'DONE' && first.auto && first.type === 'FULL' && first.format === 'CSV' && first.userName === 'Sistema', first.status);
  check('no vence a las 48 h (expiresAt nulo)', first.expiresAt === null);
  check('queda marcado como cifrado', first.encrypted === true);

  // --- Cifrado en reposo ---
  const raw = fs.readFileSync(first.filePath);
  check('el archivo en disco NO es un ZIP legible (empieza con FXB1, no con PK)', raw.subarray(0, 4).toString() === 'FXB1' && raw.subarray(0, 2).toString() !== 'PK');
  check('el texto de la empresa no aparece en el archivo cifrado', !raw.includes('Respaldo Negocio SRL'));
  check('el tamaño guardado es el del archivo cifrado', first.fileSize === raw.length);

  // --- Contenido: descifra, aislamiento y sin secretos ---
  const files = await readPlain(first.filePath);
  check('descifrado: trae las tablas y el manifiesto', 'manifest.json' in files && 'usuarios.csv' in files && 'categorias.csv' in files, Object.keys(files).length + ' archivos');
  const all = Object.values(files).join('\n');
  check('incluye los datos de la empresa', all.includes('Cat Respaldo Negocio SRL'));
  check('no trae datos de otras empresas', !all.includes('Respaldo Starter SRL') && !all.includes('Respaldo Gratis SRL'));
  check('no trae el hash de contraseñas ni «passwordHash»', !all.includes('SECRETO-HASH') && !files['usuarios.csv'].includes('passwordHash'));

  // --- Descarga: el enlace firmado emite el trabajo y se descifra ---
  const token = svc.downloadToken(first.id);
  const viaToken = await svc.jobFromToken(first.id, token);
  check('el enlace firmado resuelve el respaldo automático', viaToken.id === first.id && viaToken.encrypted);

  // --- Alteración del archivo: la descarga debe fallar ---
  const tampered = Buffer.from(raw);
  tampered[40] ^= 0xff;
  const tamperedPath = path.join(exportDir, 'alterado.bin');
  fs.writeFileSync(tamperedPath, tampered);
  let tamperFailed = false;
  try {
    await readPlain(tamperedPath);
  } catch {
    tamperFailed = true;
  }
  check('un archivo alterado no se descifra (autenticación GCM)', tamperFailed);

  // --- Auditoría ---
  const audit = await basePrisma.auditLog.findMany({ where: { companyId: biz.id, action: 'AUTO_BACKUP_SCHEDULED' } });
  check('la programación queda auditada con companyId', audit.length === 1);
  check('la auditoría no contiene secretos', !JSON.stringify(audit).includes('SECRETO'));

  // --- Frecuencia semanal: 6 días no, 7 días sí ---
  const t0 = Date.now();
  check('a los 6 días todavía no toca', (await auto.scheduleAutoBackups(new Date(t0 + 6 * DAY))).length === 0);
  check('a los 7 días sí toca', (await auto.scheduleAutoBackups(new Date(t0 + 7 * DAY))).length === 1);
  await svc.kick();

  // --- Retención: se conservan 4 ---
  for (let week = 2; week <= 6; week++) {
    await sleep(15);
    await auto.scheduleAutoBackups(new Date(t0 + week * 7 * DAY + 60_000));
    await svc.kick();
  }
  const kept = (await jobsOf(biz.id)).filter(j => j.status === 'DONE');
  check('se conservan solo los últimos 4 respaldos automáticos', kept.length === 4, `${kept.length} conservados`);
  const onDisk = fs.readdirSync(path.join(exportDir, biz.id));
  check('los archivos de los respaldos viejos se borraron del disco', onDisk.length === 4, `${onDisk.length} en disco`);
  check('el más viejo (el primero) ya no existe', !fs.existsSync(first.filePath));

  // --- Cambio a diario con la variable del servidor ---
  const tNow = Date.now();
  process.env.BACKUP_FREQUENCY = 'daily';
  check('BACKUP_FREQUENCY=daily cambia la frecuencia sin tocar lógica', auto.backupFrequency() === 'daily');
  check('diario: a las 23 h no toca', (await auto.scheduleAutoBackups(new Date(tNow + 23 * 3600 * 1000))).length === 0);
  check('diario: a las 25 h sí toca', (await auto.scheduleAutoBackups(new Date(tNow + 25 * 3600 * 1000))).length === 1);
  await svc.kick();
  process.env.BACKUP_FREQUENCY = 'invalida';
  check('un valor inválido vuelve a la frecuencia por defecto', auto.backupFrequency() === 'weekly');
  delete process.env.BACKUP_FREQUENCY;

  // --- Plan: bajar de plan o vencer corta los respaldos; un pago registrado lo reactiva ---
  await basePrisma.company.update({ where: { id: biz.id }, data: { plan: 'STARTER' } });
  check('si la empresa baja a STARTER ya no se programa', (await auto.scheduleAutoBackups(new Date(tNow + 400 * DAY))).length === 0);
  await basePrisma.company.update({ where: { id: biz.id }, data: { plan: 'BUSINESS' } });
  await basePrisma.company.update({ where: { id: expired.id }, data: { paidUntil: new Date(Date.now() + 20 * DAY) } });
  check('BUSINESS con pago vigente (paidUntil) sí se programa aunque la prueba terminó', (await auto.scheduleAutoBackups(new Date(tNow + 30 * 3600 * 1000))).includes(expired.id));
  await svc.kick();

  // --- Sin llave maestra el respaldo falla y no deja nada en claro ---
  const key = process.env.ECF_MASTER_KEY;
  await basePrisma.exportJob.deleteMany({ where: { companyId: biz.id } });
  process.env.ECF_MASTER_KEY = '';
  const dirBefore = fs.readdirSync(path.join(exportDir, biz.id));
  await auto.scheduleAutoBackups(new Date(tNow + 500 * DAY));
  await svc.kick();
  process.env.ECF_MASTER_KEY = key;
  const failedJob = (await jobsOf(biz.id)).at(-1);
  check('sin ECF_MASTER_KEY el trabajo queda en FAILED', failedJob?.status === 'FAILED', failedJob?.status);
  check('y no deja ningún ZIP sin cifrar en el disco', fs.readdirSync(path.join(exportDir, biz.id)).filter(f => !dirBefore.includes(f)).length === 0);

  // --- Un respaldo manual no se ve afectado por los automáticos ---
  const admin = await basePrisma.user.findFirst({ where: { companyId: biz.id } });
  const { runInTenant } = await load('config/tenant.js');
  const manual = await runInTenant(biz.id, () => svc.createJob({ userId: admin.id, fullName: admin.fullName, username: admin.username }, { type: 'FULL', format: 'CSV' }));
  check('un respaldo manual se puede pedir aunque haya uno automático pendiente', manual.status === 'PENDING' && manual.auto === false);
  await svc.kick();
  const manualRow = await basePrisma.exportJob.findUnique({ where: { id: manual.id } });
  check('el manual sigue sin cifrar y con vencimiento de 48 h', manualRow.encrypted === false && manualRow.expiresAt !== null);
} catch (err) {
  console.error('ERROR', err);
  failed++;
} finally {
  svc.stopExportWorker();
  fs.rmSync(exportDir, { recursive: true, force: true });
  await basePrisma.$disconnect();
  await isolated.drop();
}

console.log(failed ? `\n${failed} comprobación(es) fallaron` : '\nTODO OK');
process.exit(failed ? 1 : 0);
