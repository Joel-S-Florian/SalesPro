import { basePrisma } from '../../config/db.js';
import { initializeNCFSequences } from '../../shared/utils/ncf.js';

export const DEFAULT_SUPPLIER_NAME = 'Proveedor general';

/**
 * Datos mínimos que toda empresa nueva necesita para poder vender desde el primer minuto:
 * secuencias de comprobantes, el cliente "Consumidor Final" (el POS lo usa por defecto), el «Proveedor general» y una categoría general.
 * Es idempotente: se puede ejecutar más de una vez sobre la misma empresa.
 */
export async function bootstrapCompany(companyId) {
  await initializeNCFSequences(companyId);

  await basePrisma.customer.upsert({
    where: { companyId_documentId: { companyId, documentId: '000000000' } },
    update: {},
    create: { companyId, documentId: '000000000', name: 'Consumidor Final' },
  });

  if (!(await basePrisma.supplier.findFirst({ where: { companyId, isDefault: true } }))) {
    await basePrisma.supplier.create({ data: { companyId, name: DEFAULT_SUPPLIER_NAME, isDefault: true, paymentTerms: 'Contado' } });
  }

  await basePrisma.category.upsert({
    where: { companyId_name: { companyId, name: 'General' } },
    update: {},
    create: { companyId, name: 'General', description: 'Productos sin una categoría específica' },
  });
}
