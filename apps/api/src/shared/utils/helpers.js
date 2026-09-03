/**
 * Pagination helper
 * @param {number} page - Current page (1-indexed)
 * @param {number} limit - Items per page
 * @param {number} total - Total items
 * @returns {Object} Pagination metadata
 */
export function getPaginationMeta(page, limit, total) {
  const totalPages = Math.ceil(total / limit);
  return {
    page,
    limit,
    total,
    totalPages,
    hasNext: page < totalPages,
    hasPrev: page > 1,
  };
}

/**
 * Build pagination query for Prisma
 * @param {Object} params - Pagination params
 * @returns {Object} Prisma skip/take
 */
export function buildPaginationQuery({ page = 1, limit = 20, sortBy = 'createdAt', sortOrder = 'desc' }) {
  const safeLimit = Math.min(Math.max(1, limit), 100);
  const safePage = Math.max(1, page);
  return {
    skip: (safePage - 1) * safeLimit,
    take: safeLimit,
    orderBy: { [sortBy]: sortOrder },
  };
}

/**
 * Format currency for Dominican Republic (DOP)
 * @param {number} amount - Amount to format
 * @returns {string} Formatted currency
 */
export function formatCurrency(amount) {
  return new Intl.NumberFormat('es-DO', {
    style: 'currency',
    currency: 'DOP',
    minimumFractionDigits: 2,
  }).format(amount);
}

/**
 * Format number with locale
 * @param {number} num - Number to format
 * @returns {string} Formatted number
 */
export function formatNumber(num) {
  return new Intl.NumberFormat('es-DO').format(num);
}

/**
 * Generate slug from string
 * @param {string} str - Input string
 * @returns {string} URL-friendly slug
 */
export function slugify(str) {
  return str
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove accents
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

/**
 * Deep clone object
 * @param {Object} obj - Object to clone
 * @returns {Object} Cloned object
 */
export function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

/**
 * Omit keys from object
 * @param {Object} obj - Source object
 * @param {string[]} keys - Keys to omit
 * @returns {Object} New object without omitted keys
 */
export function omit(obj, keys) {
  const result = { ...obj };
  keys.forEach(key => delete result[key]);
  return result;
}

/**
 * Pick keys from object
 * @param {Object} obj - Source object
 * @param {string[]} keys - Keys to pick
 * @returns {Object} New object with only picked keys
 */
export function pick(obj, keys) {
  const result = {};
  keys.forEach(key => {
    if (obj[key] !== undefined) result[key] = obj[key];
  });
  return result;
}

/**
 * Calculate percentage
 * @param {number} value - Current value
 * @param {number} total - Total value
 * @returns {number} Percentage (0-100)
 */
export function calculatePercentage(value, total) {
  if (total === 0) return 0;
  return Math.round((value / total) * 100 * 100) / 100;
}

/**
 * Round to 2 decimal places (for currency)
 * @param {number} num - Number to round
 * @returns {number} Rounded number
 */
export function round2(num) {
  return Math.round(num * 100) / 100;
}

/**
 * Parse a date-only string (YYYY-MM-DD) as local midnight.
 * Plain `new Date('YYYY-MM-DD')` parses as UTC midnight, which in
 * America/Santo_Domingo (UTC-4) shifts filters to the previous evening.
 * Returns null for missing or invalid values.
 * @param {string} value - Date string
 * @returns {Date|null} Local midnight or null
 */
export function parseStartOfDay(value) {
  if (!value || typeof value !== 'string') return null;
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00` : value);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Parse a date value as local end-of-day (23:59:59.999).
 * Returns null for missing or invalid values.
 * @param {string} value - Date string
 * @returns {Date|null} Local end of day or null
 */
export function parseEndOfDay(value) {
  const d = parseStartOfDay(value);
  if (!d) return null;
  d.setHours(23, 59, 59, 999);
  return d;
}

/**
 * Apply an optional createdAt range to a Prisma where object.
 * Invalid or missing dates are ignored (never produce Invalid Date).
 * @param {Object} where - Prisma where object (mutated)
 * @param {string} startDate - Start date string
 * @param {string} endDate - End date string (inclusive, whole day)
 */
export function applyCreatedAtRange(where, startDate, endDate) {
  const gte = parseStartOfDay(startDate);
  const lte = parseEndOfDay(endDate);
  if (gte || lte) {
    where.createdAt = {};
    if (gte) where.createdAt.gte = gte;
    if (lte) where.createdAt.lte = lte;
  }
}

/**
 * Sleep utility
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>}
 */
export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retry function with exponential backoff
 * @param {Function} fn - Async function to retry
 * @param {number} retries - Max retries
 * @param {number} baseDelay - Base delay in ms
 * @returns {Promise<any>} Function result
 */
export async function retry(fn, retries = 3, baseDelay = 1000) {
  try {
    return await fn();
  } catch (error) {
    if (retries <= 0) throw error;
    await sleep(baseDelay);
    return retry(fn, retries - 1, baseDelay * 2);
  }
}