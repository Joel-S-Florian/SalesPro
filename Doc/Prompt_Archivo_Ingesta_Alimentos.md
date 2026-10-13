# Prompt para generar un archivo de ingesta de alimentos (con perecederos, unidades y presentaciones)

Uso: copia el bloque «Prompt» (sección 3) y pégalo en otro LLM. Reemplaza lo que está entre `[corchetes]`.
El resultado se carga en FACTOS con **Importar Inventario**. Para entender los formatos y límites generales, ver
[`Especificacion_Archivo_Importacion_Inventario.md`](Especificacion_Archivo_Importacion_Inventario.md); para lo nuevo,
[`Perecederos_y_Lotes.md`](Perecederos_y_Lotes.md) y [`Unidades_y_Presentaciones.md`](Unidades_y_Presentaciones.md).

## 1. Qué datos nuevos debe traer el archivo

Además de lo básico (código, descripción, costo, existencia, precio, categoría), la comida necesita:

| Dato | Columna sugerida | Valores | Para qué sirve |
|---|---|---|---|
| Unidad de venta | `unidad` | `UND`, `LB`, `KG`, `OZ`, `GR`, `LT`, `GAL`, `ML` | Venta a granel (tomate por libra) o por unidad. Costo, precio y existencia van **por esa unidad**. |
| Stock mínimo | `stock_minimo` | número ≥ 0 | Alerta de bajo stock |
| Perecedero | `perecedero` | `SI` / `NO` | Control por lotes y vencimiento (FEFO) |
| Lote | `lote` | texto (≤ 40) | Solo perecederos con existencia |
| Vencimiento | `vencimiento` | `AAAA-MM-DD` | Solo perecederos con existencia; fecha futura |
| Presentación (hasta 2) | `pres1_nombre`, `pres1_unidades`, `pres1_precio`, `pres1_codigo` (y `pres2_…`) | nombre ("Paquete x12"), unidades base que contiene, precio **del paquete completo**, código de barras propio opcional | Vender cajas/paquetes del mismo producto sin duplicarlo |

Reglas de negocio que el archivo debe respetar:
- **Código único** por producto (y distinto del de cualquier presentación). Si no hay EAN real, usar códigos internos (`ALM-0001`); no inventar EAN con dígito verificador incorrecto.
- Productos a granel (`LB`, `KG`, …): existencia puede tener hasta **2 decimales**; en `UND` es entera.
- **Perecedero con existencia > 0 ⇒ lote y vencimiento obligatorios** (varios lotes del mismo producto = varias filas con el mismo código y distinto lote).
- El vencimiento va en el futuro; incluir **algunos lotes próximos a vencer (≤ 7 y ≤ 30 días)** y uno ya vencido solo para pruebas.
- Presentación: `unidades` > 0 y `precio` del paquete ≤ unidades × precio unitario (el paquete suele ser más barato por unidad).
- Precio de venta > costo. Montos en pesos dominicanos (RD$), sin símbolo.

> **El importador ya lee todas estas columnas** (Importar Inventario → paso «Columnas» → sección *Datos de alimentos*). Se asignan solas por el nombre del
> encabezado si usas los nombres sugeridos. Reglas: un perecedero puede ocupar varias filas con el mismo código y distinto lote; un producto que **ya existe**
> conserva su unidad y presentaciones (solo suma existencia y lote); con *Perecederos y lotes* apagado en Configuración, las filas perecederas se rechazan.
>
> **Archivo de ejemplo listo:** `Doc/ejemplos/inventario_alimentos.csv` (41 productos, 53 filas). Sus vencimientos son relativos a la fecha en que se generó;
> regéneralo justo antes de cargarlo con `node scripts/generate-food-inventory.mjs`.

## 2. Formato de entrega

CSV UTF-8, separador coma, primera fila con encabezados, o JSON (arreglo de objetos). Un producto por fila; los lotes adicionales
repiten el código. Máximo 5,000 filas.

## 3. Prompt (copiar y pegar)

```text
Eres un generador de datos de inventario para un POS dominicano. Entrega SOLO un bloque de código [CSV | JSON], sin explicaciones.

OBJETIVO
Crear un archivo de ingesta con [N] productos de comida y bebida reales y variados de un [supermercado | colmado | panadería | restaurante],
para cargar en el módulo "Importar Inventario".

COLUMNAS (exactamente estas, en este orden, con estos nombres)
codigo, descripcion, categoria, unidad, costo, precio_venta, existencia, stock_minimo, perecedero, lote, vencimiento,
pres1_nombre, pres1_unidades, pres1_precio, pres1_codigo, pres2_nombre, pres2_unidades, pres2_precio, pres2_codigo

REGLAS
1. Un producto por fila. Si un perecedero tiene varios lotes, repite la fila con el MISMO codigo y distinto lote/vencimiento
   (descripcion, categoria, unidad, costo, precio y presentaciones iguales).
2. codigo: único, máx. 50. Usa EAN-13 válidos con prefijo 746 (dígito verificador correcto, pesos 1,3,1,3… sobre los 12 primeros dígitos)
   para productos envasados; para productos a granel o de elaboración propia usa códigos internos tipo "GRA-0001". Nunca repitas un código,
   ni entre productos ni entre presentaciones.
3. unidad: UND, LB, KG, OZ, GR, LT, GAL o ML. Frutas, verduras, carnes sueltas, arroz/habichuelas a granel: LB o KG. Líquidos sueltos: LT/GAL/ML.
   Envasados: UND. Costo, precio_venta, existencia y stock_minimo van POR esa unidad.
4. existencia: entero en UND; hasta 2 decimales en las demás unidades. Incluye algunos productos con existencia 0 y varios por debajo de stock_minimo.
5. precio_venta mayor que costo (margen 15 %–45 %). Montos en RD$ sin símbolo, punto decimal, sin separador de miles.
6. perecedero: "SI" para lácteos, carnes, embutidos, pan, huevos, frutas y verduras frescas, jugos frescos, comida preparada; "NO" para enlatados,
   arroz, pasta, aceite, refrescos, galletas, limpieza, etc.
7. lote y vencimiento: OBLIGATORIOS en perecederos con existencia > 0 (lote tipo "L2610-A"; vencimiento AAAA-MM-DD). Vacíos en no perecederos.
   Fecha de hoy: [AAAA-MM-DD]. Distribución de vencimientos: mayoría a más de 30 días; 8–10 % entre 4 y 7 días; 8–10 % entre 8 y 30 días;
   y exactamente 2 lotes ya vencidos (fecha anterior a hoy) para pruebas. Los lotes del mismo producto deben tener números y fechas distintos.
8. Presentaciones (pres1_*, pres2_*): úsalas en ~25 % de los productos envasados o de consumo masivo (ej. "Paquete x12", "Caja x24", "Funda x6").
   unidades = cuántas unidades base contiene; precio = precio del paquete completo, entre 5 % y 15 % menos que unidades × precio_venta;
   pres_codigo = EAN-13 válido propio (distinto del producto) o vacío. Productos sin presentación dejan esas columnas vacías.
9. categoria: usa entre 8 y 12 categorías coherentes (Lácteos, Carnes y Embutidos, Frutas y Verduras, Panadería, Bebidas, Abarrotes, Granos a granel,
   Enlatados, Limpieza, Higiene, Snacks, Congelados).
10. Mezcla casos: 40 % envasados en UND, 20 % a granel (LB/KG/LT), 40 % perecederos en total. Nombres en español dominicano comercial
    ("Habichuelas rojas", "Plátano verde", "Queso de freír", "Longaniza", "Salami Induveca", "Leche entera 1 L"). Marcas reales conocidas son aceptables.
11. Sin filas vacías, sin comentarios, sin comillas innecesarias; texto con comas entre comillas dobles. Codificación UTF-8.

AUTOVERIFICACIÓN (hazla antes de responder)
- No hay codigos repetidos. Todo EAN-13 tiene verificador correcto.
- Todo perecedero con existencia > 0 trae lote y vencimiento válidos.
- Ningún precio_venta <= costo. Ninguna presentación con precio mayor que unidades × precio_venta.
- Las unidades enteras (UND) no tienen decimales en existencia.

SALIDA: solo el bloque de código con el archivo completo.
```

## 4. Después de generar el archivo

1. Revisa con una hoja de cálculo: códigos repetidos, vencimientos pasados y precios menores al costo.
2. En FACTOS: activa *Configuración → Gestión de perecederos y lotes* **antes** de cargar (para que los productos perecederos queden controlados por lote).
3. *Importar Inventario* → subir → asignar columnas → vista previa → aplicar. Hazlo primero en una empresa de pruebas.
4. Verifica: *Inventario → Lotes y Vencimientos* (alertas ámbar/roja), el POS (descuentos por vencimiento, venta por peso y presentaciones) y el Dashboard.
