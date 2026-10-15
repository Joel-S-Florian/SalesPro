import express from 'express';
import fs from 'node:fs';
import { z } from 'zod';
import * as service from './exports.service.js';
import { authenticate } from '../../shared/middleware/auth.js';
import { authorize } from '../../shared/middlewares/authorize.js';
import { validate } from '../../shared/middleware/validate.js';
import { asyncHandler } from '../../shared/utils/asyncHandler.js';
import { basePrisma, prisma } from '../../config/db.js';
import { logger } from '../../shared/utils/logger.js';
import { createDecryptStream, plainSizeOf } from './exports.crypto.js';

const router = express.Router();

const idSchema = { params: z.object({ id: z.string().cuid() }) };
const createSchema = {
  body: z.object({
    type: z.enum(['SALES', 'PRODUCTS', 'CUSTOMERS', 'FULL']),
    format: z.enum(['CSV', 'JSON']).default('CSV'),
  }),
};

/**
 * Descarga con enlace firmado y de corta vida (lo emite POST /:id/link a un administrador):
 * el navegador la baja directo, en streaming. Va ANTES de `authenticate` a propósito.
 */
router.get(
  '/:id/file',
  validate({ params: z.object({ id: z.string().cuid() }), query: z.object({ t: z.string().min(10).max(300) }) }),
  asyncHandler(async (req, res) => {
    const job = await service.jobFromToken(req.params.id, req.query.t);
    if (!fs.existsSync(job.filePath)) return res.status(404).json({ error: 'El archivo ya no está disponible' });
    await basePrisma.auditLog.create({
      data: { companyId: job.companyId, userId: job.auto ? null : job.userId, action: 'EXPORT_DOWNLOAD', entity: 'export', entityId: job.id, newData: { type: job.type, format: job.format, auto: job.auto }, ipAddress: req.ip, userAgent: req.headers['user-agent'] },
    }).catch(err => logger.warn(`Auditoría de descarga falló: ${err.message}`));
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${job.fileName || 'exportacion.zip'}"`);
    res.setHeader('Cache-Control', 'private, no-store');
    if (job.encrypted) {
      // Respaldo automático: se guarda cifrado y se descifra al vuelo; si el archivo fue alterado el flujo falla y se corta la descarga
      res.setHeader('Content-Length', String(plainSizeOf(fs.statSync(job.filePath).size)));
      const plain = createDecryptStream(job.filePath);
      plain.on('error', err => {
        logger.error(`Respaldo ${job.id} no se pudo descifrar: ${err.message}`);
        res.destroy(err);
      });
      return plain.pipe(res);
    }
    res.setHeader('Content-Length', String(fs.statSync(job.filePath).size));
    fs.createReadStream(job.filePath).pipe(res);
  })
);

router.use(authenticate, authorize('ADMINISTRADOR'));

router.get('/options', asyncHandler(async (req, res) => res.json(await service.getOptions())));
router.get('/', asyncHandler(async (req, res) => res.json({ data: await service.listJobs() })));

router.post(
  '/',
  validate(createSchema),
  asyncHandler(async (req, res) => {
    const job = await service.createJob({ userId: req.user.userId, fullName: req.user.fullName, username: req.user.username }, req.body);
    res.status(202).json(job);
  })
);

router.get(
  '/:id',
  validate(idSchema),
  asyncHandler(async (req, res) => {
    const job = await service.getJob(req.params.id);
    res.json((await service.listJobs()).find(j => j.id === job.id) || null);
  })
);

router.post(
  '/:id/link',
  validate(idSchema),
  asyncHandler(async (req, res) => {
    const job = await service.getJob(req.params.id);
    if (job.status !== 'DONE') return res.status(409).json({ error: 'La exportación todavía no está lista' });
    if (job.auto) {
      // El archivo lo generó el sistema: queda registrado quién pidió el enlace de descarga
      await prisma.auditLog.create({ data: { userId: req.user.userId, action: 'AUTO_BACKUP_LINK', entity: 'export', entityId: job.id } }).catch(() => {});
    }
    res.json({ url: `/api/exports/${job.id}/file?t=${service.downloadToken(job.id)}` });
  })
);

router.delete('/:id', validate(idSchema), asyncHandler(async (req, res) => res.json(await service.removeJob(req.params.id))));

export default router;
