import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Contexto de empresa (tenant) de la petición en curso.
 * Lo establece `authenticate`; el cliente Prisma de `db.js` lo usa para filtrar y estampar `companyId`.
 */
export const tenantStore = new AsyncLocalStorage();

/** Ejecuta `fn` dentro del contexto de una empresa. */
export function runInTenant(companyId, fn) {
  return tenantStore.run({ companyId }, fn);
}

/** companyId del contexto actual, o null si no hay contexto. */
export function getTenantIdOrNull() {
  return tenantStore.getStore()?.companyId ?? null;
}

/** companyId del contexto actual; lanza error si no existe (falla cerrada). */
export function getTenantId() {
  const companyId = getTenantIdOrNull();
  if (!companyId) {
    throw new Error('Contexto de empresa no disponible: la operación requiere una empresa autenticada');
  }
  return companyId;
}
