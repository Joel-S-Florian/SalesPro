import { createHmac, timingSafeEqual } from 'node:crypto';
import { basePrisma, prisma } from '../../config/db.js';
import { getTenantId } from '../../config/tenant.js';
import { AppError } from '../../shared/exceptions/AppError.js';
import { env } from '../../config/env.js';
import { logger } from '../../shared/utils/logger.js';
import { assertFeature, getCompanyPlanState } from '../../shared/plans.js';
import { minPlanForFeature, planHasFeature } from '@factos/shared/plans.js';
import { EXPORT_TYPES } from './exports.tables.js';
import { CancelledError, EXPORT_TTL_HOURS, removeFile, requestCancel, runExport } from './exports.runner.js';

const MAX_PER_DAY = 10;
const ACTIVE = ['PENDING', 'RUNNING'];

const publicJob = job => ({
  id: job.id,
  type: job.type,
  label: EXPORT_TYPES[job.type]?.label || job.type,
  format: job.format,
  status: job.status,
  progress: job.progress,
  rowsDone: job.rowsDone,
  rowsTotal: job.rowsTotal,
  fileName: job.fileName,
  fileSize: job.fileSize,
  error: job.error,
  userName: job.userName,
  createdAt: job.createdAt,
  finishedAt: job.finishedAt,
  expiresAt: job.expiresAt,
});

/** Qué puede pedir la empresa: tipos, formatos y a qué plan pertenece cada función. */
export async function getOptions() {
  const { effectivePlan } = await getCompanyPlanState();
  return {
    ttlHours: EXPORT_TTL_HOURS,
    types: Object.entries(EXPORT_TYPES).map(([type, spec]) => ({
      type,
      label: spec.label,
      tables: spec.tables.length,
      // El CSV básico (ventas, productos, clientes) está siempre disponible, en cualquier estado del plan
      minPlan: spec.feature ? minPlanForFeature(spec.feature) : 'FREE',
      allowed: spec.feature ? planHasFeature(effectivePlan, spec.feature) : true,
    })),
    jsonAllowed: planHasFeature(effectivePlan, 'fullBackup'),
  };
}

export async function listJobs() {
  const jobs = await prisma.exportJob.findMany({ orderBy: { createdAt: 'desc' }, take: 20 });
  return jobs.map(publicJob);
}

export async function getJob(id) {
  const job = await prisma.exportJob.findUnique({ where: { id } });
  if (!job) throw AppError.notFound('Exportación no encontrada');
  return job;
}

export async function createJob(requester, { type, format }) {
  const spec = EXPORT_TYPES[type];
  if (!spec) throw AppError.badRequest('Tipo de exportación no válido');
  // Respaldo completo y formato JSON: desde el plan que incluye el respaldo completo. El CSV básico siempre se puede.
  if (spec.feature) await assertFeature(spec.feature);
  else if (format === 'JSON') await assertFeature('fullBackup');

  if (await prisma.exportJob.findFirst({ where: { status: { in: ACTIVE } } })) {
    throw AppError.conflict('Ya hay una exportación en curso. Espera a que termine o cancélala');
  }
  const today = await prisma.exportJob.count({ where: { createdAt: { gte: new Date(Date.now() - 24 * 3600 * 1000) } } });
  if (today >= MAX_PER_DAY) throw AppError.tooManyRequests(`Máximo ${MAX_PER_DAY} exportaciones por día`);

  const job = await prisma.exportJob.create({
    data: { type, format, userId: requester.userId, userName: requester.fullName || requester.username || 'Usuario' },
  });
  kick();
  return publicJob(job);
}

/** Cancela una exportación en curso, o borra el archivo y el registro de una terminada. */
export async function removeJob(id) {
  const job = await getJob(id);
  if (ACTIVE.includes(job.status)) {
    requestCancel(id);
    await basePrisma.exportJob.update({ where: { id }, data: { status: 'CANCELLED', finishedAt: new Date(), error: 'Cancelada por el usuario' } });
    return { ok: true, cancelled: true };
  }
  removeFile(job.filePath);
  await basePrisma.exportJob.delete({ where: { id } });
  return { ok: true };
}

// --- Enlaces de descarga firmados: el navegador descarga directo (en streaming), sin cargar el archivo en memoria ---
const sign = payload => createHmac('sha256', env.JWT_SECRET).update(`export:${payload}`).digest('base64url');

export function downloadToken(jobId, ttlSeconds = 120) {
  const payload = `${jobId}.${Math.floor(Date.now() / 1000) + ttlSeconds}`;
  return `${payload}.${sign(payload)}`;
}

/** Valida el enlace y devuelve el trabajo (de cualquier empresa: el enlace ya lo emitió un administrador de esa empresa). */
export async function jobFromToken(jobId, token) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3 || parts[0] !== jobId) throw AppError.unauthorized('Enlace de descarga no válido');
  const payload = `${parts[0]}.${parts[1]}`;
  const expected = Buffer.from(sign(payload));
  const given = Buffer.from(parts[2]);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) throw AppError.unauthorized('Enlace de descarga no válido');
  if (Number(parts[1]) < Date.now() / 1000) throw AppError.unauthorized('El enlace de descarga venció. Genera uno nuevo');
  const job = await basePrisma.exportJob.findUnique({ where: { id: jobId } });
  if (!job || job.status !== 'DONE' || !job.filePath) throw AppError.notFound('El archivo ya no está disponible');
  if (job.expiresAt && job.expiresAt < new Date()) throw AppError.notFound('El archivo venció. Genera una exportación nueva');
  return job;
}

// --- Cola: un trabajo a la vez en todo el servidor ---
let running = null;

/** Procesa los trabajos pendientes. Si ya se está procesando, devuelve la misma promesa (así se puede esperar a que termine). */
export function kick() {
  if (!running) running = processQueue().finally(() => (running = null));
  return running;
}

async function processQueue() {
  {
    for (;;) {
      const job = await basePrisma.exportJob.findFirst({ where: { status: 'PENDING' }, orderBy: { createdAt: 'asc' } });
      if (!job) break;
      await basePrisma.exportJob.updateMany({ where: { id: job.id, status: 'PENDING' }, data: { status: 'RUNNING', startedAt: new Date() } });
      try {
        const result = await runExport(job);
        const still = await basePrisma.exportJob.findUnique({ where: { id: job.id }, select: { status: true } });
        if (still?.status === 'CANCELLED') {
          removeFile(result.filePath);
          continue;
        }
        // updateMany: si el registro ya no existe (alguien lo borró) no es un error; el archivo huérfano se descarta
        const saved = await basePrisma.exportJob.updateMany({
          where: { id: job.id, status: 'RUNNING' },
          data: {
            status: 'DONE',
            progress: 100,
            rowsDone: result.rowsDone,
            filePath: result.filePath,
            fileSize: result.fileSize,
            fileName: `factos-${job.type.toLowerCase()}-${new Date().toISOString().slice(0, 10)}.zip`,
            finishedAt: new Date(),
            expiresAt: new Date(Date.now() + EXPORT_TTL_HOURS * 3600 * 1000),
          },
        });
        if (saved.count === 0) removeFile(result.filePath);
      } catch (err) {
        const wasCancelled = err instanceof CancelledError || (await basePrisma.exportJob.findUnique({ where: { id: job.id }, select: { status: true } }))?.status === 'CANCELLED';
        if (!wasCancelled) {
          logger.error(`Exportación ${job.id} falló: ${err.message}`);
          await basePrisma.exportJob.updateMany({ where: { id: job.id }, data: { status: 'FAILED', error: 'No se pudo generar el archivo. Intenta de nuevo', finishedAt: new Date() } });
        }
      }
    }
  }
}

/** Borra los archivos vencidos y los de trabajos cancelados o fallidos. */
export async function cleanupExpired() {
  const expired = await basePrisma.exportJob.findMany({ where: { status: 'DONE', expiresAt: { lt: new Date() } } });
  for (const job of expired) {
    removeFile(job.filePath);
    await basePrisma.exportJob.update({ where: { id: job.id }, data: { status: 'EXPIRED', filePath: null } });
  }
  return expired.length;
}

let timer;
/** Al arrancar: retoma lo que quedó a medias y programa la limpieza. */
export async function startExportWorker() {
  await basePrisma.exportJob.updateMany({ where: { status: 'RUNNING' }, data: { status: 'PENDING' } });
  void kick();
  void cleanupExpired().catch(() => {});
  timer = setInterval(() => {
    void cleanupExpired().catch(() => {});
    void kick();
  }, 15 * 60 * 1000);
  timer.unref?.();
}

export const stopExportWorker = () => clearInterval(timer);
