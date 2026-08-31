export const USER_ROLES = {
  ADMINISTRADOR: 'ADMINISTRADOR',
  VENDEDOR: 'VENDEDOR',
};

export const PAYMENT_METHODS = {
  EFECTIVO: 'EFECTIVO',
  TARJETA: 'TARJETA',
  TRANSFERENCIA: 'TRANSFERENCIA',
  YAPE: 'YAPE',
  PLIN: 'PLIN',
};

export const INVENTORY_TYPES = {
  ENTRADA: 'ENTRADA',
  SALIDA: 'SALIDA',
  AJUSTE: 'AJUSTE',
  DEVOLUCION: 'DEVOLUCION',
};

export const NCF_TYPES = {
  B01: 'B01', // Consumidor Final
  B02: 'B02', // Crédito Fiscal
  B03: 'B03', // Gubernamental
  B04: 'B04', // Régimen Especial
  B05: 'B05', // Exportación
  B06: 'B06', // Comprobante Gubernamental
  B07: 'B07', // Crédito Fiscal (Especial)
  B08: 'B08', // Único de Ingreso
  B09: 'B09', // Exportación (Especial)
  B10: 'B10', // Gubernamental (Especial)
  B11: 'B11', // Consumidor Final (Especial)
  B12: 'B12', // Crédito Fiscal (Exportación)
  B13: 'B13', // Comprobante de Retención
  B14: 'B14', // Comprobante de Pago
  B15: 'B15', // Comprobante de Anticipo
  B16: 'B16', // Nota de Crédito
};

export const TAX_RATE = 0.18; // 18% ITBIS

export const DEFAULT_PAGINATION = {
  page: 1,
  limit: 20,
  maxLimit: 100,
};

export const NCF_PREFIXES = {
  B01: 'B01',
  B02: 'B02',
  B03: 'B03',
  B04: 'B04',
  B05: 'B05',
  B06: 'B06',
  B07: 'B07',
  B08: 'B08',
  B09: 'B09',
  B10: 'B10',
  B11: 'B11',
  B12: 'B12',
  B13: 'B13',
  B14: 'B14',
  B15: 'B15',
  B16: 'B16',
};

export const CUSTOMER_TYPES = {
  CONSUMIDOR_FINAL: 'consumidor_final',
  CONTRIBUYENTE: 'contribuyente',
  GOBIERNO: 'gobierno',
  EXPORTACION: 'exportacion',
};

export const DOCUMENT_TYPES = {
  RNC: 'RNC',
  CEDULA: 'CEDULA',
  PASAPORTE: 'PASAPORTE',
};