/**
 * DGII (Dominican Republic Tax Authority) validation utilities
 */

/**
 * Validate RNC (Registro Nacional de Contribuyentes)
 * Algorithm from DGII specification
 * @param {string} rnc - RNC to validate
 * @returns {boolean} True if valid
 */
export function validateRNC(rnc) {
  if (!rnc || typeof rnc !== 'string') return false;
  
  // Remove spaces and hyphens
  const clean = rnc.replace(/[\s-]/g, '');
  
  // Must be 9 or 11 digits
  if (!/^\d{9}$|^\d{11}$/.test(clean)) return false;
  
  // Check for all same digits (invalid)
  if (/^(\d)\1+$/.test(clean)) return false;
  
  // Validation algorithm for 9-digit RNC (Personas Jurídicas)
  if (clean.length === 9) {
    const weights = [7, 9, 8, 6, 5, 4, 3, 2];
    let sum = 0;
    for (let i = 0; i < 8; i++) {
      sum += parseInt(clean[i]) * weights[i];
    }
    const remainder = sum % 11;
    const checkDigit = remainder === 0 ? 0 : remainder === 1 ? 1 : 11 - remainder;
    return parseInt(clean[8]) === checkDigit;
  }
  
  // Validation algorithm for 11-digit RNC (Personas Físicas - Cédula)
  if (clean.length === 11) {
    return validateCedula(clean);
  }
  
  return false;
}

/**
 * Validate Cédula de Identidad (Dominican Republic)
 * @param {string} cedula - Cédula to validate
 * @returns {boolean} True if valid
 */
export function validateCedula(cedula) {
  if (!cedula || typeof cedula !== 'string') return false;
  
  const clean = cedula.replace(/[\s-]/g, '');
  
  // Must be 11 digits
  if (!/^\d{11}$/.test(clean)) return false;
  
  // Check for all same digits
  if (/^(\d)\1+$/.test(clean)) return false;
  
  // Validation algorithm
  const weights = [1, 2, 1, 2, 1, 2, 1, 2, 1, 2];
  let sum = 0;
  
  for (let i = 0; i < 10; i++) {
    let product = parseInt(clean[i]) * weights[i];
    if (product >= 10) {
      product = Math.floor(product / 10) + (product % 10);
    }
    sum += product;
  }
  
  const checkDigit = (10 - (sum % 10)) % 10;
  return parseInt(clean[10]) === checkDigit;
}

/**
 * Validate NCF (Número de Comprobante Fiscal)
 * @param {string} ncf - NCF to validate
 * @returns {boolean} True if valid format
 */
export function validateNCF(ncf) {
  if (!ncf || typeof ncf !== 'string') return false;
  
  // Format: B + 2 digits + 8 digits = 11 chars
  // Or with dashes: B01-00000001
  const clean = ncf.replace(/[\s-]/g, '');
  
  if (!/^B(0[1-9]|1[0-6])\d{8}$/.test(clean)) return false;
  
  return true;
}

/**
 * Extract NCF type from NCF
 * @param {string} ncf - NCF number
 * @returns {string|null} NCF type (B01, B02, etc.) or null
 */
export function getNCFType(ncf) {
  if (!validateNCF(ncf)) return null;
  const clean = ncf.replace(/[\s-]/g, '');
  return clean.slice(0, 3);
}

/**
 * Determine document type from input
 * @param {string} document - Document number
 * @returns {string} Document type: 'RNC', 'CEDULA', 'PASAPORTE', 'UNKNOWN'
 */
export function getDocumentType(document) {
  if (!document) return 'UNKNOWN';
  
  const clean = document.replace(/[\s-]/g, '');
  
  if (/^\d{9}$/.test(clean) && validateRNC(clean)) return 'RNC';
  if (/^\d{11}$/.test(clean) && validateCedula(clean)) return 'CEDULA';
  if (/^[A-Z0-9]{6,9}$/.test(clean.toUpperCase())) return 'PASAPORTE';
  
  return 'UNKNOWN';
}

/**
 * Format RNC for display
 * @param {string} rnc - RNC number
 * @returns {string} Formatted RNC
 */
export function formatRNC(rnc) {
  if (!rnc) return '';
  const clean = rnc.replace(/[\s-]/g, '');
  if (clean.length === 9) {
    return `${clean.slice(0, 3)}-${clean.slice(3, 7)}-${clean.slice(7)}`;
  }
  if (clean.length === 11) {
    return `${clean.slice(0, 3)}-${clean.slice(3, 7)}-${clean.slice(7, 10)}-${clean.slice(10)}`;
  }
  return rnc;
}

/**
 * Format Cédula for display
 * @param {string} cedula - Cédula number
 * @returns {string} Formatted Cédula
 */
export function formatCedula(cedula) {
  if (!cedula) return '';
  const clean = cedula.replace(/[\s-]/g, '');
  if (clean.length === 11) {
    return `${clean.slice(0, 3)}-${clean.slice(3, 7)}-${clean.slice(7, 10)}-${clean.slice(10)}`;
  }
  return cedula;
}

/**
 * Determine NCF type for a sale based on customer
 * @param {Object} customer - Customer object
 * @param {number} amount - Sale amount
 * @returns {string} NCF type
 */
export function determineNCFType(customer, amount) {
  // Consumidor Final
  if (!customer.rnc || customer.rnc === '000000000' || customer.documentId === '000000000') {
    return 'B01';
  }
  
  // TODO: Add logic for other NCF types based on:
  // - Customer taxpayer status (DGII API)
  // - Amount thresholds
  // - Export sales
  // - Government sales
  // - Special regimes
  
  // Default to Crédito Fiscal for registered taxpayers
  return 'B02';
}