import { AppError } from '../../shared/exceptions/AppError.js';

/**
 * Asignación de e-NCF desde los rangos que la DGII autorizó a la empresa.
 *
 * Debe llamarse DENTRO de la transacción de la venta (`tx`): el incremento es atómico en la base de datos y, si la
 * transacción se revierte (p. ej. el comprobante no pasa la validación), el número vuelve a quedar disponible,
 * así no se pierden números de la secuencia.
 *
 * @param {Object} tx - cliente Prisma de la transacción (con aislamiento por empresa)
 * @param {'E31'|'E32'|'E33'|'E34'|'E41'|'E43'|'E44'|'E45'|'E46'|'E47'} ecfType
 * @param {Date} [now]
 * @returns {Promise<{ eNcf: string, sequence: Object }>}
 */
export async function allocateENcf(tx, ecfType, now = new Date()) {
  const ranges = await tx.ecfSequence.findMany({ where: { ecfType, active: true }, orderBy: { rangeFrom: 'asc' } });
  const usable = ranges.find(range => range.current < range.rangeTo && (!range.validUntil || range.validUntil >= now));
  if (!usable) {
    const expired = ranges.some(range => range.validUntil && range.validUntil < now);
    throw AppError.badRequest(
      expired && ranges.every(range => range.current >= range.rangeTo || (range.validUntil && range.validUntil < now))
        ? `Los rangos de ${ecfType} están vencidos o agotados. Registre uno nuevo en Configuración → Facturación electrónica.`
        : `No hay números de ${ecfType} disponibles. Registre el rango autorizado por la DGII en Configuración → Facturación electrónica.`
    );
  }

  const updated = await tx.ecfSequence.update({ where: { id: usable.id }, data: { current: { increment: 1 } } });
  if (updated.current > updated.rangeTo) {
    // Otra venta tomó el último número a la vez: se revierte esta transacción
    throw AppError.conflict(`El rango de ${ecfType} se agotó mientras se emitía el comprobante. Intente de nuevo.`);
  }
  return { eNcf: `E${ecfType.slice(1)}${String(updated.current).padStart(10, '0')}`, sequence: updated };
}
