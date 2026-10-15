import { basePrisma } from '../../config/db.js';
import { logger } from '../../shared/utils/logger.js';
import { AUTO_BACKUP_FREQUENCY, AUTO_BACKUP_KEEP, BACKUP_FREQUENCY_DAYS, getEffectivePlan, planHasFeature } from '@factos/shared/plans.js';
import { removeFile } from './exports.runner.js';

/** Frecuencia vigente: BACKUP_FREQUENCY (daily | weekly) del servidor, o el valor único de packages/shared/plans.js. */
export function backupFrequency() {
  const fromEnv = String(process.env.BACKUP_FREQUENCY || '').toLowerCase();
  return BACKUP_FREQUENCY_DAYS[fromEnv] ? fromEnv : AUTO_BACKUP_FREQUENCY;
}

/** Cuántos respaldos automáticos se conservan por empresa (BACKUP_KEEP o el valor único). */
export function backupKeep() {
  const n = Number(process.env.BACKUP_KEEP);
  return Number.isInteger(n) && n >= 1 ? n : AUTO_BACKUP_KEEP;
}

const SYSTEM_USER = { userId: 'system', userName: 'Sistema' };
// Margen para que el reloj horario no retrase el siguiente respaldo un día entero
const SLACK_MS = 10 * 60 * 1000;

/**
 * Crea un respaldo automático pendiente por cada empresa cuyo plan efectivo lo incluye y que ya lo necesita.
 * Siempre con `companyId` explícito (aquí no hay contexto de empresa). Devuelve los ids de las empresas programadas.
 */
export async function scheduleAutoBackups(now = new Date()) {
  const intervalMs = BACKUP_FREQUENCY_DAYS[backupFrequency()] * 24 * 3600 * 1000 - SLACK_MS;
  const companies = await basePrisma.company.findMany({ where: { active: true }, select: { id: true, plan: true, trialEndsAt: true, paidUntil: true } });
  const scheduled = [];
  for (const company of companies) {
    const { effectivePlan } = getEffectivePlan(company, now);
    if (!planHasFeature(effectivePlan, 'autoBackup')) continue;
    const last = await basePrisma.exportJob.findFirst({ where: { companyId: company.id, auto: true, status: { in: ['PENDING', 'RUNNING', 'DONE'] } }, orderBy: { createdAt: 'desc' }, select: { createdAt: true } });
    if (last && now.getTime() - last.createdAt.getTime() < intervalMs) continue;
    const job = await basePrisma.exportJob.create({
      data: { companyId: company.id, type: 'FULL', format: 'CSV', auto: true, ...SYSTEM_USER },
    });
    await basePrisma.auditLog
      .create({ data: { companyId: company.id, action: 'AUTO_BACKUP_SCHEDULED', entity: 'export', entityId: job.id, newData: { frequency: backupFrequency() } } })
      .catch(err => logger.warn(`Auditoría del respaldo automático falló: ${err.message}`));
    scheduled.push(company.id);
  }
  return scheduled;
}

/** Deja solo los últimos N respaldos automáticos terminados de una empresa; borra archivo y registro de los demás. */
export async function pruneAutoBackups(companyId, keep = backupKeep()) {
  const done = await basePrisma.exportJob.findMany({ where: { companyId, auto: true, status: 'DONE' }, orderBy: { createdAt: 'desc' }, select: { id: true, filePath: true } });
  const extra = done.slice(keep);
  for (const job of extra) {
    removeFile(job.filePath);
    await basePrisma.exportJob.delete({ where: { id: job.id } });
  }
  return extra.length;
}
