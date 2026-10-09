# Arquitectura multi-cliente (multi-tenant)

FACTOS atiende a varias empresas en una misma instalación y una misma base de datos. Cada empresa solo ve y
modifica sus propios datos. Este documento describe cómo funciona el aislamiento y las reglas para mantenerlo.

## Modelo

- **`Company`** (tabla `companies`): una empresa cliente (nombre, RNC, contacto, `active`).
- Cada dato de negocio lleva `companyId`: usuarios, categorías, productos, clientes, ventas (y sus detalles),
  movimientos de inventario, proveedores, cajas, turnos de caja, configuración, importaciones, secuencias NCF y
  auditoría.
- Los valores que antes eran únicos globalmente ahora son únicos **por empresa**: código de producto, nombre de
  categoría, documento de cliente, número de factura/NCF, RNC de proveedor, nombre de caja. Dos empresas pueden
  tener el mismo código de barras o el mismo NCF `B0100000001`.
- **`username` sigue siendo único en toda la plataforma**, porque el login no pide empresa.
- **Roles:** `SUPERADMIN` (equipo de la plataforma, sin empresa), `ADMINISTRADOR` y `VENDEDOR` (de una empresa).

## Cómo se aísla (falla cerrada)

1. `authenticate` (`apps/api/src/shared/middleware/auth.js`) carga al usuario, verifica que su empresa esté
   activa y ejecuta el resto de la petición dentro de un contexto de empresa (`AsyncLocalStorage`,
   `apps/api/src/config/tenant.js`).
2. El cliente Prisma que usa todo el código (`prisma` en `apps/api/src/config/db.js`) es una extensión que, para los
   modelos de empresa:
   - agrega `companyId` al `where` de lecturas, actualizaciones y borrados;
   - estampa `companyId` en los `create`/`upsert`;
   - **lanza un error si no hay contexto de empresa** (nunca devuelve datos "de todas").
3. Por eso los servicios no filtran a mano: un `prisma.product.findMany()` solo devuelve productos de la empresa
   actual y `prisma.product.findUnique({ where: { id: ajeno } })` devuelve `null`.

### Reglas para quien programe

- **Use siempre `prisma`.** `basePrisma` (sin aislamiento) se usa solo en: login/refresh/`/auth/me`, el middleware
  de autenticación, el módulo de plataforma (`modules/platform`), la inicialización de secuencias NCF y la
  auditoría. Cualquier otro uso es una fuga potencial.
- **Escrituras anidadas** (`details: { create: [...] }`) no pasan por la extensión: agregue `companyId: getTenantId()`
  a cada hijo (ver `createSale`).
- **Claves únicas compuestas:** para `upsert`/`findUnique` por código, nombre, documento, etc. use la clave
  compuesta (`companyId_code`, `companyId_ncfType`, `companyId_key`...) o `findFirst`.
- **`create` con relaciones `connect`** (ej. cajas con `users: { connect }`) debe conectar también la empresa:
  `company: { connect: { id: getTenantId() } }`.
- **Tabla nueva de negocio:** agregue `companyId` + relación + `@@index([companyId])`, inclúyala en `TENANT_MODELS`
  (`db.js`) y amplíe `scripts/test-tenant-isolation.mjs`.
- Los eventos asíncronos que corren fuera de la petición (por ejemplo `res.on('finish')`) pierden el contexto: use
  `basePrisma` con `companyId` explícito (como hace `auditLog`).

## Plataforma (super-admin)

Menú **Empresas** (solo `SUPERADMIN`, `/api/platform`):

- Alta de empresa con su **primer administrador** y sus secuencias NCF.
- Suspender/reactivar: al suspender se cierran las sesiones y se bloquea el login de todos sus usuarios.
- Ver usuarios de una empresa y **restablecer contraseñas**.
- Totales de la plataforma (empresas, usuarios, ventas, volumen).
- El super-admin **no** puede operar datos de ninguna empresa (las rutas de negocio le devuelven 403).

El usuario `superadmin` lo crea `prisma/seed.js` (contraseña de desarrollo `superadmin`; **cámbiela** en cualquier
entorno real, con `/api/auth/password` o creando otro con un script y desactivando este).

## Migración de datos existentes

La migración `20261008190000_multi_tenant` crea la empresa inicial `cmp_default` (nombre tomado de la
configuración del negocio, o "Mi Empresa") y le asigna todos los datos existentes antes de volver obligatorio
`companyId`. Para renombrarla use `PUT /api/platform/companies/cmp_default` (la pantalla Empresas aún no tiene edición de datos, solo alta, suspensión y consulta); el nombre que aparece en facturas se edita en Configuración.

## Pruebas

```
API_URL=http://localhost:3000/api node scripts/test-tenant-isolation.mjs
```

Crea dos empresas de prueba y verifica 30 comprobaciones: lectura aislada, acceso cruzado por id (productos,
ventas, clientes), códigos y NCF repetidos entre empresas, configuración independiente, roles de plataforma y
suspensión. Al terminar elimina las empresas de prueba.

## Pendiente (siguientes fases del roadmap SaaS)

- Planes y suscripciones, pasarela de pago, periodo de prueba.
- Registro/onboarding autónomo de empresas.
- Row-Level Security en PostgreSQL como segunda barrera, y cifrado de secretos por empresa.
- Límites de uso por plan, métricas (MRR, churn) y limitación de tasa por empresa.
- DGII / e-CF por empresa (certificado, secuencias y configuración propias).
- Impersonar una empresa desde el super-admin (con registro de auditoría).
