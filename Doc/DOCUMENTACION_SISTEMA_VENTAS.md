> **Documento histórico.** Describe el prototipo original de una sola página con `localStorage`. La arquitectura vigente está en [`CONTEXTO_TECNICO_FACTOS.md`](CONTEXTO_TECNICO_FACTOS.md).

# Documentación Técnica: SalesPro

SalesPro es un sistema de gestión de ventas tipo SPA (Single Page Application) desarrollado en un archivo único utilizando HTML5, TailwindCSS para el estilo, y JavaScript vainilla para la lógica y gestión de datos local.

## 1. Arquitectura Actual
- **Frontend:** HTML, CSS (Vanilla + TailwindCDN).
- **Lógica:** JavaScript (Vanilla).
- **Persistencia:** `localStorage` (Navegador).
- **Estructura:**
  - **Auth Layer:** Capa superpuesta que bloquea el acceso a la app.
  - **Main App Wrapper:** Contenedor principal (Sidebar + Área de contenido).
  - **State Management:** Objeto global `data` sincronizado con `localStorage` bajo la clave `salespro_data_v1`.

## 2. Funcionalidades
1. **Autenticación:** Registro y Login persistido en `localStorage` (claves: `users` para credenciales, `currentUser` para sesión).
2. **Dashboard:** Visualización de métricas clave (Ventas totales, Ventas del mes, Facturas por cobrar, Alertas de stock) y gráficos (Chart.js).
3. **Gestión de Productos:** CRUD completo (Crear, Leer, Actualizar, Borrar) de productos.
4. **Gestión de Clientes:** CRUD completo de clientes con validación para evitar borrar clientes con facturas asociadas.
5. **Facturación:** Interfaz de facturación rápida que permite seleccionar clientes, añadir productos a una lista temporal y finalizar ventas, gestionando automáticamente el stock.
6. **Reportes:** Visualización de ventas mensuales y productos/clientes más rentables.

## 3. Hoja de Ruta para Escalabilidad
Para transicionar de un prototipo local a una aplicación escalable, se requiere la siguiente evolución:

### Fase A: Backend & API (Prioridad Alta)
- **Migración de Datos:** Sustituir `localStorage` por una base de datos real (PostgreSQL o MySQL).
- **API RESTful:** Desarrollar un backend (Node.js/Express o FastAPI) para manejar las peticiones del frontend.
- **Autenticación Segura:** Implementar JWT (JSON Web Tokens) en lugar de la gestión simple de `localStorage`.

### Fase B: Estructura del Proyecto
- **Modularización:** Separar el archivo `index.html` en componentes (HTML, CSS, JS) y utilizar un framework de frontend (React, Vue o Angular) para mejorar la mantenibilidad.
- **Build System:** Introducir herramientas como Vite o Webpack para optimización de activos y gestión de dependencias (npm/yarn).

### Fase C: Nuevas Funcionalidades
- **Sistema de Roles:** Administrador vs. Vendedor.
- **Exportación de PDF/Excel:** Implementar librerías reales de generación de reportes fuera del navegador.
- **Integración Fiscal:** Conectar con servicios de facturación electrónica externa según la normativa local.

## 4. Notas de Desarrollo
- La clave principal de datos es `salespro_data_v1`.
- El manejo de fechas se realiza principalmente en formato ISO y se visualiza usando `Intl.DateTimeFormat`.
- La lógica de stock es síncrona: se resta en el momento de crear la factura.
