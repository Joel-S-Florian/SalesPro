# Perecederos, lotes y FEFO

Estado: **hecho y probado** (pruebas unitarias, `scripts/test-batches-fefo.mjs` y recorrido en navegador). Se activa por empresa en
*Configuración → Gestión de perecederos y lotes*; con el módulo apagado nada cambia para el resto de productos.

## Cómo funciona

- **Producto perecedero** (`Product.isPerishable`): se controla por lotes. **Invariante: `Product.stock` = suma de `currentStock` de sus lotes**,
  así reportes, kárdex y stock mínimo siguen funcionando.
- **Lote** (`ProductBatch`): número, vencimiento, stock inicial/actual, costo, proveedor. Único por `(empresa, producto, número)`.
  El vencimiento se guarda a las 12:00 UTC del día indicado para que el día sea el mismo en hora dominicana.
- **SIN-LOTE:** lote genérico **sin vencimiento**. Recibe el stock existente cuando un producto pasa a perecedero y lo que entra por importación
  (que no trae lotes). Se vende al final (FEFO) y no genera alertas ni descuentos.
- **Entradas:** compra (`POST /inventory/purchase`) y ajuste de entrada exigen `batchNumber` y `expirationDate` en perecederos; el mismo lote suma
  (con otra fecha se rechaza). El stock inicial al crear el producto acepta lote opcional.
- **Salidas manuales:** descuentan FEFO (incluyendo vencidos: es una baja) o un lote concreto con `batchId` (botón *Dar de baja*).
- **Venta (FEFO):** `createSale` toma los lotes **vigentes** por vencimiento ascendente (sin fecha al final) y descuenta con
  `updateMany ... currentStock >= qty` dentro de la transacción, así dos ventas simultáneas no sobrevenden. Cada línea guarda su
  trazabilidad en `SaleBatchDetail`. Lotes vencidos no se venden si `blockExpiredSales` (por defecto sí).
- **Nota de crédito:** devuelve las unidades a los lotes de origen (los más recientes primero) y registra el movimiento con cantidad negativa; lo
  no rastreable (ventas anteriores a los lotes) vuelve a SIN-LOTE.
- **Descuento por vencimiento:** lo calcula **el servidor** por lote consumido (`discountPercentFor`): aplica la regla más estricta que cubre los días
  restantes (p. ej. ≤3 días 30 %, ≤7 días 15 %). Se suma al descuento manual de la línea sin pasar por el permiso del vendedor y queda en
  `SaleDetail.discount`. El POS lo replica (`utils/expiry.js`) con los lotes que recibe en `product.lots` para mostrar el mismo total.

## Configuración (`perishable`)

| Campo | Defecto | Notas |
|---|---|---|
| `enabled` | false | Permite marcar productos y pedir lotes |
| `yellowThresholdDays` | 30 | Próximo a vencer |
| `redThresholdDays` | 7 | Crítico; debe ser menor que el amarillo |
| `blockExpiredSales` | true | No vender lotes vencidos |
| `autoDiscountEnabled` | false | Descuento automático |
| `discountRules` | 3 d → 30 %, 7 d → 15 % | Máx. 10; sin días repetidos |

## API

- `GET /api/inventory/expiring?status=ALL|EXPIRED|RED|YELLOW&page&limit` (ADMIN y VENDEDOR): lotes en riesgo + resumen (`expired`, `red`, `yellow`, `valueAtRisk`).
- `GET /api/inventory/expiring/summary` (ADMIN y VENDEDOR): solo el resumen (aviso al iniciar sesión).
- `GET /api/inventory/batches/:productId?all=true` (ADMIN): lotes de un producto.
- `GET /api/products` agrega a los perecederos `nearestBatch`, `sellableStock` y `lots` (para el POS).
- `GET /api/reports/dashboard` agrega `expiring`.

## Interfaz

- *Productos*: casilla «Producto perecedero» (visible con el módulo activo) y lote opcional del stock inicial; insignia del próximo lote.
- *Inventario*: lote y vencimiento en compra y ajuste de entrada; pestaña **Lotes y Vencimientos** (filtros, costo en riesgo, baja rápida).
- *POS*: insignia de vencimiento y «-30 %» en la tarjeta, línea «Descuento por vencimiento» animada en el ticket y límite de venta = stock vigente.
- Alertas: verde normal, ámbar con pulso suave, rojo con énfasis de entrada y anillo discreto, rojo sólido vencido. Con `prefers-reduced-motion` no hay
  animación (solo color). Aviso `notify` una vez por sesión y banner en el Dashboard.

## Cambio previo que se hizo en la misma entrega

El descuento **por línea** se guardaba pero **no restaba del total ni del ITBIS** (el POS sí). Ahora `createSale` lo resta, valida que no supere la línea y
`Sale.discount` reúne descuentos de línea y global (`subtotal - discount + tax = total`). La nota de crédito devuelve el descuento de cada línea exacto y el
global en proporción.

## Pruebas

- `npx vitest run` en `apps/api` (`batches.logic.test.js`: fechas, umbrales, descuento, FEFO, esquema de configuración).
- `node --env-file=apps/api/.env scripts/test-batches-fefo.mjs` (configuración, compras con lotes, FEFO, descuento, trazabilidad, nota de crédito, concurrencia,
  alertas, catálogo, SIN-LOTE). Limpia sus datos en «Empresa Prueba».
- `scripts/test-credit-notes.mjs` cubre el descuento por línea; `scripts/test-tenant-isolation.mjs` (con `API_URL`) limpia también lotes.

## Pendiente / ideas

- Merma como movimiento propio con costo perdido y reporte de mermas; reporte de ventas con descuento por vencimiento.
- Rastreo hacia atrás (qué ventas recibieron un lote) usando `SaleBatchDetail`; lote/vencimiento en el recibo (opcional).
- Lectura de código con lote (GS1). (La importación de inventario ya lee lote y vencimiento: ver `Prompt_Archivo_Ingesta_Alimentos.md`.)
- El kárdex trata `AJUSTE` como resta (inconsistencia anterior): no se tocó.
