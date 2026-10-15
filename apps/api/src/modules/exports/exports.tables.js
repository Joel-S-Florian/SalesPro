import { Prisma } from '@prisma/client';

/**
 * Qué tablas entran en cada exportación y qué campos NUNCA salen.
 * Quedan fuera por completo (secretos o datos que no son del negocio): sesiones, enlaces de recuperación,
 * certificado digital y claves del e-CF (`EcfConfig`), claves del procesador de tarjetas (`CardProviderConfig`),
 * bandeja de comprobantes recibidos, solicitudes de la landing e importaciones temporales.
 *
 * `file` es el nombre del archivo dentro del ZIP; `scope: 'id'` filtra por el id de la empresa en vez de `companyId`.
 */
export const TABLES = {
  empresa: { model: 'Company', scope: 'id', exclude: [] },
  usuarios: { model: 'User', exclude: ['passwordHash'] },
  categorias: { model: 'Category' },
  proveedores: { model: 'Supplier' },
  productos: { model: 'Product' },
  presentaciones: { model: 'ProductPresentation' },
  lotes: { model: 'ProductBatch' },
  clientes: { model: 'Customer' },
  ventas: { model: 'Sale' },
  detalle_ventas: { model: 'SaleDetail' },
  lotes_vendidos: { model: 'SaleBatchDetail' },
  movimientos_inventario: { model: 'InventoryLog' },
  cajas: { model: 'Terminal' },
  cierres_caja: { model: 'CashierClose' },
  pagos_tarjeta: { model: 'CardPayment' },
  secuencias_ncf: { model: 'NCFSequence' },
  secuencias_ecf: { model: 'EcfSequence' },
  comprobantes_ecf: { model: 'EcfDocument' },
  configuracion: { model: 'SystemConfig', noId: true },
  auditoria: { model: 'AuditLog' },
};

export const EXPORT_TYPES = {
  SALES: { label: 'Ventas', feature: 'exportBasic', tables: ['ventas', 'detalle_ventas'] },
  PRODUCTS: { label: 'Productos e inventario', feature: 'exportBasic', tables: ['categorias', 'proveedores', 'productos', 'presentaciones', 'lotes', 'movimientos_inventario'] },
  CUSTOMERS: { label: 'Clientes', feature: 'exportBasic', tables: ['clientes'] },
  FULL: { label: 'Respaldo completo', feature: 'exportFull', tables: Object.keys(TABLES) },
};

const modelFields = Object.fromEntries(Prisma.dmmf.datamodel.models.map(m => [m.name, m.fields.filter(f => f.kind !== 'object').map(f => f.name)]));

/** Columnas exportables de una tabla (todos los campos propios menos los excluidos). */
export const columnsOf = name => modelFields[TABLES[name].model].filter(field => !(TABLES[name].exclude || []).includes(field));

export const delegateOf = name => TABLES[name].model.charAt(0).toLowerCase() + TABLES[name].model.slice(1);
