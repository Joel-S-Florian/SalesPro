# Inventario y Cierre de caja: cómo funcionan en FACTOS

Documento de referencia (para usuarios y para quien mantenga el código). Todo lo descrito sale de leer el código; las rutas están
relativas a la raíz del repositorio. Complementa [`Perecederos_y_Lotes.md`](Perecederos_y_Lotes.md) y
[`Unidades_y_Presentaciones.md`](Unidades_y_Presentaciones.md).

---

# PARTE 1. INVENTARIO

## 1.1 Idea general

Cada producto tiene **una existencia (`stock`) en su unidad base**. Todo lo que mueve esa existencia deja una línea en el **kárdex**
(`InventoryLog`): ventas, devoluciones, compras, ajustes, mermas e importaciones. Si el producto es **perecedero**, su existencia es la suma de
sus **lotes**. Todo está aislado por empresa (`companyId`).

## 1.2 Piezas (modelos de datos)

| Pieza | Qué guarda |
|---|---|
| **Producto** | Código (único por empresa, en MAYÚSCULAS), nombre, categoría, costo, precio, `stock`, `minStock`, `unit`, `isPerishable`, activo |
| **Unidad** | `UND` (entera), `LB`, `KG`, `OZ`, `GR`, `LT`, `GAL`, `ML` (fraccionarias, hasta 2 decimales). Cada una lleva su código de la DGII para el e-CF |
| **Presentación** | Paquete/caja del mismo producto: nombre, unidades base que contiene (`factor`), precio del paquete y código de barras opcional. Descuenta del **mismo** stock |
| **Lote** (`ProductBatch`) | Número de lote, vencimiento (o sin vencimiento = `SIN-LOTE`), stock inicial/actual, costo, proveedor |
| **Movimiento** (`InventoryLog`) | Tipo `ENTRADA`, `SALIDA`, `AJUSTE`, `DEVOLUCION`, `MERMA`; cantidad, motivo, usuario; en compras: costo unitario/total, proveedor, factura |
| **Proveedor** | Nombre, RNC, contacto, condiciones de pago, activo (solo ADMIN; se desactiva, no se borra) |
| **Trazabilidad** (`SaleBatchDetail`) | Qué lote(s) salieron en cada línea de venta y el descuento por vencimiento de esa porción |
| **Importación** | Archivo cargado en pasos (ver 1.7) |

## 1.3 Cómo se mueve el stock

| Operación | Efecto | Detalle |
|---|---|---|
| **Venta** | Resta | Verifica stock; resta de forma atómica (`stock >= cantidad`); si es perecedero, descuenta lotes **FEFO**; movimiento `SALIDA` "Venta N°…". Si otra venta se llevó el stock en ese instante, la venta se rechaza (no queda stock negativo) |
| **Nota de crédito** | Suma | Devuelve al stock lo vendido y aún no devuelto; en perecederos vuelve a los lotes de origen (los más recientes primero), o a `SIN-LOTE` si no se puede rastrear; movimiento `DEVOLUCION` |
| **Compra a proveedor** | Suma | Exige proveedor; recalcula el **costo promedio ponderado** `((stock×costo)+(cant×costoNuevo))/(stock+cant)`; movimiento `ENTRADA` con costo, proveedor y factura |
| **Ajuste manual** | Según tipo | `Entrada`/`Devolución` suman; `Salida`/`Merma` restan (con verificación de stock); `Ajuste` **fija el total** (no es un delta). La merma guarda el costo perdido. Siempre pide motivo |
| **Importación** | Suma | Crea productos o suma existencia a los existentes (ver 1.7) |
| **Stock inicial** | Suma | Al crear un producto; deja el movimiento "Inventario Inicial" |

El stock **no se edita** en el formulario de producto: solo cambia con estas operaciones.

## 1.4 Perecederos, lotes y FEFO (resumen)

Se activa por empresa en *Configuración → Gestión de perecederos y lotes*.
- Estados de un lote según días restantes: **Vigente**, **Amarillo** (≤ umbral amarillo, 30 por defecto), **Rojo** (≤ umbral rojo, 7), **Vencido**, **Sin vencimiento**.
- **FEFO:** primero sale el que vence antes; los lotes sin fecha, al final; los vencidos no se venden (si "bloquear vencidos" está activo).
- **Descuento por vencimiento:** lo calcula el servidor por lote con las reglas configuradas (p. ej. ≤3 días 30 %, ≤7 días 15 %).
- **Compra o entrada de un perecedero:** exige número de lote y fecha; el mismo lote suma, con otra fecha se rechaza.
- **Baja de lotes:** desde la pestaña *Lotes y Vencimientos* ("Dar de baja") como merma.
- Marcar un producto como perecedero mueve su existencia actual a `SIN-LOTE`.

## 1.5 Pantallas

**Inventario (Kárdex)** — solo ADMINISTRADOR. Tres pestañas:
1. *Existencias en almacén:* buscador por código/nombre; estado **Agotado** (0), **Reabastecer** (≤ mínimo) o **Estable**; insignia de próximo vencimiento.
2. *Historial de movimientos:* paginado; busca por producto o motivo; filtro Entradas/Salidas.
3. *Lotes y vencimientos* (si el módulo está activo): lotes en riesgo, costo en riesgo, baja rápida.

Botones: **Registrar compra** (proveedor, producto, cantidad, costo unitario RD$, factura, lote/vencimiento si es perecedero) y **Ajustar stock manual**
(Entrada, Salida o Merma + motivo).

**Reabastecer desde el Dashboard.** La tarjeta de alertas críticas de stock tiene el botón **Reabastecer** en cada producto: lleva al módulo
Inventario y abre **Registrar compra** con el producto ya elegido y su último costo. Así pasa por el mismo flujo (proveedor, costo promedio, factura, lote).
Ya no existe el modal «Reabastecimiento Express», que sumaba stock sin costo, proveedor ni lote.

**Productos:** filtros por texto, categoría y estado de stock; formulario con unidad de venta, presentaciones, casilla de perecedero y stock mínimo.
Borrar un producto con ventas lo **desactiva**; sin ventas lo elimina.
**Etiquetas/Códigos:** imprime etiquetas con código de barras (EAN-13 si el código es válido; si no, CODE128).
**Proveedores:** CRUD (ADMIN). **Reportes → Inventario:** valoración, sugerencias de compra, cobertura y stock muerto.

## 1.6 Permisos

- **ADMINISTRADOR:** todo el inventario, productos, proveedores, importación, etiquetas y kárdex.
- **VENDEDOR:** ve productos para vender, y recibe el aviso de lotes por vencer. No entra a Inventario, Productos ni Importar.

## 1.7 Importar inventario (4 pasos, solo ADMIN)

1. **Subir** CSV/TXT, XLSX (primera hoja) o JSON; máx. 5,000 filas y ~7 MB.
2. **Columnas:** se proponen automáticamente; obligatorias: código, descripción y costo; opcionales: existencia, precio, categoría. Opciones: margen % (30 por defecto)
   para calcular el precio cuando falta, categoría por defecto, proveedor, y si se actualizan precios de productos existentes.
3. **Vista previa:** limpia cada fila (espacios, monedas, números) y la clasifica: **Crear**, **Actualizar** (el código ya existe) o **Inválida** (código/descripción vacíos,
   costo inválido, sin categoría, código repetido en el archivo). Muestra totales, categorías nuevas, unidades y valor.
4. **Aplicar:** una transacción; crea categorías y productos, **suma** existencia a los existentes (no la fija), recalcula costo promedio y deja el movimiento `ENTRADA`.
   En perecederos, la existencia entra como `SIN-LOTE`.

**Datos de alimentos (opcionales):** además lee unidad de venta, stock mínimo, perecedero, lote, vencimiento y hasta 2 presentaciones (ver
[`Prompt_Archivo_Ingesta_Alimentos.md`](Prompt_Archivo_Ingesta_Alimentos.md)). Un perecedero puede ocupar varias filas con el mismo código y distinto lote; sus lotes se crean con
su vencimiento. Un producto que ya existe conserva su unidad y presentaciones. Reimportar el mismo archivo **vuelve a sumar**.

---

# PARTE 2. CIERRE DE CAJA

## 2.1 Idea general

Una **caja** (terminal) es un punto de cobro. Un **turno** es el periodo entre que un cajero **abre** la caja con un fondo inicial y la **cierra** contando el efectivo.
Las ventas hechas durante el turno quedan vinculadas a él; al cerrar se compara lo que **debería haber** en efectivo con lo que el cajero **contó**.

## 2.2 Piezas

| Pieza | Qué es |
|---|---|
| **Terminal** (`Terminal`) | Caja con nombre único por empresa; puede estar activa/inactiva y asignada a cajeros. No se borra, se desactiva |
| **Turno** (`CashierClose`) | Terminal, cajero, apertura/cierre, fondo inicial, efectivo esperado/declarado, diferencia, estado (`OPEN`/`CLOSED`), notas, resumen |
| **Venta** | Guarda `terminalId` y `cashierCloseId` (el turno) |
| **Método de pago** | Solo `EFECTIVO` y `TARJETA` (uno por venta); se habilitan en Configuración |

Cajas: *Configuración → Cajas* (crear, activar/desactivar, asignar usuarios). Cada usuario puede marcar una caja como predeterminada (la recuerda el navegador).

## 2.3 Flujo del cajero

1. **Elegir caja** en la barra del POS (ShiftBar).
2. **Abrir turno** con el fondo inicial. No se puede si la caja ya tiene un turno abierto ni si el usuario ya tiene otro turno abierto en otra caja.
3. **Vender.** Cada venta se enlaza al turno abierto. Con `requireOpenShift` activo (Configuración), **no se puede vender sin turno abierto**; apagado (por defecto) se puede, pero esa venta
   **no entra en ningún cierre**.
4. **Cerrar caja:** el sistema muestra el resumen (transacciones, subtotal, descuentos, ITBIS, total, total por método de pago, fondo inicial); el cajero escribe el **efectivo contado** y notas.

## 2.4 Cálculos del cierre

- **Efectivo esperado** = fondo inicial + ventas en **efectivo** del turno (las notas de crédito en efectivo restan, porque llevan montos negativos).
- **Diferencia** = efectivo contado − efectivo esperado. **Positiva = sobrante; negativa = faltante.**
- Las ventas con tarjeta se informan por método pero **no entran en el efectivo esperado** ni se concilian contra el banco.
- Al cerrar se guarda una **copia del resumen** (así el cierre no cambia aunque después cambien las ventas). Un turno cerrado no se reabre.

## 2.5 Quién puede qué

- **Cajero (VENDEDOR):** ve sus cajas, abre y cierra **su** turno, ve el resumen de su turno.
- **ADMINISTRADOR:** además lista todos los cierres (filtro por caja y estado), ve cualquier turno y puede cerrar uno desde la API. No puede abrir un turno en una caja que tiene turno de otro cajero.
- La barra del POS solo muestra «Cerrar caja» al dueño del turno.

## 2.6 Pantallas e impresión

- **POS → ShiftBar:** selector de caja, estrella para predeterminada, estado del turno (cajero, transacciones, total), Abrir turno, Cerrar caja.
- **Cierres de caja** (ADMIN): tabla paginada con caja, cajero, apertura, cierre, esperado, declarado y diferencia (rojo faltante, ámbar sobrante); botón para reimprimir.
- **Reporte Z** (80 mm, PDF en el navegador): negocio, caja, cajero, horarios, ventas, descuentos, ITBIS, totales por método, esperado, declarado, faltante/sobrante, notas y firmas del cajero y supervisor.

---

# PARTE 3. PUNTOS DÉBILES CONOCIDOS (para priorizar mejoras)

**Inventario**
1. **Validadores sin efecto:** la mayoría de los esquemas de validación de inventario/productos (formato `z.object({ body })`) **no se ejecutan**; solo valida el servicio
   (cantidades, unidades, presentaciones). Campos como costo ≤ 0 o stock mínimo negativo dependen del navegador.
2. **Carreras en ajuste y compra:** leen el producto antes de la transacción y escriben el stock como valor absoluto; ajustes simultáneos (o una venta en medio) pueden pisarse y
   desfasar el stock del lote.
3. **Kárdex:** el saldo corrido empieza en 0 en cada página y trata `AJUSTE` como resta (en realidad fija el total). El reporte de kárdex de Reportes es el confiable.
4. **Importación:** reimportar duplica existencia, y una importación con un código creado entre la vista previa y aplicar falla completa.
5. **Etiquetas:** solo los primeros 100 productos activos y usa el código del producto, no el de la presentación.
6. **Rendimiento:** filtros de stock OK/BAJO y resúmenes del dashboard cargan todo en memoria; no escala a catálogos muy grandes.
7. **Pantallas:** el historial muestra `DEVOLUCION` y `AJUSTE` como "Salida"; el filtro no tiene Merma/Devolución; al borrar un producto desactivado el aviso dice "eliminado".
8. Un producto con movimientos pero sin ventas no se puede eliminar (llave foránea) y devuelve error en lugar de desactivarse.

**Cierre de caja**
1. **Carreras:** abrir y cerrar turno no son atómicos (dos aperturas simultáneas o dos cierres pueden coexistir); una venta en curso al cerrar puede quedar enlazada a un turno ya cerrado y fuera del resumen.
2. **Ventas fuera de turno** (con `requireOpenShift` apagado): efectivo recibido que no aparece en ningún cierre.
3. **Notas de crédito:** el POS no envía la caja al crearlas, así que **el reembolso en efectivo no se resta del cierre**; con `requireOpenShift` activo, crear una nota de crédito falla por no traer caja.
4. **Conciliación simple:** no hay retiros, gastos, entradas de efectivo ni conciliación de tarjetas; no hay pago mixto.
5. Un administrador que no es dueño del turno no puede cerrarlo desde la barra del POS (solo por API).
6. El reporte Z existe solo en el navegador (no hay PDF en el servidor).

## Mejoras sugeridas (por prioridad)
1. Hacer cumplir los validadores y corregir las carreras de ajuste/compra con incrementos atómicos.
2. Enviar la caja en las notas de crédito y restarlas del cierre; exigir caja abierta por defecto para empresas con efectivo.
3. Retiros/ingresos de efectivo y pago mixto; cierre atómico con guarda `status = OPEN`.
4. Importación con modo "fijar existencia" además de "sumar".
5. Kárdex con saldo correcto y filtros completos; reporte de mermas.
