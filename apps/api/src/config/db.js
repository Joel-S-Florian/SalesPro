import { PrismaClient } from '@prisma/client';
import { getTenantId } from './tenant.js';

const globalForPrisma = globalThis;

/**
 * Cliente sin aislamiento por empresa. Úsese SOLO en rutas de plataforma (super-admin), en el login
 * y en tareas de sistema. Todo lo demás debe usar `prisma` (abajo).
 */
export const basePrisma =
  globalForPrisma.basePrisma ||
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.basePrisma = basePrisma;

// Modelos que pertenecen a una empresa y se aíslan automáticamente
const TENANT_MODELS = new Set([
  'User',
  'Category',
  'Product',
  'Customer',
  'Sale',
  'SaleDetail',
  'InventoryLog',
  'Supplier',
  'SystemConfig',
  'Terminal',
  'CashierClose',
  'InventoryImport',
  'NCFSequence',
  'AuditLog',
  'EcfConfig',
  'EcfSequence',
  'EcfDocument',
  'EcfInbox', 'ProductBatch', 'SaleBatchDetail', 'ProductPresentation',
  'CardProviderConfig',
  'CardPayment',
]);

const FILTERED = new Set([
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'findUnique',
  'findUniqueOrThrow',
  'count',
  'aggregate',
  'groupBy',
  'update',
  'updateMany',
  'delete',
  'deleteMany',
]);

// Si el dato ya trae `company` (relación) o `companyId`, se respeta tal cual
const stamp = (data, companyId) =>
  data && !('company' in data) && !('companyId' in data) ? { ...data, companyId } : data;

/**
 * Cliente con aislamiento automático por empresa:
 * - lecturas/updates/deletes agregan `companyId` al where;
 * - creates estampan `companyId`;
 * - sin contexto de empresa la operación FALLA (nunca devuelve datos de otras empresas).
 */
export const prisma = basePrisma.$extends({
  name: 'tenant-isolation',
  query: {
    $allModels: {
      $allOperations({ model, operation, args, query }) {
        if (!TENANT_MODELS.has(model)) return query(args);

        const companyId = getTenantId();
        const next = { ...args };

        if (FILTERED.has(operation)) {
          next.where = { ...(args.where || {}), companyId };
        } else if (operation === 'create') {
          next.data = stamp(args.data, companyId);
        } else if (operation === 'createMany' || operation === 'createManyAndReturn') {
          next.data = Array.isArray(args.data)
            ? args.data.map(item => stamp(item, companyId))
            : stamp(args.data, companyId);
        } else if (operation === 'upsert') {
          next.where = { ...(args.where || {}), companyId };
          next.create = stamp(args.create, companyId);
        }

        return query(next);
      },
    },
  },
});

export default prisma;
