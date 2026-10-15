// Guardia de aislamiento entre empresas: falla si el código del API usa `basePrisma` o SQL directo
// ($queryRaw, $queryRawUnsafe, $executeRaw, $executeRawUnsafe) fuera de una lista permitida y justificada.
//
// Por qué: `prisma` (con contexto de empresa) filtra y sella `companyId` solo; `basePrisma` y el SQL directo NO. Cada uso nuevo de
// esos dos caminos es un lugar donde un error puede mezclar datos de dos empresas, así que debe revisarse y quedar anotado aquí.
//
// Uso:  node scripts/check-tenant-safety.mjs        (sale con código 1 si hay una violación)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const API_SRC = fileURLToPath(new URL('../apps/api/src/', import.meta.url));

/**
 * Archivos que PUEDEN usar `basePrisma` y cuántas veces como máximo (cada mención cuenta). Si necesita agregar un uso nuevo:
 * confirme que filtra por `companyId` de forma explícita (o que opera sobre `Company`, que no tiene `companyId`) y súbale el
 * número con el motivo. Subirlo sin revisar derrota el propósito de esta guardia.
 */
const BASE_PRISMA_ALLOWED = {
  'config/db.js': { max: 5, why: 'Define basePrisma y el cliente con contexto de empresa.' },
  'server.js': { max: 1, why: 'Al arrancar recorre todas las empresas (secuencias NCF) y verifica la conexión.' },
  'shared/utils/startupChecks.js': { max: 2, why: 'Revisión de arranque de las cuentas SUPERADMIN (plataforma, sin empresa).' },
  'shared/middleware/auth.js': { max: 1, why: 'Carga al usuario ANTES de abrir el contexto de empresa (de ahí sale el companyId).' },
  'shared/middleware/audit.js': { max: 3, why: 'Escribe auditoría con companyId explícito del usuario; sirve también a la plataforma.' },
  'shared/plans.js': { max: 2, why: 'Lee la fila de Company (no tiene companyId) con el id del contexto.' },
  'shared/utils/ncf.js': { max: 2, why: 'Crea las secuencias NCF de UNA empresa pasando su companyId.' },
  'modules/auth/auth.service.js': { max: 28, why: 'Inicio de sesión, recuperación y sesiones: ocurren antes de que exista contexto de empresa (el usuario es único en toda la plataforma).' },
  'modules/platform/platform.service.js': { max: 17, why: 'Panel del SUPERADMIN: ve todas las empresas a propósito (solo rutas con authorize SUPERADMIN).' },
  'modules/platform/analytics.js': { max: 5, why: 'Analítica de la plataforma (SUPERADMIN), entre empresas a propósito.' },
  'modules/platform/bootstrap.js': { max: 5, why: 'Datos iniciales de UNA empresa nueva con su companyId explícito.' },
  'modules/leads/leads.service.js': { max: 10, why: 'Solicitudes de la landing: no son datos de ninguna empresa; aprobarlas crea la empresa.' },
  'modules/public/signup.service.js': { max: 4, why: 'Registro autónomo: crea la empresa y su administrador (aún no hay contexto).' },
  'modules/exports/exports.service.js': { max: 13, why: 'Cola de exportaciones entre empresas (un trabajo a la vez) y enlaces firmados; cada trabajo lleva su companyId.' },
  'modules/exports/exports.runner.js': { max: 6, why: 'Genera el ZIP de UNA empresa: TODAS las lecturas filtran por companyId explícito (probado con dos empresas).' },
  'modules/exports/exports.routes.js': { max: 2, why: 'Auditoría de la descarga con el companyId del trabajo.' },
  'modules/reports/reports.routes.js': { max: 2, why: 'Lee el nombre de la empresa del contexto (Company no tiene companyId).' },
  'modules/config/config.service.js': { max: 2, why: 'Lee el nombre de la empresa del contexto (Company no tiene companyId).' },
  'modules/ecf/ecf.config.service.js': { max: 2, why: 'Company no tiene companyId; el resto de la configuración e-CF usa prisma con contexto.' },
  'modules/ecf/ecf.issue.js': { max: 2, why: 'Lee la fila de Company de la empresa de la venta.' },
  'modules/ecf/ecf.token.service.js': { max: 4, why: 'Credenciales y auditoría de uso del certificado: siempre por companyId explícito (token por empresa).' },
  'modules/ecf/ecf.directory.service.js': { max: 2, why: 'Lee el ambiente de UNA empresa por companyId.' },
  'modules/ecf/ecf.delivery.js': { max: 5, why: 'Trabajo en segundo plano de entrega de e-CF: todas las consultas llevan el companyId del documento.' },
  'modules/ecf/ecf.outbox.js': { max: 9, why: 'Cola de envío a la DGII: recorre documentos de todas las empresas; cada escritura lleva el companyId del documento.' },
  'modules/ecf/ecf.receiver.service.js': { max: 7, why: 'Receptor público de e-CF: identifica a la empresa por RNC (sin sesión) y guarda con su companyId.' },
};

/** SQL directo permitido (no se aísla por empresa): solo lo que no toca datos de negocio. */
const RAW_SQL_ALLOWED = {
  'server.js': { max: 1, why: 'SELECT 1 para comprobar la conexión a la base de datos.' },
};

const BASE = /\bbasePrisma\b/g;
const RAW = /\$(?:queryRaw|queryRawUnsafe|executeRaw|executeRawUnsafe)\b/g;

function* walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'sim' || entry.name === 'xsd') continue;
      yield* walk(full);
    } else if (entry.name.endsWith('.js') && !entry.name.endsWith('.test.js')) {
      yield full;
    }
  }
}

const violations = [];
const notes = [];
const seen = new Set();

for (const file of walk(API_SRC)) {
  const rel = path.relative(API_SRC, file).split(path.sep).join('/');
  // Se ignoran los comentarios de línea y de bloque para no contar menciones en texto
  const code = fs.readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const base = (code.match(BASE) || []).length;
  const raw = (code.match(RAW) || []).length;
  if (base) {
    seen.add(rel);
    const allowed = BASE_PRISMA_ALLOWED[rel];
    if (!allowed) violations.push(`${rel}: usa basePrisma ${base} vez/veces y no está en la lista permitida (BASE_PRISMA_ALLOWED)`);
    else if (base > allowed.max) violations.push(`${rel}: usa basePrisma ${base} veces; la lista permite ${allowed.max}. Revise los usos nuevos (¿filtran por companyId?) y actualice el número con el motivo`);
    else if (base < allowed.max - 3) notes.push(`${rel}: la lista permite ${allowed.max} usos de basePrisma y hay ${base}; puede bajar el número`);
  }
  if (raw) {
    const allowed = RAW_SQL_ALLOWED[rel];
    if (!allowed) violations.push(`${rel}: usa SQL directo ($queryRaw/$executeRaw...) ${raw} vez/veces y no está en la lista permitida (RAW_SQL_ALLOWED). El SQL directo NO se aísla por empresa`);
    else if (raw > allowed.max) violations.push(`${rel}: usa SQL directo ${raw} veces; la lista permite ${allowed.max}`);
  }
}
for (const rel of Object.keys(BASE_PRISMA_ALLOWED)) if (!seen.has(rel) && !fs.existsSync(path.join(API_SRC, rel))) notes.push(`${rel}: está en la lista permitida pero el archivo ya no existe; quítelo`);

if (notes.length) console.log('Notas:\n' + notes.map(n => '  · ' + n).join('\n') + '\n');
if (violations.length) {
  console.error('GUARDIA DE AISLAMIENTO: FALLÓ\n' + violations.map(v => '  ✗ ' + v).join('\n'));
  console.error('\nSi el uso es legítimo, agréguelo a la lista de scripts/check-tenant-safety.mjs con el motivo. Si no, use `prisma` (con contexto de empresa).');
  process.exit(1);
}
console.log(`Guardia de aislamiento: OK (${seen.size} archivos usan basePrisma, todos en la lista permitida; SQL directo solo donde se permitió).`);
