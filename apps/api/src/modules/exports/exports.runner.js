import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { finished } from 'node:stream/promises';
import archiver from 'archiver';
import { basePrisma } from '../../config/db.js';
import { logger } from '../../shared/utils/logger.js';
import { EXPORT_TYPES, TABLES, columnsOf, delegateOf } from './exports.tables.js';
import { csvHeader, csvLine, jsonRow } from './exports.format.js';

export const EXPORT_DIR = path.resolve(process.env.EXPORT_DIR || path.join(process.cwd(), 'storage', 'exports'));
export const EXPORT_TTL_HOURS = Number(process.env.EXPORT_TTL_HOURS) || 48;
const BATCH = 1000;

const cancelled = new Set();
export const requestCancel = id => cancelled.add(id);
class CancelledError extends Error {}

/** Condición que limita una tabla a los datos de UNA empresa (siempre explícita: aquí no hay contexto automático). */
const whereFor = (table, companyId) => (TABLES[table].scope === 'id' ? { id: companyId } : { companyId });

async function countRows(table, companyId) {
  return basePrisma[delegateOf(table)].count({ where: whereFor(table, companyId) });
}

/** Recorre una tabla por lotes con cursor: nunca carga todo en memoria. */
async function* rowsOf(table, companyId, jobId) {
  const delegate = basePrisma[delegateOf(table)];
  const where = whereFor(table, companyId);
  if (TABLES[table].noId) {
    yield* await delegate.findMany({ where, orderBy: { key: 'asc' } });
    return;
  }
  let cursor;
  for (;;) {
    if (cancelled.has(jobId)) throw new CancelledError();
    const rows = await delegate.findMany({ where, orderBy: { id: 'asc' }, take: BATCH, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}) });
    if (rows.length === 0) return;
    yield* rows;
    cursor = rows.at(-1).id;
    if (rows.length < BATCH) return;
  }
}

function tableStream(table, { companyId, jobId, format, onRow }) {
  const columns = columnsOf(table);
  async function* generate() {
    if (format === 'JSON') {
      yield '[\n';
      let first = true;
      for await (const row of rowsOf(table, companyId, jobId)) {
        yield (first ? '' : ',\n') + jsonRow(columns, row);
        first = false;
        onRow();
      }
      yield '\n]\n';
    } else {
      yield csvHeader(columns);
      let buffer = '';
      let n = 0;
      for await (const row of rowsOf(table, companyId, jobId)) {
        buffer += csvLine(columns, row);
        onRow();
        if (++n % 500 === 0) {
          yield buffer;
          buffer = '';
        }
      }
      if (buffer) yield buffer;
    }
  }
  return Readable.from(generate());
}

/** Ejecuta un trabajo: escribe el ZIP en disco por tablas, con progreso. Devuelve { filePath, fileSize, counts }. */
export async function runExport(job) {
  const { id, companyId, type, format } = job;
  const spec = EXPORT_TYPES[type];
  const dir = path.join(EXPORT_DIR, companyId);
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, `${id}.zip`);

  const counts = {};
  for (const table of spec.tables) counts[table] = await countRows(table, companyId);
  const rowsTotal = Object.values(counts).reduce((a, b) => a + b, 0);
  await basePrisma.exportJob.update({ where: { id }, data: { rowsTotal, rowsDone: 0, progress: 0 } });

  const output = fs.createWriteStream(filePath);
  const archive = archiver('zip', { zlib: { level: 6 } });
  archive.pipe(output);
  output.on('error', err => archive.emit('error', err)); // disco lleno o archivo destruido al cancelar: detiene el ZIP sin tumbar el proceso
  const failed = new Promise((_, reject) => archive.on('error', reject));
  failed.catch(() => {}); // evita «unhandled rejection» si el error llega antes de esperar el resultado

  let done = 0;
  let lastReport = 0;
  const onRow = () => {
    done += 1;
    const now = Date.now();
    if (now - lastReport > 1000) {
      lastReport = now;
      void basePrisma.exportJob
        .update({ where: { id }, data: { rowsDone: done, progress: rowsTotal ? Math.min(99, Math.floor((done / rowsTotal) * 100)) : 0 } })
        .catch(() => {});
    }
  };

  try {
    const ext = format === 'JSON' ? 'json' : 'csv';
    for (const table of spec.tables) {
      const stream = tableStream(table, { companyId, jobId: id, format, onRow });
      // Un error al leer una tabla (o una cancelación) debe detener el ZIP, no tumbar el proceso
      stream.on('error', err => archive.emit('error', err));
      archive.append(stream, { name: `${table}.${ext}` });
    }
    const company = await basePrisma.company.findUnique({ where: { id: companyId }, select: { name: true } });
    archive.append(readme({ company: company?.name, type, format, counts }), { name: 'LEEME.txt' });
    archive.append(JSON.stringify({ exportedAt: new Date().toISOString(), type, format, tables: counts }, null, 2), { name: 'manifest.json' });
    await Promise.race([archive.finalize().then(() => finished(output)), failed]);
  } catch (err) {
    archive.unpipe(output);
    archive.abort();
    output.destroy();
    fs.rmSync(filePath, { force: true });
    throw err;
  } finally {
    cancelled.delete(id);
  }
  return { filePath, fileSize: fs.statSync(filePath).size, counts, rowsDone: done };
}

function readme({ company, type, format, counts }) {
  const lines = [
    `Exportación de datos de FACTOS`,
    `Empresa: ${company || '—'}`,
    `Tipo: ${EXPORT_TYPES[type].label} · Formato: ${format}`,
    `Generada: ${new Date().toISOString()}`,
    '',
    'Contenido (filas por archivo):',
    ...Object.entries(counts).map(([table, n]) => `  ${table}: ${n}`),
    '',
    'Notas:',
    '- Las fechas están en UTC (formato ISO 8601).',
    '- En los CSV, los textos que empiezan con = + - @ llevan un apóstrofe al inicio para que Excel no los ejecute como fórmulas.',
    '- Por seguridad no se incluyen contraseñas, sesiones, certificados digitales ni claves de pasarelas de pago.',
    '- Este archivo contiene datos personales y comerciales de su negocio: guárdelo en un lugar seguro.',
  ];
  return lines.join('\r\n') + '\r\n';
}

/** Borra el archivo de un trabajo (si existe). */
export function removeFile(filePath) {
  try {
    if (filePath) fs.rmSync(filePath, { force: true });
  } catch (err) {
    logger.warn(`No se pudo borrar ${filePath}: ${err.message}`);
  }
}

export { CancelledError };
