// Base de datos propia para una prueba de integración: la crea (misma conexión, otro nombre), le aplica las migraciones,
// apunta DATABASE_URL a ella y al final la borra. Así la prueba no comparte filas ni colas (por ejemplo la de e-CF) con el API
// de desarrollo ni con otras pruebas. Importe este módulo y llame a `createIsolatedDb()` ANTES de cargar `config/db.js` del API.
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const require = createRequire(path.join(REPO, 'package.json'));

export async function createIsolatedDb(name) {
  const devUrl = process.env.DATABASE_URL;
  if (!devUrl) throw new Error('Falta DATABASE_URL (use --env-file=apps/api/.env)');
  const devName = path.basename(new URL(devUrl).pathname);
  if (name === devName) throw new Error('La base de la prueba no puede ser la de desarrollo');
  const adminUrl = new URL(devUrl);
  adminUrl.pathname = '/postgres';
  const url = new URL(devUrl);
  url.pathname = `/${name}`;

  const { PrismaClient } = require('@prisma/client');
  const admin = new PrismaClient({ datasources: { db: { url: adminUrl.toString() } }, log: [] });
  await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
  await admin.$executeRawUnsafe(`CREATE DATABASE ${name}`);
  const migrate = spawnSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['prisma', 'migrate', 'deploy'], { cwd: REPO, env: { ...process.env, DATABASE_URL: url.toString() }, encoding: 'utf8', shell: process.platform === 'win32' });
  if (migrate.status !== 0) {
    await admin.$disconnect();
    throw new Error(`No se pudieron aplicar las migraciones: ${migrate.stderr || migrate.stdout}`);
  }
  process.env.DATABASE_URL = url.toString();

  return {
    url: url.toString(),
    /** Borra la base (llámelo después de desconectar el cliente de Prisma de la prueba). */
    async drop() {
      await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`).catch(error => console.log('No se pudo borrar la base de la prueba:', error.message));
      await admin.$disconnect();
    },
  };
}
