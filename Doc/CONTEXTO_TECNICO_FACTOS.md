# FACTOS: contexto técnico

Sistema de punto de venta, inventario y facturación para comercios, pensado como plataforma **multi-empresa (SaaS)**.
Este documento reemplaza al antiguo `SALESPRO_V2_TECHNICAL_CONTEXT.md`.

## Arquitectura

Monorepo con `npm workspaces`:

```
factos/
├── apps/
│   ├── api/          Node.js + Express + Prisma  (@factos/api)
│   └── web/          React 19 + Vite + Tailwind + Zustand + TanStack Query  (@factos/web)
├── packages/shared/  Constantes y roles compartidos  (@factos/shared)
├── prisma/           schema.prisma, migraciones y seed
├── scripts/          Generador de datos de ejemplo, prueba de aislamiento multi-empresa
└── Doc/              Documentación
```

- **API REST** bajo `/api`. Validación con Zod, JWT (access + refresh con sesiones en BD), rate limiting y Helmet.
- **Frontend SPA** sin router: la navegación es por pestañas (`activeTab` en `App.jsx`) filtradas por rol.
- **Base de datos:** PostgreSQL con Prisma. Migraciones versionadas en `prisma/migrations`.

## Multi-empresa

Cada dato de negocio pertenece a una empresa (`companyId`) y el cliente Prisma lo aísla automáticamente.
Detalle y reglas para desarrolladores en [`Arquitectura_Multicliente.md`](Arquitectura_Multicliente.md).

Roles: `SUPERADMIN` (plataforma), `ADMINISTRADOR` y `VENDEDOR` (empresa).

## Módulos del API (`apps/api/src/modules`)

| Módulo | Función |
|---|---|
| `auth` | Login, refresh, perfil, usuarios de la empresa |
| `products`, `categories`, `customers` | Catálogos |
| `inventory` | Kárdex, ajustes, compras a proveedor (costo promedio ponderado) |
| `inventory-import` | Importación masiva CSV/XLSX/JSON con staging, mapeo de columnas y sanitización |
| `suppliers` | Proveedores e historial de compras |
| `sales` | Ventas (POS), notas de crédito preliminares, autorización de retiro del carrito |
| `terminals`, `cashier` | Cajas, turnos, cierre (Reporte Z) |
| `config` | Configuración por empresa: datos del negocio, ITBIS, métodos de pago, descuentos, formato de comprobante |
| `reports`, `finance` | Reportes y flujo de caja |
| `platform` | Super-admin: empresas, suspensión, contraseñas, estadísticas |

Utilidades clave: `shared/utils/ncf.js` (secuencias NCF por empresa), `shared/utils/dgii.js` (validación RNC/cédula),
`shared/middleware/audit.js` (auditoría), `config/db.js` y `config/tenant.js` (aislamiento).

## Pantallas (`apps/web/src/pages`)

POS (`SalesPOS`) con barra de caja/turno, lectores de código (teclado, cámara, puerto serie), vista de caja
ampliada y pantalla del cliente (`CustomerDisplay`, ventana aparte por `BroadcastChannel`); historial y reimpresión de
facturas (A4 / ticket 80 mm); productos, categorías, clientes, proveedores, inventario, importación, etiquetas de
código de barras, reportes, finanzas, cierres de caja, configuración, usuarios y (solo super-admin) empresas.

## Flujo de una venta

1. El POS envía `POST /api/sales` con cliente, detalle, caja (`terminalId`) y método de pago.
2. `createSale` valida cliente y productos de la empresa, aplica la política de descuentos y la tasa de ITBIS
   configurada, resuelve el turno de caja abierto y asigna el NCF de la empresa (`getNextNCF`).
3. En una transacción registra la venta y sus detalles, descuenta existencias y crea los movimientos de inventario.

## Comandos

| Comando | Qué hace |
|---|---|
| `npm run dev` | API (puerto 3000) y web (Vite) en paralelo |
| `npm run db:migrate` / `npx prisma migrate deploy` | Crear/aplicar migraciones |
| `npm run db:generate` | Regenerar el cliente Prisma (detener el servidor antes en Windows) |
| `npm run db:seed` | Datos de ejemplo + usuarios `admin`, `vendedor`, `superadmin` (contraseña del superadmin: `SUPERADMIN_PASSWORD`) |
| `npm test` | Pruebas unitarias (Vitest) |
| `npm run lint` | ESLint |
| `node scripts/test-tenant-isolation.mjs` | Prueba de aislamiento entre empresas contra una API en marcha |
| `node scripts/generate-sample-inventory.mjs` | Archivos de inventario de ejemplo en `Doc/ejemplos/` |

## Pendiente técnico relevante

- **Facturación electrónica DGII (e-CF):** sin implementar (firma XAdES, UBL 2.1, cliente DGII, contingencia,
  conciliación). Diferida hasta tener clientes; debe ser por empresa (certificado y secuencias propios).
- **Notas de crédito (B16):** la lógica actual es preliminar y no tiene interfaz.
- **SaaS:** planes, suscripciones, registro autónomo, Row-Level Security.
- Hoja de ruta completa: [`Propuesta de Renombramiento y Roadmap de Futuras Implementaciones.md`](Propuesta%20de%20Renombramiento%20y%20Roadmap%20de%20Futuras%20Implementaciones.md).

## Documentos relacionados

- [`Especificacion_Archivo_Importacion_Inventario.md`](Especificacion_Archivo_Importacion_Inventario.md)
- [`Plan_Pruebas_Escaneres_y_Pantallas.md`](Plan_Pruebas_Escaneres_y_Pantallas.md)
- [`DOCUMENTACION_SISTEMA_VENTAS.md`](DOCUMENTACION_SISTEMA_VENTAS.md): documento histórico del prototipo original.
