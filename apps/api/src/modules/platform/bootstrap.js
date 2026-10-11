import { basePrisma } from '../../config/db.js';
import { initializeNCFSequences } from '../../shared/utils/ncf.js';

/**
 * Datos mínimos que toda empresa nueva necesita para poder vender desde el primer minuto:
 * secuencias de comprobantes, el cliente "Consumidor Final" (el POS lo usa por defecto) y una categoría general.
 * Es idempotente: se puede ejecutar más de una vez sobre la misma empresa.
 */
export async function bootstrapCompany(companyId) {
  await initializeNCFSequences(companyId);

  await basePrisma.customer.upsert({
    where: { companyId_documentId: { companyId, documentId: '000000000' } },
    update: {},
    create: { companyId, documentId: '000000000', name: 'Consumidor Final' },
  });

  await basePrisma.category.upsert({
    where: { companyId_name: { companyId, name: 'General' } },
    update: {},
    create: { companyId, name: 'General', description: 'Productos sin una categoría específica' },
  });
}
