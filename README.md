# SalesPro v2

Sistema de Gestión de Ventas moderno para pequeñas y medianas empresas, con gestión de inventario, clientes, ventas y reportes avanzados.

## Arquitectura Monorepo

```
salespro-v2/
├── apps/
│   ├── web/                    # Frontend (React + Vite)
│   └── api/                    # Backend (Express + Prisma)
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

3. Ejecutar en desarrollo:
   ```bash
   npm run dev
   ```

## Scripts

- `npm run dev` - Ejecuta todos los workspaces en modo desarrollo
- `npm run build` - Construye todos los workspaces
- `npm run start` - Inicia todos los workspaces
- `npm run db:generate` - Genera el cliente de Prisma
- `npm run db:push` - Sincroniza el esquema con la base de datos
- `npm run db:migrate` - Crea una migración
- `npm run db:seed` - Ejecuta el seed de la base de datos

## Workspaces

- **@salespro/web** - Frontend React + Vite + Tailwind CSS + Zustand
- **@salespro/api** - Backend Express + Prisma + JWT + Rate Limiting
- **@salespro/shared** - Constantes y tipos compartidos

## Variables de Entorno

Consulta `.env.example` para la lista completa de variables requeridas.

## Base de Datos

- PostgreSQL (configurable en `.env` con `DATABASE_URL`)
- Prisma ORM para el modelado de datos
- Seed inicial con usuarios, categorías, productos y clientes

## Licencia

Propiedad de SalesPro. Todos los derechos reservados.
