# Unidades, venta a granel y presentaciones

Estado: **hecho y probado** (`scripts/test-units.mjs` + recorrido en navegador). Convive con perecederos y lotes
([`Perecederos_y_Lotes.md`](Perecederos_y_Lotes.md)) y con la facturación electrónica.

## Cómo se vende comida

| Caso | Cómo se configura | Cómo se vende |
|---|---|---|
| **Unidad** (un cartón de leche) | Se vende por *Unidad* | Un toque en el producto o escanear su código |
| **Paquete / caja** (paquete de 12) | *Presentaciones* del mismo producto: nombre, unidades que contiene, precio y código de barras opcional | Elegir la presentación (o escanear su código); descuenta sus unidades del **mismo stock** (y del mismo lote, FEFO) |
| **A granel** (tomate, papa por libra) | Se vende por *Libra*, *Kilogramo*, *Onza*, *Gramo*, *Litro*, *Galón* o *Mililitro*; precio, costo y stock son por esa unidad | Ventana de peso: escribe el peso (o toca 0.25 / 0.5 / 1 / 2 / 5) o cambia a **Por monto** («RD$100 de tomate» → 2.5 lb) |

El producto base puede tener ambas cosas: por ejemplo leche suelta a $20 y *Paquete x12* a $200 (más barato por unidad).

## Reglas

- **Cantidades con 2 decimales.** Unidades enteras (UND) no admiten fracciones; a granel sí (1.25 lb). El e-CF acepta 1 o 2 decimales, por eso no se usan 3.
- **Stock siempre en unidad base** (`Product.stock`, lotes, kárdex). Una presentación solo cambia cuánto se descuenta y a qué precio.
- **Venta:** `SaleDetail.quantity` va en unidad base; `unit`, `presentationName` y `presentationQty` guardan cómo se vendió («2 × Paquete x12»).
  `unitPrice` es el precio por unidad base (precio del paquete ÷ unidades) sin redondear, para que cada línea cuadre al centavo.
- **Notas de crédito:** se devuelve en unidad base (hasta 2 decimales), al precio real de lo vendido (5 unidades de un paquete de 12 a $200 = $83.33).
- **Stock atómico:** el descuento se hace con `updateMany ... stock >= cantidad` dentro de la transacción (productos normales también), así dos ventas simultáneas no dejan stock negativo.
- **Ruido de coma flotante** (0.1 + 0.1 + 0.1): tolerancia de 0.004 y limpieza de residuos al agotar (`QTY_EPS` en `shared/utils/units.js`).
- **Cambio de unidad:** no se pasa a una unidad entera si hay existencias con decimales.
- **e-CF:** cada línea lleva el código `UnidadMedida` de la DGII (UND 43, LB 23, KG 21, OZ 61, GR 17, LT 24, GAL 15, ML 59) y la cantidad con 2 decimales.
  Pendiente de validar en la fase 5 con la DGII real que acepte precio unitario con hasta 4 decimales en líneas de presentación.

## Código

- API: `shared/utils/units.js` (tabla de unidades, validación), `products.service.js` (unidad + presentaciones, búsqueda por código de barras de la presentación),
  `sales.service.js` (líneas con presentación y cantidades fraccionarias, notas de crédito), `inventory.service.js` y `batches.*` (cantidades decimales).
  Tabla `product_presentations`; `Product.unit`; `SaleDetail.unit/presentationName/presentationQty`; cantidades `Float`.
- Web: `utils/units.js` (copia de la tabla), `hooks/usePosCart.js` (líneas por producto + presentación), `components/pos/ProductOptionsModal.jsx` (peso/monto/presentación),
  `Products.jsx` (unidad y presentaciones), `Inventory.jsx`, recibos (`lineDisplay`).

## Pantalla del cliente

Totales (subtotal, descuento, ITBIS, total) **fijos** al pie; solo la lista se desplaza. Microanimaciones: líneas que entran con destello y salen suavemente, cantidad que «salta»,
importes que cuentan hasta su valor, latido del total, descuento por vencimiento con etiqueta animada, bienvenida con carrito flotante y agradecimiento con visto dibujado.
Respeta «reducir movimiento». Muestra `1.25 lb`, `2 × Paquete x12`, precio «por lb» y el descuento por vencimiento.

## Eliminar categorías

`DELETE /api/categories/:id?moveTo=<categoriaDestino>`. Sin productos se elimina directo; con productos hay que indicar a qué categoría se mueven (se mueven y se elimina en una sola
transacción). La pantalla de Categorías muestra cuántos productos tiene cada una y pide el destino.

## Pendiente / ideas

- **Báscula electrónica:** la ventana de peso ya recibe el valor de un campo; falta leer la báscula (Web Serial, como el lector serial existente) o códigos de barras de balanza con peso/precio embebido (prefijo 2).
- Etiquetas con precio por libra, redondeo comercial del monto por peso, tara.
- Importación de inventario con unidad y presentaciones; reporte de ventas por peso.
