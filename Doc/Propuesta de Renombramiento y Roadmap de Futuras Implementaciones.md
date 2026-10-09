# Propuesta de Renombramiento y Roadmap de Futuras Implementaciones

## Parte 1: Propuestas de Nombre para el Proyecto

"SalesPro" es efectivamente genérico y no transmite identidad. Aquí tienes 6 propuestas con justificación estratégica:

| # | Nombre | Justificación | Dominio sugerido |
|---|--------|---------------|------------------|
| 1 | **NexoPOS** | "Nexo" evoca conexión (caja-inventario-fiscal). Corto, memorable, fácil de pronunciar en español e inglés. | nexopos.do |
| 2 | **Koba** | Nombre abstracto, 4 letras, altamente registrable como marca. Sin significado previo = lienzo en blanco para branding. | kobapos.com |
| 3 | **Trazo** | Referencia directa a "trazabilidad fiscal" (NCF, e-CF, auditoría). Posicionamiento claro en cumplimiento DGII. | trazopos.do |
| 4 | **FiscalPOS RD** | Nombre descriptivo y SEO-friendly. Deja claro el nicho (fiscal) y el mercado (República Dominicana). | fiscalpos.do |
| 5 | **VentaCore** | "Core" transmite que es el núcleo operativo del negocio. Profesional, escalable internacionalmente. | ventacore.com |
| 6 | **NCF Pro** | Referencia directa al comprobante fiscal dominicano. Nicho ultra-específico, posicionamiento inmediato. | ncfpro.do |

**Mi recomendación personal**: **Trazo** o **NexoPOS**. Trazo tiene ventaja en posicionamiento fiscal local; NexoPOS tiene mejor proyección si planeas expandirte fuera de RD.

Una vez elijas el nombre, actualizamos:
- `package.json` (nombre del workspace)
- `README.md`
- Títulos en el frontend (`index.html`, `App.jsx`)
- Branding en login y sidebar

---

## Parte 2: Documento de Futuras Implementaciones

A continuación, el documento completo. Guárdalo como `ROADMAP_FUTURO.md` en la raíz del proyecto.

# ROADMAP DE FUTURAS IMPLEMENTACIONES
## Proyecto: [PENDIENTE: Nombre final] v2.x — Post-MVP

**Estado actual**: MVP completado y funcional.
**Fecha de creación**: Septiembre 2026
**Documento de referencia fiscal**: `salespro_ecf_consultoria.md`

Este documento recopila todas las funcionalidades, mejoras y refactorizaciones pendientes para llevar el sistema desde su estado MVP actual hasta una plataforma comercial completa y escalable.

---

## 1. MEJORAS INMEDIATAS (Post-MVP, Prioridad Alta)

### 1.1 Confirmación administrativa para eliminar items del carrito
**Problema actual**: Cualquier usuario puede quitar productos del carrito sin validación.
**Solución**:
- Implementar modal de confirmación al eliminar un `SaleDetail` del carrito.
- Si el usuario es `VENDEDOR`, solicitar contraseña de administrador o código de autorización.
- Si el usuario es `ADMINISTRADOR`, confirmación simple con un clic.
- Registrar en `AuditLog` cada eliminación con: usuario, producto, cantidad, timestamp.
**Archivos a modificar**: `apps/web/src/pages/SalesPOS.jsx`, `apps/api/src/modules/sales/sales.service.js`

### 1.2 Rediseño de comprobante fiscal (formato largo y estrecho)
**Problema actual**: El PDF generado con jsPDF tiene formato carta/estándar, no tipo ticket térmico.
**Solución**:
- Crear dos plantillas de comprobante:
  - **Template A (Carta)**: Formato actual, para B01 (Crédito Fiscal) con todos los detalles legales.
  - **Template B (Ticket 80mm)**: Formato estrecho y largo, optimizado para impresoras térmicas.
- Opción 1: Selector en el POS para que el vendedor elija el formato.
- Opción 2 (recomendada): Configuración global en `SystemConfig` que defina el formato por defecto, con override por tipo de NCF.
**Archivos a modificar**: `apps/web/src/utils/pdfGenerator.js` (o equivalente), `apps/api/src/modules/sales/sales.service.js`

### 1.3 Reimpresión y descarga de facturas históricas
**Problema actual**: El comprobante solo se genera al momento de la venta.
**Solución**:
- Agregar botones "Reimprimir" y "Descargar PDF" en:
  - `SalesHistory.jsx` (historial de ventas)
  - `SaleDetailModal.jsx` (detalle de factura)
- Endpoint backend: `GET /api/sales/:id/receipt` que regenera el PDF con los datos históricos.
- Validar que solo el vendedor propietario o un administrador puedan reimprimir.
**Archivos a crear**: `apps/api/src/modules/sales/receipt.service.js`
**Archivos a modificar**: `SalesHistory.jsx`, `SaleDetailModal.jsx`, `api.js`

### 1.4 Módulo de Proveedores
**Contexto**: Actualmente las compras se registran con un nombre de proveedor en texto libre (`InventoryLog.supplier`). Se necesita una entidad formal.

**Modelo propuesto**:
```prisma
model Supplier {
  id          String   @id @default(uuid())
  name        String
  rnc         String   @unique
  contactName String?
  email       String?
  phone       String?
  address     String?
  paymentTerms String? // "30 días", "Contado", etc.
  isActive    Boolean  @default(true)
  purchases   Purchase[]
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}

model Purchase {
  id          String   @id @default(uuid())
  supplierId  String
  supplier    Supplier @relation(fields: [supplierId], references: [id])
  invoiceNumber String?
  totalAmount Decimal
  items       PurchaseItem[]
  createdAt   DateTime @default(now())
}
```
**Vistas necesarias**:
- `Suppliers.jsx`: CRUD completo de proveedores
- `PurchaseHistory.jsx`: Historial de compras por proveedor
- Integración con el modal de "Registrar Compra" existente en Inventario
**Archivos a crear**: `apps/api/src/modules/suppliers/`, `apps/web/src/pages/Suppliers.jsx`

### 1.5 Lector de Código de Barras (POS)
**Referencia**: `Faltantes.md` sección B (pendiente desde roadmap original)
**Implementación**:
- Custom hook `useBarcodeScanner.js` que escuche eventos `keydown` globales.
- Diferenciar escaneo (entrada rápida < 50ms entre teclas, termina en Enter) de escritura manual.
- Al detectar código válido, buscar producto por `barcode` y agregar al carrito.
- Fallback: input manual de código de barras en el POS para productos sin lector físico.
**Archivos a crear**: `apps/web/src/hooks/useBarcodeScanner.js`
**Archivos a modificar**: `SalesPOS.jsx`

### 1.6 Cierre de Caja (Z-Report)
**Contexto**: Cada caja/terminal debe poder generar un reporte de cierre al final del turno.
**Datos del cierre**:
- Ventas totales del turno (por método de pago: efectivo, tarjeta, transferencia)
- Total de ITBIS recaudado
- Número de transacciones
- Efectivo esperado en caja vs. efectivo declarado por el cajero
- Diferencia (sobrante/faltante)
- Firma digital del cajero y del supervisor (opcional)
**Modelo propuesto**:
```prisma
model CashierClose {
  id              String   @id @default(uuid())
  terminalId      String?
  userId          String
  openedAt        DateTime
  closedAt        DateTime?
  openingBalance  Decimal  @default(0) // Efectivo inicial
  expectedCash    Decimal  // Efectivo esperado según ventas
  declaredCash    Decimal  // Efectivo declarado por cajero
  difference      Decimal  // declaredCash - expectedCash
  status          CloseStatus @default(OPEN)
  notes           String?
  supervisorId    String?
  sales           Sale[]
}

enum CloseStatus {
  OPEN
  CLOSED
  ADJUSTED
}
```
**Vistas necesarias**:
- `CashierClose.jsx`: Modal de apertura/cierre de caja
- Botón "Cerrar Caja" en el header del POS (solo visible para roles autorizados)
- Reporte de cierres en módulo de Finanzas
**Archivos a crear**: `apps/api/src/modules/cashier/`, `apps/web/src/pages/CashierClose.jsx`

---

## 2. FACTURACIÓN ELECTRÓNICA (e-CF) — Fase Completa

**Referencia obligatoria**: `salespro_ecf_consultoria.md` (Entregables 1, 2 y 3)

### 2.1 Fase 1: E31 y E32 (Blocking para ventas comerciales)
**Estado**: Planificado, no iniciado.
**Dependencias**:
- Certificado digital .p12 del cliente (proveedor: DG Firma, ~$45 USD/2 años)
- Habilitación como emisor electrónico en portal DGII
- Credenciales de acceso al ambiente TEST: `https://ecf.dgii.gov.do/testecf/`

**Tareas técnicas** (ver `salespro_ecf_consultoria.md` §1.1 a §1.4):
1. Migración Prisma: campos e-CF en `Sale`, modelos `EcfLog` y `EcfConfiguration`
2. Instalación de dependencias: `xml-crypto`, `node-forge`, `@xmldom/xmldom`, `bullmq`, `ioredis`, `qrcode`, `form-data`
3. Implementación de módulos:
   - `ecf.seed.client.js`: Autenticación por semilla firmada
   - `ecf.ubl.builder.js`: Constructor XML UBL 2.1 según esquema DGII
   - `ecf.signer.js`: Firma digital XAdES con certificado .p12
   - `ecf.dgii.client.js`: Cliente HTTP para endpoints DGII
   - `ecf.queue.js`: Cola de reintentos con BullMQ
   - `ecf.validators.js`: Validaciones locales pre-envío
4. Integración en `sales.service.js` (hook post-venta asíncrono)
5. Frontend: `EcfConfiguration.jsx`, `EcfDashboard.jsx`, `EcfToggle.jsx`, `EcfStatusBadge.jsx`

**Casos de certificación obligatorios** (ver `salespro_ecf_consultoria.md` §2.2):
- E31 básico (cliente con RNC + email)
- E32 > 250,000 pesos (factura completa)
- E32 < 250,000 pesos (resumen de factura RDN)
- E34 (nota de crédito sobre E31 previo)

### 2.2 Fase 2: E34 y E33 (Devoluciones y ajustes)
**Dependencia**: Fase 1 completada y certificada.
**Tareas**:
- Implementar generación de E34 referenciando NCF original
- Implementar E33 para ajustes de precio posteriores
- UI de "Devolución" en `SalesHistory.jsx` con generación automática de nota de crédito

### 2.3 Fase 3: Certificación como Proveedor Autorizado DGII
**Beneficio estratégico**: Los clientes de [Nombre del Proyecto] se certifican más rápido al usar un proveedor ya autorizado.
**Requisitos**: Contrato con DGII, auditoría técnica del sistema, SLA de disponibilidad.

---

## 3. ARQUITECTURA Y ESCALABILIDAD (Largo Plazo)

### 3.1 Multi-tenant Real (Multi-empresa)
**Referencia**: `Faltantes.md` sección 3.A
**Estado actual**: Base de datos preparada pero sin aislamiento real entre tenants.
**Opciones**:
- **Opción A (Recomendada para inicio)**: Columna `companyId` en todas las tablas transaccionales. Aislamiento lógico, escalado vertical simple.
- **Opción B (Para enterprise)**: Esquemas separados en PostgreSQL por cada cliente. Mayor aislamiento, escalado horizontal, mayor complejidad operativa.

**Modelo propuesto (Opción A)**:
```prisma
model Company {
  id          String   @id @default(uuid())
  name        String
  rnc         String   @unique
  plan        PlanType @default(STARTER)
  isActive    Boolean  @default(true)
  branches    Branch[]
  users       User[]
  ecfConfig   EcfConfiguration?
}

model Branch {
  id          String   @id @default(uuid())
  companyId   String
  company     Company  @relation(fields: [companyId], references: [id])
  name        String
  address     String?
  terminals   Terminal[]
}
```

**Middleware requerido**: `tenantResolver.js` que extraiga `companyId` del JWT y aplique filtro automático en todas las queries de Prisma.

### 3.2 Gestión de Usuarios y Cajas (Terminales) — Enfoque Híbrido
**Referencia**: Decisión arquitectónica tomada en sesión previa.
**Implementación**:
- Modelo `Terminal` con relación muchos-a-muchos a `User`
- Campo `defaultTerminalId` en `User` para fallback automático
- Flujo de login: si el usuario tiene 1 terminal → login directo; si tiene múltiples → modal de selección
- Botón "Cambiar Caja" en header del POS (sin cerrar sesión)
- Cada `Sale` debe registrar `terminalId` para trazabilidad fiscal

### 3.3 Módulo de Configuraciones Globales
**Referencia**: `Faltantes.md` sección 1.C
**Entidades**:
- **Impuestos**: Porcentaje de ITBIS configurable (actualmente hardcodeado al 18%)
- **Métodos de Pago**: Activar/desactivar métodos disponibles en POS
- **Políticas de Descuento**: Límites por rol, permisos de aplicación
- **Formato de Comprobante**: Template A (carta) o Template B (ticket)
- **Secuencias NCF**: Configuración por sucursal y tipo de comprobante

**Modelo**: `SystemConfig` con estructura clave-valor o tabla estructurada por módulo.

---

## 4. INTEGRACIONES EXTERNAS

### 4.1 Impresión Térmica (ESC/POS)
**Referencia**: `Faltantes.md` sección 2.A
**Estado**: Librería `escpos` ya instalada en `apps/api`.
**Tareas**:
- Implementar servicio `printer.service.js` que formatee bytes ESC/POS
- Soporte para impresoras USB (detección automática de puerto) y de red (IP:9100)
- Comandos: corte de papel, apertura de cajón monedero, impresión de código de barras y QR
- Fallback: si no hay impresora, generar PDF y abrir diálogo de impresión del navegador

### 4.2 Integración de Pagos con Tarjeta (Datáfonos)
**Objetivo**: Conciliación automática entre ventas registradas y transacciones bancarias.
**Opciones**:
- **Integración directa con datáfonos**: API de proveedores locales (CardNet, Universal Card, etc.)
- **Pasarelas de pago online**: Azul, PayZen, Stripe (para e-commerce futuro)
- **Conciliación manual asistida**: Upload de extractos bancarios en CSV y matching automático por monto y fecha

### 4.3 API de Integración Bancaria
**Referencia**: `salespro_ecf_consultoria.md` §3.4 (módulo premium)
**Funcionalidad**:
- Webhook para recibir confirmaciones de transferencias
- Conciliación automática de ventas pagadas por transferencia bancaria
- Exportación de reportes en formato compatible con software contable local (Siigo, Alegra)

---

## 5. EXPERIENCIA DE USUARIO Y RENDIMIENTO

### 5.1 Modo Offline (PWA)
**Referencia**: `Faltantes.md` sección 3.C
**Tecnologías**: Service Workers, IndexedDB, Background Sync API
**Comportamiento**:
- POS opera sin conexión: ventas se guardan en IndexedDB
- Al recuperar conexión, sincronización automática con el servidor
- Conflictos: estrategia "last write wins" con validación de stock posterior
- Indicador visual claro de estado de conexión en el header

### 5.2 Optimización de Rendimiento
**Tareas**:
- Code-splitting con `React.lazy()` para reducir bundle inicial (actualmente >500kB)
- Virtualización de listas largas en `SalesHistory.jsx` y `Products.jsx` (librería: `@tanstack/react-virtual`)
- Caché agresivo en TanStack Query con `staleTime` y `cacheTime` configurados por endpoint
- Lazy loading de imágenes de productos (si se implementa galería)

### 5.3 Accesibilidad (a11y)
**Tareas**:
- Auditoría con Lighthouse y axe-core
- Navegación completa por teclado en POS
- Atributos ARIA en modales, tablas y formularios
- Contraste de colores conforme a WCAG 2.1 AA
- Soporte para lectores de pantalla en flujos críticos

---

## 6. SEGURIDAD Y CUMPLIMIENTO

### 6.1 Auditoría Completa (AuditLog)
**Modelo propuesto**:
```prisma
model AuditLog {
  id        String   @id @default(uuid())
  userId    String
  action    String   // "CREATE_SALE", "DELETE_PRODUCT", "LOGIN", etc.
  entity    String   // "Sale", "Product", "User"
  entityId  String?
  oldValue  Json?
  newValue  Json?
  ipAddress String?
  userAgent String?
  createdAt DateTime @default(now())
}
```
**Vista**: `AuditLogViewer.jsx` solo para administradores, con filtros por usuario, acción y fecha.

### 6.2 Encriptación de Datos Sensibles
**Aplicación**:
- Campos `certificateData`, `certificatePassEnc`, `dgiiClientSecretEnc` en `EcfConfiguration` deben encriptarse con AES-256-GCM antes de persistir
- Clave maestra almacenada en variable de entorno `ENCRYPTION_KEY` (nunca en código)
- Rotación de claves cada 12 meses con re-encriptación en background

### 6.3 Rate Limiting y Protección de APIs
**Estado actual**: `express-rate-limit` configurado globalmente.
**Mejoras**:
- Rate limiting granular por endpoint (login: 5 intentos/minuto, ventas: 100/minuto)
- Protección contra brute force en endpoints de autenticación
- CAPTCHA después de 3 intentos fallidos de login
- Logs de intentos sospechosos con alerta al administrador

---

## 7. REPORTES Y ANALÍTICA AVANZADA

### 7.1 Dashboard Ejecutivo
**KPIs adicionales**:
- Comparativa de ventas vs. mes anterior (gráfico de líneas)
- Top 10 productos por margen de ganancia (no solo por volumen)
- Mapa de calor de horarios pico de venta
- Tasa de conversión: visitas al POS vs. ventas completadas (si se integra con sistema de colas)

### 7.2 Exportación de Datos
**Formatos soportados**:
- PDF (reportes formateados con jsPDF)
- Excel/CSV (datos tabulares con librería `exceljs`)
- JSON (integración con otros sistemas)
- XML (UBL 2.1 para e-CF, ya implementado en fase e-CF)

**Nombres de archivo descriptivos**: `salespro_ventas_por_categoria_2026-09-01_2026-09-30.xlsx`

### 7.3 Reportes Fiscales Automatizados
**Generación mensual automática**:
- Resumen de ITBIS recaudado por tipo de comprobante
- Listado de e-CF emitidos, aceptados y rechazados
- Reporte de ventas exentas y exoneradas
- Exportación en formato requerido por DGII para declaraciones juradas

---

## 8. MÓVIL Y MULTI-PLATAFORMA

### 8.1 Aplicación Móvil para Vendedores
**Tecnología**: React Native o PWA avanzada
**Funcionalidades**:
- Consulta de inventario en tiempo real
- Registro de ventas simples (sin impresión de comprobante)
- Notificaciones push de stock bajo
- Aprobación de descuentos desde el celular del supervisor

### 8.2 Portal de Cliente (B2B)
**Funcionalidades**:
- Clientes con RNC pueden consultar su historial de compras
- Descarga de e-CF emitidos a su nombre
- Solicitud de notas de crédito online
- Estado de cuenta corriente (si se implementa crédito)

---

## 9. MONETIZACIÓN Y COMERCIALIZACIÓN

**Referencia completa**: `salespro_ecf_consultoria.md` §3 (Estrategia de Monetización)

### 9.1 Planes y Precios (actualización post-MVP)
| Plan | Precio mensual (RD$) | Límite | e-CF | Soporte |
|------|---------------------|--------|------|---------|
| Starter | 1,500 | 500 ventas | Add-on RD$800 | Email |
| Business | 3,500 | 5,000 ventas | Incluido | Email + WhatsApp |
| Pro | 6,500 | Ilimitado | Incluido | Prioritario |
| Enterprise | Cotización | Multi-sucursal | Incluido | SLA 99.9% |

### 9.2 Módulos Premium (Upsell)
- Reportes avanzados: RD$800/mes
- Modo offline: RD$1,200/mes
- API de integración bancaria: RD$1,500/mes
- Multi-sucursal: RD$2,000/mes por sucursal adicional
- Capacitación personalizada: RD$3,000-8,000 fee único

### 9.3 Hoja de Ruta de Comercialización
**Ver diagrama Gantt en `salespro_ecf_consultoria.md` §3.2**

Fases:
1. **Beta cerrada** (Nov 2026): 3-5 clientes conocidos, gratis
2. **Piloto pagado** (Ene 2027): 10-15 clientes PYME, 50% de precio
3. **Lanzamiento público** (Mar 2027): Precio completo, canales de venta activos

---

## 10. MANTENIMIENTO Y OPERACIONES

### 10.1 Backups Automatizados
**Estrategia**:
- Backup diario completo de PostgreSQL (pg_dump)
- Backup incremental cada 6 horas
- Retención: 30 días locales, 1 año en almacenamiento externo (S3/Azure Blob)
- Pruebas de restauración trimestrales

### 10.2 Monitoreo y Alertas
**Herramientas**:
- Winston logs centralizados (ya implementado)
- Integración con Sentry para errores de frontend
- Alertas por email/WhatsApp cuando:
  - e-CF rechazado por DGII
  - Stock bajo en productos críticos
  - Certificado digital por vencer (< 30 días)
  - Error de conexión a base de datos

### 10.3 Actualizaciones y Versionado
**Estrategia**:
- Semantic Versioning (SemVer): MAJOR.MINOR.PATCH
- Changelog público en `CHANGELOG.md`
- Migraciones de base de datos versionadas con Prisma
- Feature flags para rollout gradual de nuevas funcionalidades

---

## PRIORIZACIÓN FINAL

| Prioridad | Tarea | Dependencia | Esfuerzo estimado |
|-----------|-------|-------------|-------------------|
| **P0** | e-CF Fase 1 (E31+E32) | Certificado digital cliente | 6-8 semanas |
| **P0** | Confirmación admin para eliminar del carrito | Ninguna | 2-3 días |
| **P0** | Reimpresión de facturas históricas | Ninguna | 3-5 días |
| **P1** | Formato de comprobante tipo ticket | Ninguna | 1 semana |
| **P1** | Módulo de Proveedores | Ninguna | 2 semanas |
| **P1** | Lector de código de barras | Ninguna | 1 semana |
| **P1** | Cierre de caja | Gestión de terminales | 2 semanas |
| **P2** | Gestión de Usuarios y Cajas (híbrida) | Ninguna | 2-3 semanas |
| **P2** | Módulo de Configuraciones Globales | Ninguna | 2 semanas |
| **P2** | e-CF Fase 2 (E34, E33) | Fase 1 certificada | 3-4 semanas |
| **P3** | Impresión térmica ESC/POS | Hardware de prueba | 2 semanas |
| **P3** | Multi-tenant real | Decisiones de negocio | 4-6 semanas |
| **P3** | Modo offline (PWA) | Service Workers | 3-4 semanas |
| **P4** | Integración de pagos con tarjeta | Contratos con bancos | 4-8 semanas |
| **P4** | App móvil | MVP web estable | 8-12 semanas |

---

## NOTAS FINALES

1. **Este documento es vivo**: Se actualiza con cada decisión de producto y cada lección aprendida en producción.
2. **La certificación DGII es blocking**: Sin e-CF funcional, el producto no puede venderse a la mayoría de clientes formales en República Dominicana.
3. **MVP completado no significa producto terminado**: El MVP valida la viabilidad técnica; las funcionalidades de este roadmap validan la viabilidad comercial.
4. **Referencias cruzadas**: Este documento debe leerse junto con `salespro_ecf_consultoria.md` (aspectos fiscales y de monetización) y `Faltantes.md` (roadmap original pre-MVP).

## VISIÓN SaaS DEL PROYECTO

### Objetivo SaaS

Convertir el proyecto actual (MVP funcional de facturación + POS + inventario) en una **plataforma SaaS multi-tenant** que permita:

- **Múltiples empresas** (tenants) operando en la misma instancia, con aislamiento total de datos.
- **Suscripciones y planes** gestionados desde un panel de administración central.
- **Onboarding self-service**: una empresa puede registrarse, pagar y empezar a facturar sin intervención manual.
- **Escalabilidad horizontal**: agregar tenants sin degradar el rendimiento de los existentes.
- **Cumplimiento fiscal por tenant**: cada empresa con su propio certificado digital, secuencias NCF y configuración e-CF.

### Modelo de Negocio SaaS

| Componente | Descripción |
|------------|-------------|
| **Modelo de cobro** | Suscripción mensual/anual por plan + add-ons |
| **Planes** | Starter, Business, Pro, Enterprise |
| **Facturación** | Automática vía pasarela de pago (Azul, Stripe) |
| **Trial** | 14 días gratis sin tarjeta |
| **Métricas clave** | MRR, ARR, Churn, LTV, CAC |
| **Multi-moneda** | RD$ principal, USD opcional para expansión |

### Arquitectura SaaS Objetivo

```
┌─────────────────────────────────────────────────────────┐
│                    CAPA DE PRESENTACIÓN                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │
│  │  App Web     │  │  App Móvil   │  │  Portal      │   │
│  │  (React)     │  │  (PWA/RN)    │  │  Cliente B2B │   │
│  └──────────────┘  └──────────────┘  └──────────────┘   │
└─────────────────────────────────────────────────────────┘
                            │
┌─────────────────────────────────────────────────────────┐
│                    API GATEWAY / BFF                     │
│  ┌──────────────────────────────────────────────────┐   │
│  │  Auth (JWT + tenantResolver) │ Rate Limit │ WAF  │   │
│  └──────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
                            │
┌─────────────────────────────────────────────────────────┐
│                   MICROSERVICIOS / MÓDULOS               │
│  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌───────┐  │
│  │ Sales  │ │Inventory│ │  e-CF  │ │ Billing│ │Reports│  │
│  └────────┘ └────────┘ └────────┘ └────────┘ └───────┘  │
└─────────────────────────────────────────────────────────┘
                            │
┌─────────────────────────────────────────────────────────┐
│                      DATOS Y CACHÉ                       │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │
│  │ PostgreSQL   │  │    Redis     │  │  S3 / Blob   │   │
│  │ (multi-tenant)│  │  (caché/cola)│  │  (archivos)  │   │
│  └──────────────┘  └──────────────┘  └──────────────┘   │
└─────────────────────────────────────────────────────────┘
```

### Estrategia Multi-Tenant

**Opción recomendada para inicio: Opción A (Aislamiento lógico)**

```prisma
model Company {
  id          String   @id @default(uuid())
  name        String
  rnc         String   @unique
  plan        PlanType @default(STARTER)
  isActive    Boolean  @default(true)
  trialEndsAt DateTime?
  branches    Branch[]
  users       User[]
  ecfConfig   EcfConfiguration?
  subscription Subscription?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}

model Subscription {
  id            String   @id @default(uuid())
  companyId     String   @unique
  company       Company  @relation(fields: [companyId], references: [id])
  plan          PlanType
  status        SubStatus @default(TRIAL)
  currentPeriodStart DateTime
  currentPeriodEnd   DateTime
  cancelAtPeriodEnd  Boolean @default(false)
  stripeCustomerId   String?
  stripeSubscriptionId String?
}

enum PlanType {
  STARTER
  BUSINESS
  PRO
  ENTERPRISE
}

enum SubStatus {
  TRIAL
  ACTIVE
  PAST_DUE
  CANCELED
  SUSPENDED
}
```

**Middleware `tenantResolver.js`**: extrae `companyId` del JWT y aplica filtro automático en todas las queries de Prisma.

### Onboarding Self-Service

Flujo objetivo:

1. **Registro**: email + RNC + nombre de empresa.
2. **Verificación**: email de confirmación + validación de RNC contra DGII.
3. **Selección de plan**: trial 14 días o pago inmediato.
4. **Configuración inicial**: sucursal, terminal, usuarios, certificado digital.
5. **Primera factura**: asistente guiado para emitir la primera factura de prueba.
6. **Certificación e-CF**: wizard paso a paso para certificar la empresa ante DGII.

### Panel de Administración SaaS (Super-Admin)

Vistas necesarias:

- **Dashboard global**: MRR, tenants activos, churn, uso por plan.
- **Gestión de tenants**: crear, suspender, eliminar, impersonar.
- **Gestión de planes**: precios, límites, features por plan.
- **Facturación**: historial de pagos, suscripciones, reembolsos.
- **Métricas de uso**: facturas emitidas, almacenamiento, API calls por tenant.
- **Soporte**: tickets, logs de actividad por tenant.

### Seguridad y Aislamiento en SaaS

- **Row-Level Security (RLS)** en PostgreSQL como capa adicional de aislamiento.
- **Encriptación por tenant** de datos sensibles (certificados, secretos DGII).
- **Auditoría centralizada** con `AuditLog` incluyendo `companyId`.
- **Rate limiting por tenant** para evitar abuso de recursos.
- **Backups por tenant** con restauración selectiva.
- **Cumplimiento**: Ley 172-13 de Protección de Datos de RD.

### Roadmap de Conversión a SaaS

| Fase | Tarea | Esfuerzo estimado | Dependencia |
|------|-------|-------------------|-------------|
| **F1** | Modelo `Company` + `tenantResolver` + migración de datos existentes | 3-4 semanas | Ninguna |
| **F1** | Panel Super-Admin básico (gestión de tenants) | 2-3 semanas | Modelo Company |
| **F2** | Suscripciones + integración pasarela de pago | 4-6 semanas | Modelo Company |
| **F2** | Onboarding self-service (registro + trial) | 3-4 semanas | Suscripciones |
| **F3** | Aislamiento RLS + encriptación por tenant | 3-4 semanas | Modelo Company |
| **F3** | Métricas SaaS (MRR, churn, uso) | 2-3 semanas | Suscripciones |
| **F4** | Portal de cliente B2B | 4-6 semanas | Multi-tenant estable |
| **F4** | API pública para integraciones de terceros | 4-6 semanas | Multi-tenant estable |
| **F5** | Expansión internacional (multi-moneda, multi-idioma) | 6-8 semanas | F4 completada |


### MÓDULOS PENDIENTES DE IMPLEMENTACIÓN Y ARQUITECTURA TÉCNICA

#### 1. Módulo de Ingestión y Sanitización de Inventario (ETL & Staging Pipeline)
- **Objetivo:** Permitir la carga masiva e ingesta de productos provenientes de múltiples proveedores (archivos CSV, Excel y XML de facturación electrónica) eliminando datos no requeridos.
- **Arquitectura de Ingestión:**
  - **Tabla de Staging (`stg_inventario_ingesta`):** Recepción de datos crudos sin modificar para auditoría y trazabilidad del proveedor.
  - **Motor de Mapeo Interactivo (Column Mapper):** Asignación dinámica de columnas del proveedor a los atributos internos del POS (`codigo_barras`, `descripcion`, `costo_unitario`, `stock_inicial`).
  - **Pipeline de Sanitización y Transformación (ETL):**
    - Trimming y limpieza de espacios en blanco/caracteres especiales en cadenas de texto.
    - Normalización de formatos numéricos y monedas (`string` a `decimal/float`).
    - Descarte automático de metadata irrelevante (ubicaciones de almacenes externos, SKUs del proveedor, lote de origen).
    - Cálculo automático de `precio_venta` basado en márgenes de ganancia configurables por categoría/tienda.
  - **Carga Definitiva (UPSERT / Merge):** Inserción limpia a la tabla principal de productos (`tb_productos`) con actualización automática de existencias.

#### 2. Capa de Abstracción para Lectores de Códigos y Periféricos POS
- **Objetivo:** Unificar la entrada de datos desde escáneres de código de barras físicos, ventanas omnidireccionales y cámaras de visión computacional.
- **Funcionalidades requeridas:**
  - **Soporte HID (Human Interface Device):** Manejo global de eventos de teclado en segundo plano con cálculo de intervalos de tiempo entre pulsaciones (<15ms) para diferenciar el escáner del tipeo manual humano.
  - **Soporte Serial / Web Serial API:** Comunicación directa con lectores fijos de supermercado mediante puerto COM/RS232.
  - **Decodificador de Visión / Matriz 1D & 2D:** Integración con motor de procesamiento gráfico (como ZXing/OpenCV) para lectura de códigos EAN-13, EAN-8, UPC y códigos QR en terminales con cámara.
  - **Control de Debounce y Buffer:** Mecanismo de bloqueo temporal (3 segundos por defecto) para prevenir lecturas múltiples accidentales del mismo ítem en caja.
