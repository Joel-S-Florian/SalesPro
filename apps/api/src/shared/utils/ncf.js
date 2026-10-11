import { prisma, basePrisma } from '../../config/db.js';
import { getTenantId } from '../../config/tenant.js';
import { NCF_PREFIXES } from '../../../../../packages/shared/constants.js';

export { determineNCFType } from './dgii.js';

/**
 * Get next NCF sequence number for a given type
 * @param {string} ncfType - NCF type (B01, B02, etc.)
 * @returns {Promise<string>} Formatted NCF number
 */
export async function getNextNCF(ncfType) {
  const prefix = NCF_PREFIXES[ncfType] || 'B01';

  const companyId = getTenantId();
  const sequence = await prisma.nCFSequence.upsert({
    where: { companyId_ncfType: { companyId, ncfType } },
    update: {
      current: { increment: 1 },
    },
    create: {
      companyId,
      ncfType,
      prefix,
      current: 1,
    },
  });

  const paddedNumber = String(sequence.current).padStart(8, '0');
  return `${prefix}${paddedNumber}`;
}

/**
 * Crea las secuencias NCF de una empresa (idempotente).
 * @param {string} companyId - Empresa
 * @returns {Promise<void>}
 */
export async function initializeNCFSequences(companyId) {
  for (const [ncfType, prefix] of Object.entries(NCF_PREFIXES)) {
    await basePrisma.nCFSequence.upsert({
      where: { companyId_ncfType: { companyId, ncfType } },
      update: {},
      create: { companyId, ncfType, prefix, current: 0, max: 99999999 },
    });
  }
}

/**
 * Validate NCF format (Dominican Republic)
 * @param {string} ncf - NCF to validate
 * @returns {boolean} True if valid format
 */
export function validateNCFFormat(ncf) {
  if (!ncf || typeof ncf !== 'string') return false;
  const regex = /^B(0[1-9]|1[0-6])\d{8}$/;
  return regex.test(ncf);
}

/**
 * Format NCF for display
 * @param {string} ncf - NCF number
 * @returns {string} Formatted NCF
 */
export function formatNCF(ncf) {
  if (!ncf || ncf.length !== 11) return ncf;
  return `${ncf.slice(0, 3)}-${ncf.slice(3, 7)}-${ncf.slice(7)}`;
}