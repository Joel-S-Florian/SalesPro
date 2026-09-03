export const DocumentType = {
  CEDULA: 'CEDULA',
  RNC: 'RNC',
};

function cleanDigits(value) {
  return (value || '').replace(/\D/g, '');
}

export function validateDocument(type, value) {
  const cleanValue = cleanDigits(value);

  if (type === DocumentType.CEDULA) {
    return /^\d{3}-\d{7}-\d{1}$/.test(value) && cleanValue.length === 11;
  }

  if (type === DocumentType.RNC) {
    return /^\d{3}-\d{5}-\d{1}$/.test(value) && cleanValue.length === 9;
  }

  return false;
}

export function formatDocument(type, value) {
  const cleanValue = cleanDigits(value);

  if (type === DocumentType.CEDULA) {
    if (cleanValue.length <= 3) return cleanValue;
    if (cleanValue.length <= 10) {
      return `${cleanValue.slice(0, 3)}-${cleanValue.slice(3)}`;
    }
    return `${cleanValue.slice(0, 3)}-${cleanValue.slice(3, 10)}-${cleanValue.slice(10, 11)}`;
  }

  if (type === DocumentType.RNC) {
    if (cleanValue.length <= 3) return cleanValue;
    if (cleanValue.length <= 8) {
      return `${cleanValue.slice(0, 3)}-${cleanValue.slice(3)}`;
    }
    return `${cleanValue.slice(0, 3)}-${cleanValue.slice(3, 8)}-${cleanValue.slice(8, 9)}`;
  }

  return value;
}

export function detectDocumentType(value) {
  const cleanValue = cleanDigits(value);
  if (cleanValue.length === 11) return DocumentType.CEDULA;
  if (cleanValue.length === 9) return DocumentType.RNC;
  return null;
}
