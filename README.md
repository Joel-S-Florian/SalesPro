# Factos

Plataforma multi-empresa (SaaS) de punto de venta, inventario y facturación para pequeñas y medianas empresas.

**Incluye:** POS con lector de códigos (teclado, cámara, puerto serie) y pantalla para el cliente, cajas y turnos con cierre
(Reporte Z), inventario con importación masiva (CSV, Excel o JSON), proveedores, reportes (resumen, ventas, rentabilidad, inventario,
compras, cajas, fiscal y clientes, con exportación a Excel/PDF), configuración por empresa y panel
de plataforma (super-admin). La facturación electrónica DGII (e-CF) tiene su base completa (emisión, firma, cola, recepción, directorio, tablero) probada con un simulador local; falta validar con la DGII real (ver `Doc/Facturacion_Electronica.md`).

## Arquitectura Monorepo

```
factos/
├── apps/
│   ├── web/                    # Frontend (React + Vite)
│   ├── api/                    # Backend (Express + Prisma)
│   └── landing/                # Página de promoción (Vite + React)
├── packages/
│   └── shared/                 # Código compartido
├── prisma/                     # Esquema de base de datos
└── package.json               # Configuración del monorepo
```

## Instalación

1. Instalar dependencias:
   ```bash
   npm install
   ```

2. Configurar variables de entorno en `.env`:
   ```bash
   cp .env.example .env
   ```

3. Preparar la base de datos (PostgreSQL) y ejecutar en desarrollo:
   ```bash
   npx prisma migrate deploy && npm run db:seed
   npm run dev
   ```
   Para crear una cuenta nueva abre `http://localhost:5180/?registro=1` (o el botón **Empezar gratis** de la página de promoción).
   La API usa el puerto **4010** y la web el **5180**, la página de promoción el **5190**. Usuarios del seed: `admin`/`admin`,
   `vendedor`/`vendedor` y `superadmin`/`superadmin` (**solo desarrollo**: cambie las contraseñas).

## Scripts

- `npm run dev` - Ejecuta todos los workspaces en modo desarrollo
- `npm run build` - Construye todos los workspaces
- `npm run start` - Inicia todos los workspaces
- `npm run db:generate` - Genera el cliente de Prisma
- `npm run db:push` - Sincroniza el esquema con la base de datos
- `npm run db:migrate` - Crea una migración
- `npm run db:seed` - Ejecuta el seed de la base de datos
- `npm test` - Pruebas unitarias (Vitest); con `API_URL=http://localhost:4010/api` corre también la prueba de aislamiento multi-empresa
- `npm run lint` - ESLint

## Workspaces

- **@factos/web** - Frontend React + Vite + Tailwind CSS + Zustand
- **@factos/api** - Backend Express + Prisma + JWT + Rate Limiting
- **@factos/shared** - Constantes y tipos compartidos
- **@factos/landing** - Página de promoción (sitio estático, ver [`apps/landing/README.md`](apps/landing/README.md)); `npm run dev:landing`

## Variables de Entorno

Consulta `.env.example` para la lista completa de variables requeridas.

## Base de Datos

- PostgreSQL (configurable en `.env` con `DATABASE_URL`)
- Prisma ORM para el modelado de datos
- Seed inicial con usuarios, categorías, productos y clientes

## Documentación

En [`Doc/`](Doc/): [contexto técnico](Doc/CONTEXTO_TECNICO_FACTOS.md), [arquitectura multi-cliente](Doc/Arquitectura_Multicliente.md),
[sistema de diseño](Doc/Sistema_de_Diseno_UI.md), [formato de importación de inventario](Doc/Especificacion_Archivo_Importacion_Inventario.md),
[plan de pruebas de escáneres y pantallas](Doc/Plan_Pruebas_Escaneres_y_Pantallas.md) y la [hoja de ruta](Doc/Propuesta%20de%20Renombramiento%20y%20Roadmap%20de%20Futuras%20Implementaciones.md).

## Licencia

Propiedad de Factos. Todos los derechos reservados.
