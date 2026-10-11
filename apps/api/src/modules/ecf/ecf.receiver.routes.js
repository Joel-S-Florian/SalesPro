import express from 'express';
import rateLimit from 'express-rate-limit';
import { logger } from '../../shared/utils/logger.js';
import { RECEIVER_PATHS } from './ecf.constants.js';
import { ReceiverError, receiveCommercialApproval, receiveEcf } from './ecf.receiver.service.js';
import { readXmlFromRequest } from './ecf.xml.js';

/**
 * Servicios públicos que la DGII exige a todo emisor electrónico, con la ruta estándar y solo el host propio
 * (aquí, un prefijo por RNC para atender a todas las empresas con el mismo dominio):
 *
 *   POST /ecf-receptor/:rnc/fe/recepcion/api/ecf             recibe un e-CF y responde un ARECF firmado (síncrono)
 *   POST /ecf-receptor/:rnc/fe/aprobacioncomercial/api/ecf   recibe una aprobación comercial (200 / 400)
 *
 * La autenticación por semilla/token es opcional según la DGII y todavía no está habilitada aquí.
 */
const router = express.Router();

router.use(
  rateLimit({
    windowMs: 60 * 1000,
    limit: 120,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Demasiadas solicitudes' },
  })
);
router.use(express.raw({ type: () => true, limit: '2mb' }));

const fail = (res, error) => {
  if (error instanceof ReceiverError) return res.status(error.status).json({ mensaje: error.message });
  logger.error('Error en el receptor de e-CF', { reason: error.message });
  return res.status(500).json({ mensaje: 'No fue posible procesar el comprobante. Intente nuevamente.' });
};

router.post(`/:rnc${RECEIVER_PATHS.reception}`, async (req, res) => {
  try {
    const { arecfXml } = await receiveEcf(req.params.rnc, await readXmlFromRequest(req));
    res.status(200).type('application/xml').send(arecfXml);
  } catch (error) {
    fail(res, error);
  }
});

router.post(`/:rnc${RECEIVER_PATHS.commercialApproval}`, async (req, res) => {
  try {
    const result = await receiveCommercialApproval(req.params.rnc, await readXmlFromRequest(req));
    res.status(200).json({ mensaje: ['Aprobación comercial recibida'], estado: result.approved ? 'Aprobación comercial aprobada' : 'Aprobación comercial rechazada', codigo: result.approved ? '1' : '2' });
  } catch (error) {
    fail(res, error);
  }
});

export default router;
