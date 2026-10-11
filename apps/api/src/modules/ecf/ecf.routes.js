import express from 'express';
import { z } from 'zod';
import { authenticate } from '../../shared/middleware/auth.js';
import { authorize } from '../../shared/middlewares/authorize.js';
import { validate } from '../../shared/middleware/validate.js';
import { auditLog } from '../../shared/middleware/audit.js';
import { asyncHandler } from '../../shared/utils/asyncHandler.js';
import { ECF_TYPE_CODES } from './ecf.constants.js';
import * as service from './ecf.config.service.js';
import * as documents from './ecf.service.js';
import * as approvals from './ecf.approval.service.js';
import * as directory from './ecf.directory.service.js';
import { voidRanges } from './ecf.void.service.js';

/**
 * Configuración de la facturación electrónica de la empresa (solo administradores).
 * Las respuestas nunca incluyen el certificado, su contraseña ni el token.
 * El auditor registra las respuestas; por eso no se devuelve ningún secreto.
 */
const router = express.Router();

// Estado del comprobante de una venta: lo consulta también el cajero (solo de sus propias ventas) tras cobrar
router.get(
  '/sales/:saleId/status',
  authenticate,
  authorize('ADMINISTRADOR', 'VENDEDOR'),
  validate({ params: z.object({ saleId: z.string().min(1).max(64) }) }),
  asyncHandler(async (req, res) => res.json(await documents.getSaleStatus(req.params.saleId, req.user)))
);

// Consultar en la DGII si un cliente es emisor electrónico (administradores y vendedores, como la gestión de clientes)
router.post(
  '/customers/:id/check',
  authenticate,
  authorize('ADMINISTRADOR', 'VENDEDOR'),
  validate({ params: z.object({ id: z.string().min(1).max(64) }), body: z.object({ force: z.boolean().optional() }).optional() }),
  asyncHandler(async (req, res) => res.json(await directory.checkCustomer(req.params.id, { force: Boolean(req.body?.force) })))
);

// Todo lo demás es solo para administradores
router.use(authenticate, authorize('ADMINISTRADOR'));

const optionalText = max => z.string().trim().max(max).optional();
const idParams = z.object({ id: z.string().min(1).max(64) });
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}/, 'Fecha no válida');

const configSchema = {
  body: z.object({
    mode: z.enum(['OFF', 'PRECERT', 'CERT', 'PROD']).optional(),
    legalName: optionalText(150),
    tradeName: optionalText(150),
    address: optionalText(250),
    municipalityCode: optionalText(10),
    provinceCode: optionalText(10),
    economicActivity: optionalText(150),
  }),
};

const certificateSchema = {
  body: z.object({
    fileBase64: z.string().min(1, 'Seleccione el archivo del certificado').max(400000),
    password: z.string().min(1, 'Escriba la contraseña del certificado').max(200),
  }),
};

const sequenceSchema = {
  body: z.object({
    ecfType: z.enum(ECF_TYPE_CODES),
    rangeFrom: z.number().int().min(1).default(1),
    rangeTo: z.number().int().min(1),
    validUntil: date.nullish(),
  }),
};

const sequenceUpdateSchema = {
  params: idParams,
  body: z.object({ active: z.boolean().optional(), validUntil: date.nullish(), rangeTo: z.number().int().min(1).optional() }),
};

router.get('/config', asyncHandler(async (_req, res) => res.json(await service.getConfig())));

router.put('/config', validate(configSchema), auditLog('UPDATE_ECF_CONFIG', 'ecf_config'), asyncHandler(async (req, res) => res.json(await service.updateConfig(req.body))));

router.post('/certificate', validate(certificateSchema), auditLog('UPLOAD_ECF_CERTIFICATE', 'ecf_config'), asyncHandler(async (req, res) => res.status(201).json(await service.uploadCertificate(req.body))));

router.delete('/certificate', auditLog('REMOVE_ECF_CERTIFICATE', 'ecf_config'), asyncHandler(async (_req, res) => res.json(await service.removeCertificate())));

router.post('/test-connection', auditLog('TEST_ECF_CONNECTION', 'ecf_config'), asyncHandler(async (_req, res) => res.json(await service.testConnection())));

router.get('/sequences', asyncHandler(async (_req, res) => res.json(await service.listSequences())));

router.post('/sequences', validate(sequenceSchema), auditLog('CREATE_ECF_SEQUENCE', 'ecf_sequence'), asyncHandler(async (req, res) => res.status(201).json(await service.createSequence(req.body))));

router.put('/sequences/:id', validate(sequenceUpdateSchema), auditLog('UPDATE_ECF_SEQUENCE', 'ecf_sequence'), asyncHandler(async (req, res) => res.json(await service.updateSequence(req.params.id, req.body))));

router.delete('/sequences/:id', validate({ params: idParams }), auditLog('DELETE_ECF_SEQUENCE', 'ecf_sequence'), asyncHandler(async (req, res) => res.json(await service.deleteSequence(req.params.id))));

/* ---- Comprobantes emitidos ---- */
const saleParams = z.object({ saleId: z.string().min(1).max(64) });

router.get('/summary', asyncHandler(async (_req, res) => res.json(await documents.getSummary())));

router.get(
  '/documents',
  validate({
    query: z.object({
      status: z.enum(['PENDING', 'SENT', 'ACCEPTED', 'CONDITIONAL', 'REJECTED', 'ERROR', 'CONTINGENCY']).optional(),
      page: z.coerce.number().int().positive().default(1),
      limit: z.coerce.number().int().positive().max(100).default(20),
    }),
  }),
  asyncHandler(async (req, res) => res.json(await documents.listDocuments(req.query)))
);

router.get('/sales/:saleId', validate({ params: saleParams }), asyncHandler(async (req, res) => res.json(await documents.getSaleEcf(req.params.saleId))));

router.get(
  '/sales/:saleId/xml',
  validate({ params: saleParams, query: z.object({ kind: z.enum(['ECF', 'RFCE']).default('ECF') }) }),
  asyncHandler(async (req, res) => {
    const { fileName, xml } = await documents.getDocumentXml(req.params.saleId, req.query.kind);
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.send(xml);
  })
);

router.post('/sales/:saleId/retry', validate({ params: saleParams }), auditLog('RETRY_ECF', 'sale'), asyncHandler(async (req, res) => res.json(await documents.retrySale(req.params.saleId))));

/* ---- Anulación de rangos de e-NCF no utilizados ---- */
router.post(
  '/void-ranges',
  validate({
    body: z.object({
      ranges: z.array(z.object({ ecfType: z.enum(ECF_TYPE_CODES), from: z.number().int().min(1), to: z.number().int().min(1) })).min(1).max(10),
    }),
  }),
  auditLog('VOID_ECF_RANGES', 'ecf_sequence'),
  asyncHandler(async (req, res) => res.json(await voidRanges(req.body.ranges)))
);

/* ---- Comprobantes recibidos de otros emisores ---- */
router.get(
  '/inbox',
  validate({
    query: z.object({
      status: z.enum(['RECIBIDO', 'APROBADO', 'RECHAZADO']).optional(),
      page: z.coerce.number().int().positive().default(1),
      limit: z.coerce.number().int().positive().max(100).default(20),
    }),
  }),
  asyncHandler(async (req, res) => res.json(await approvals.listInbox(req.query)))
);

router.get(
  '/inbox/:id/xml',
  validate({ params: z.object({ id: z.string().min(1).max(64) }) }),
  asyncHandler(async (req, res) => {
    const { fileName, xml } = await approvals.getInboxXml(req.params.id);
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.send(xml);
  })
);

router.post(
  '/inbox/:id/respond',
  validate({
    params: z.object({ id: z.string().min(1).max(64) }),
    body: z.object({ approved: z.boolean(), reason: z.string().trim().max(250).optional() }),
  }),
  auditLog('RESPOND_ECF_INBOX', 'ecf_inbox'),
  asyncHandler(async (req, res) => res.json(await approvals.respondToInbox(req.params.id, req.body)))
);

export default router;
