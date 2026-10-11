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

/**
 * Tipos de comprobante fiscal (serie B, papel) según la DGII.
 * B01 lleva el RNC del comprador; B02 es para consumidor final.
 */
export const NCF_TYPES = {
  B01: 'B01', // Factura de crédito fiscal
  B02: 'B02', // Factura de consumo
  B03: 'B03', // Nota de débito
  B04: 'B04', // Nota de crédito
  B11: 'B11', // Comprobante de compras
  B12: 'B12', // Registro único de ingresos
  B13: 'B13', // Gastos menores
  B14: 'B14', // Regímenes especiales
  B15: 'B15', // Gubernamental
  B16: 'B16', // Exportaciones
};

export const NCF_LABELS = {
  B01: 'Crédito fiscal',
  B02: 'Consumo',
  B03: 'Nota de débito',
  B04: 'Nota de crédito',
  B11: 'Comprobante de compras',
  B12: 'Registro único de ingresos',
  B13: 'Gastos menores',
  B14: 'Regímenes especiales',
  B15: 'Gubernamental',
  B16: 'Exportaciones',
};

/** Tipo con el que se emiten las devoluciones (notas de crédito). */
export const CREDIT_NOTE_NCF = 'B04';

export const TAX_RATE = 0.18; // 18% ITBIS

export const DEFAULT_PAGINATION = {
  page: 1,
  limit: 20,
  maxLimit: 100,
};

export const NCF_PREFIXES = Object.fromEntries(Object.keys(NCF_TYPES).map(type => [type, type]));

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