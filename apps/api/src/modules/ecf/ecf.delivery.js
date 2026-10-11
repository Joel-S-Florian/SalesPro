import { basePrisma } from '../../config/db.js';
import { logger } from '../../shared/utils/logger.js';
import { lookupDirectory } from './ecf.directory.service.js';

/**
 * Entrega del e-CF aceptado por la DGII al comprador, cuando este también es emisor electrónico.
 * Orden de la DGII: primero a la DGII y luego al receptor.
 */

const STALE_MS = 24 * 60 * 60 * 1000;
const digits = value => String(value ?? '').replace(/\D/g, '');

/** Crea (si corresponde) el documento de entrega para un e-CF recién aceptado. Nunca lanza. */
export async function scheduleDelivery(doc) {
  try {
    if (!doc.saleId || doc.kind !== 'ECF') return null;
    const sale = await basePrisma.sale.findUnique({ where: { id: doc.saleId }, select: { customerId: true } });
    const customer = sale && (await basePrisma.customer.findUnique({ where: { id: sale.customerId } }));
    if (!customer) return null;

    const rnc = digits(customer.rnc || customer.documentId);
    if (!/^(\d{9}|\d{11})$/.test(rnc) || rnc === '000000000') return null;

    let isIssuer = customer.ecfIssuer;
    let target = customer.ecfReceptionUrl;
    const stale = !customer.ecfDirectoryCheckedAt || Date.now() - customer.ecfDirectoryCheckedAt.getTime() > STALE_MS;
    if (isIssuer === null || isIssuer === undefined || stale) {
      const result = await lookupDirectory(doc.companyId, rnc);
      if (!result.supported) return null;
      isIssuer = result.isIssuer;
      target = result.receptionUrl || null;
      await basePrisma.customer.update({
        where: { id: customer.id },
        data: { ecfIssuer: result.isIssuer, ecfReceptionUrl: target, ecfApprovalUrl: result.approvalUrl || null, ecfDirectoryCheckedAt: new Date() },
      });
    }
    if (!isIssuer || !target) return null;

    return await basePrisma.ecfDocument.upsert({
      where: { saleId_kind: { saleId: doc.saleId, kind: 'DELIVERY' } },
      update: {},
      create: { companyId: doc.companyId, saleId: doc.saleId, kind: 'DELIVERY', eNcf: doc.eNcf, xml: doc.xml, status: 'PENDING', target },
    });
  } catch (error) {
    logger.warn('No se pudo programar la entrega del e-CF al comprador', { documentId: doc.id, reason: error.message });
    return null;
  }
}
