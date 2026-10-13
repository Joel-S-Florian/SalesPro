# FACTOS: contexto técnico

Sistema de punto de venta, inventario y facturación para comercios, pensado como plataforma **multi-empresa (SaaS)**.
Este documento reemplaza al antiguo `SALESPRO_V2_TECHNICAL_CONTEXT.md`.

> Acceso y sesión (recuperar contraseña, clave temporal, cierre por inactividad, avisos por correo): [`Acceso_y_Sesion.md`](Acceso_y_Sesion.md). Inventario y cierre de caja: [`Inventario_y_Cierre_de_Caja.md`](Inventario_y_Cierre_de_Caja.md).

## Arquitectura

Monorepo con `npm workspaces`:

```
factos/
├── apps/
│   ├── api/          Node.js + Express + Prisma  (@factos/api)
│   ├── web/          React 19 + Vite + Tailwind + Zustand + TanStack Query  (@factos/web)
│   └── landing/      Página de promoción: sitio estático Vite + React + Tailwind  (@factos/landing)
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
| `reports`, `finance` | Reportes (ver «Reportes» abajo) y flujo de caja |
| `ecf` | Facturación electrónica DGII: configuración, certificado cifrado, token, emisión y firma de e-CF, cola de envío, receptor, directorio, tablero (ver [`Facturacion_Electronica.md`](Facturacion_Electronica.md)) |
| `inventory` (lotes) | Perecederos: lotes con vencimiento, FEFO en ventas, descuento por vencimiento y alertas (ver [`Perecederos_y_Lotes.md`](Perecederos_y_Lotes.md)) |
| unidades y presentaciones | Venta a granel (lb/kg…), paquetes/cajas como presentaciones del mismo producto, cantidades con 2 decimales (ver [`Unidades_y_Presentaciones.md`](Unidades_y_Presentaciones.md)) |
| `platform` | Super-admin: empresas, planes y prueba, suspensión, contraseñas, estadísticas |
| `public`, `leads` | Endpoints sin sesión: registro autónomo (`/public/signup`) y solicitudes de contacto (`/public/leads`, con bandeja de aprobación) |

**Comprobantes:** serie B de la DGII (B01 crédito fiscal con RNC, B02 consumo, B04 nota de crédito). Las notas de crédito se guardan en
negativo y devuelven stock; ver `Facturacion_Electronica.md`.

Utilidades clave: `shared/utils/ncf.js` (secuencias NCF por empresa), `shared/utils/dgii.js` (validación RNC/cédula),
`shared/middleware/audit.js` (auditoría), `config/db.js` y `config/tenant.js` (aislamiento).

## Interfaz (`apps/web/src`)

Pantallas en `pages/` (cargadas de forma diferida con `React.lazy`): POS, historial y reimpresión de facturas (A4 / ticket
80 mm), productos, categorías, clientes, proveedores, inventario, importación, etiquetas de código de barras, reportes,
finanzas, cierres de caja, configuración, usuarios y (solo super-admin) empresas.

### POS (`pages/SalesPOS.jsx` + `components/pos/` + hooks)
- **Disposición:** catálogo a la izquierda y ticket fijo a la derecha; en móvil y tablet el ticket es una hoja inferior
  arrastrable (`MobileTicketSheet`). *Vista de caja* es un modo inmersivo; `CustomerDisplay` es una ventana aparte que recibe
  el ticket por `BroadcastChannel` (mismo equipo y navegador).
- **Estado:** `usePosCart` (carrito y totales, con espejo síncrono para ráfagas de escáner) y `useProductCatalog` (búsqueda,
  categoría y paginación **en el servidor**; busca el código exacto en el servidor si no está cargado).
- **Entrada de productos:** teclado/HID (`useBarcodeScanner`), cámara (`CameraScannerModal`, BarcodeDetector o ZXing) y puerto
  serie (`useSerialScanner`), con bloqueo de lecturas repetidas (`utils/scanDedupe.js`). Atajos: `/` o `F2` buscar, `F9` cobrar.
- **Cobro:** un administrador autoriza quitar artículos (queda en `AuditLog`); turno de caja; confirmación con impresión
  (`utils/receiptPdf.js`).

### Reportes (`pages/Reports.jsx` + `pages/reports/`)
Once áreas con un solo selector de período (hoy, 7/30 días, mes, mes pasado, trimestre, año, personalizado):
**Resumen** (con variación frente al período anterior de igual duración, mapa de calor día × hora), **Ventas**,
**Rentabilidad**, **Inventario** (valor, reposición sugerida, productos sin movimiento, kárdex, mermas), **Compras**,
**Cajas** (faltantes y sobrantes por cajero y caja), **Fiscal** (ITBIS, comprobantes, números saltados), **Clientes**
(nuevos, recurrentes, inactivos) y los clásicos **Productos**, **Mejores clientes** y **Personal** (`LegacyReports.jsx`).
El super-admin ve además *Métricas de la plataforma* dentro de Empresas (`components/PlatformInsights.jsx`).

- **API:** `modules/reports/analytics.service.js` (rutas `/reports/overview`, `sales-breakdown`, `profitability`, `fiscal`,
  `inventory`, `kardex/:productId`, `purchases`, `cash`, `customer-insights`) y `modules/platform/analytics.js`
  (`/platform/analytics`). Todo pasa por `prisma`, así que el aislamiento por empresa es automático.
- **Zona horaria:** `shared/utils/tz.js` agrupa por día, semana (lunes) y mes en hora dominicana (UTC-4 fijo, sin horario de
  verano), no en la del servidor. `parseStartOfDay/EndOfDay` también interpretan los días en UTC-4.
- **Notas de crédito:** tipo `B04`, guardadas con montos y cantidades negativos; los reportes y la caja las restan sin lógica extra.
- **Costo:** se usa `SaleDetail.unitCost`; si es 0 se recurre al costo actual del producto y se avisa de las líneas sin costo.
- **Exportación:** Excel real (`POST /reports/export/xlsx`, `exceljs` en el servidor, con encabezado de empresa y formato de
  moneda), PDF y CSV desde `pages/reports/shared.jsx` (`ExportBar`, `ReportTable`).
- **Para añadir un reporte:** servicio en `analytics.service.js` + ruta + método en `services/api.js` + componente que use
  `useReport` y `ReportState`/`ReportTable`.
- Los datos se agregan en memoria sobre el período pedido (consultas livianas, no toda la historia). Para volúmenes muy
  grandes conviene pasar los totales diarios a SQL.

### Sistema de diseño
Resumido en [`Sistema_de_Diseno_UI.md`](Sistema_de_Diseno_UI.md): tipografía, movimiento, avisos, esqueletos, accesibilidad.

### Paginación
Todos los listados usan el mismo pie (`components/Pagination.jsx`, filas por página 10/20/50 recordado por equipo). Los grandes
paginan en el servidor con `hooks/usePagedList.js` (vuelve a la página 1 al cambiar filtros y descarta respuestas viejas); las
listas pequeñas que llegan completas usan `useClientPage`. El API devuelve `{ data, pagination }` y limita a 100 por página:
**no cargue "todo" en el navegador**; use búsqueda y paginación del servidor (como `ProductPicker` y el catálogo del POS).

## Flujo de una venta

1. El POS envía `POST /api/sales` con cliente, detalle, caja (`terminalId`) y método de pago.
2. `createSale` valida cliente y productos de la empresa, aplica la política de descuentos y la tasa de ITBIS
   configurada, resuelve el turno de caja abierto y asigna el NCF de la empresa (`getNextNCF`).
3. En una transacción registra la venta y sus detalles, descuenta existencias y crea los movimientos de inventario.

## Comandos

| Comando | Qué hace |
|---|---|
| `npm run dev` | API (puerto **4010**) y web (Vite, puerto **5180**, fijo) en paralelo; la página de promoción usa el **5190**; el proxy `/api` apunta a 4010 (`API_PROXY_TARGET` lo cambia) |
| `npm run dev:landing` | Página de promoción en http://localhost:5190 |
| `npm run db:migrate` / `npx prisma migrate deploy` | Crear/aplicar migraciones |
| `npm run db:generate` | Regenerar el cliente Prisma (detener el servidor antes en Windows) |
| `npm run db:seed` | Datos de ejemplo + usuarios `admin`, `vendedor`, `superadmin` (contraseña del superadmin: `SUPERADMIN_PASSWORD`) |
| `npm test` | Pruebas unitarias (Vitest) |
| `npm run lint` | ESLint (`.eslintrc.json`; requiere `eslint-config-prettier`) |
| `node scripts/test-tenant-isolation.mjs` | Prueba de aislamiento entre empresas contra una API en marcha |
| `node scripts/generate-sample-inventory.mjs` | Archivos de inventario de ejemplo en `Doc/ejemplos/` |

## Pendiente técnico relevante

- **Facturación electrónica DGII (e-CF):** base completa (emisión, firma, cola, receptor, directorio, aprobaciones, anulación, tablero) probada con simulador; falta la fase 5 con la DGII real (ver `Facturacion_Electronica.md`).
- **Notas de crédito:** B04 (papel) o E34 (electrónica), con interfaz en el historial de ventas.
- **SaaS:** planes, suscripciones, registro autónomo, Row-Level Security.
- Hoja de ruta completa: [`Propuesta de Renombramiento y Roadmap de Futuras Implementaciones.md`](Propuesta%20de%20Renombramiento%20y%20Roadmap%20de%20Futuras%20Implementaciones.md).

## Documentos relacionados

- [`Especificacion_Archivo_Importacion_Inventario.md`](Especificacion_Archivo_Importacion_Inventario.md)
- [`Plan_Pruebas_Escaneres_y_Pantallas.md`](Plan_Pruebas_Escaneres_y_Pantallas.md)
- [`DOCUMENTACION_SISTEMA_VENTAS.md`](DOCUMENTACION_SISTEMA_VENTAS.md): documento histórico del prototipo original.
