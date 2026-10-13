# Especificación del archivo de importación de inventario

Este documento describe cómo debe ser un archivo para el módulo **Importar Inventario** de FACTOS.
Está pensado para dárselo a otro LLM (o a un proveedor) y que genere el archivo. **El archivo puede venir
sucio**: el importador limpia espacios, símbolos de moneda y formatos de número, y rechaza (sin detener la carga)
solo las filas que no se pueden salvar. Lo que sí debe estar presente son los datos mínimos de cada fila.

---

## 1. Formatos aceptados

| Formato | Extensión | Notas |
|---|---|---|
| CSV | `.csv` (también `.txt`) | Separador **coma** (`,`). Texto entre comillas dobles si contiene comas. UTF-8. |
| Excel | `.xlsx` | Se lee **solo la primera hoja**. No se aceptan `.xls` antiguos. |
| JSON | `.json` | Un arreglo de objetos, o un objeto que contenga ese arreglo (`productos`, `articulos`, `items`, `data`...). Se admiten objetos anidados. |

**Límites:** máximo **5.000 filas** por archivo y unos **7 MB**. Para más, dividir en varios archivos.

## 2. Estructura

- **CSV / Excel:** la **primera fila** son los encabezados (los nombres pueden ser cualquiera; luego se asignan
  a mano en el paso "Columnas", y el sistema propone una asignación automática por parecido de nombre).
  Cada fila siguiente es un producto. Las filas totalmente vacías se ignoran.
- **JSON:** cada objeto es un producto; las claves son las columnas. Las claves anidadas se aplanan con punto
  (`precios.costo`, `inventario.disponible`).

## 3. Datos de cada producto

| Dato | Obligatorio | Qué es | Qué tolera el importador |
|---|---|---|---|
| **Código** | **Sí** | Código de barras (EAN-13/UPC) o SKU. Es la clave única del producto. | Espacios sobrantes; minúsculas (se pasa a MAYÚSCULAS). Máx. 50 caracteres. |
| **Descripción** | **Sí** | Nombre del producto. | Espacios dobles/laterales, tabulaciones, caracteres invisibles. Se recorta a 200 caracteres. |
| **Costo unitario** | **Sí** | Lo que cuesta cada unidad (sin ITBIS de venta). | `$1,250.50`, `RD$ 85`, `1.234,50`, `85,5`, `"85"`. Debe ser un número ≥ 0. |
| Existencia | No | Unidades que entran. Si falta, se asume 0. | Texto o decimal (`"40"`, `40.0`); se redondea a entero en `UND` (a granel conserva 2 decimales). No puede ser negativa. |
| Precio de venta | No | Precio al público. Si falta, se calcula `costo + margen %` (el margen se elige en pantalla). | Mismos formatos de moneda que el costo. |
| Categoría | No | Nombre de la categoría. Si no existe, **se crea**. Si falta, se usa la categoría por defecto elegida en pantalla. | Mayúsculas/minúsculas indistintas para detectar una existente. |

### Datos de alimentos (opcionales)

| Dato | Qué es |
|---|---|
| Unidad de venta | `UND`, `LB`, `KG`, `OZ`, `GR`, `LT`, `GAL`, `ML` (se aceptan alias: libras, kilos, galón…). A granel la existencia admite 2 decimales. Si falta: `UND`. |
| Stock mínimo | Número ≥ 0 |
| Perecedero | `SI` / `NO` |
| Lote y vencimiento | `AAAA-MM-DD` (también `DD/MM/AAAA`). Obligatorios en un perecedero con existencia. Varias filas con el mismo código y distinto lote = varios lotes del mismo producto. |
| Presentación 1 y 2 | Nombre, unidades que contiene, precio del paquete y código de barras opcional |

Se asignan en el paso «Columnas» (sección *Datos de alimentos*). Un producto que ya existe conserva su unidad y presentaciones. Con *Perecederos y lotes*
apagado en Configuración, las filas perecederas se rechazan. Prompt y ejemplo completos: [`Prompt_Archivo_Ingesta_Alimentos.md`](Prompt_Archivo_Ingesta_Alimentos.md).

Cualquier **otra columna** (ubicación de almacén, SKU del proveedor, notas...) se **descarta**. No hace
falta que el archivo venga sin ellas.

## 4. Cuándo se rechaza una fila (queda "Inválida" y se omite)

- Código vacío.
- Descripción vacía.
- Costo vacío o no numérico (`abc`, `N/A`).
- Existencia o precio no numérico o negativo.
- Código **repetido** dentro del mismo archivo (se acepta la primera aparición; las siguientes se omiten).
- Sin categoría cuando no hay columna de categoría ni categoría por defecto.

Si el código ya existe en el sistema, la fila **no es un error**: es una **actualización** (suma existencia
y recalcula el costo promedio ponderado; el precio de venta solo cambia si se marca esa opción).

## 5. Recomendaciones para códigos de barras reales

- **EAN-13:** 13 dígitos; el último es un dígito verificador. Si el LLM inventa códigos, deben calcularse bien
  o el lector/etiquetas no los validarán. Rango de prueba sugerido: prefijo `746` (República Dominicana) seguido
  de 9 dígitos, más el dígito verificador.
- Un mismo código **no** puede repetirse en productos distintos.
- Para pruebas, el repositorio incluye un generador: `node scripts/generate-sample-inventory.mjs`
  (crea 30 productos con EAN-13 válidos en `Doc/ejemplos/`).

## 6. Ejemplos

### 6.1 CSV limpio
```csv
codigo_barras,descripcion,categoria,costo,precio_venta,existencia
7460001000004,"Arroz Selecto 5 lb",Abarrotes,142.5,182.4,40
7460001000370,"Habichuelas Rojas 1 lb",Abarrotes,48,62.4,60
```

### 6.2 CSV sucio (el importador lo resuelve)
```csv
SKU Proveedor,Descripción,Costo Unit.,Cant. Disponible,Lote Origen,Ubicación
 7460001000004 ,"  ARROZ SELECTO 5 LB   ","RD$ 142.50","40.0",LOTE-1000,ALM-1
 7460001000370 ,"  HABICHUELAS ROJAS 1 LB   ","48","60.0",LOTE-1001,ALM-2
7461000000000,"Producto sin costo",,5,LOTE-9,ALM-1
,"Producto sin código",10,5,LOTE-9,ALM-1
```
Resultado: las dos primeras filas se importan limpias; las dos últimas quedan "Inválidas" con su motivo.

### 6.3 JSON anidado
```json
{
  "proveedor": "Distribuidora de Prueba SRL",
  "articulos": [
    {
      "ean": "7460001000004",
      "nombre": "  Arroz Selecto 5 lb  ",
      "clasificacion": { "departamento": "Abarrotes" },
      "precios": { "costo": "$142.5", "venta": 182.4 },
      "inventario": { "disponible": "40", "almacen": "Principal" }
    }
  ]
}
```
Asignación en pantalla: código=`ean`, descripción=`nombre`, costo=`precios.costo`, existencia=`inventario.disponible`,
precio=`precios.venta`, categoría=`clasificacion.departamento`.

Los archivos completos de ejemplo están en `Doc/ejemplos/` (`inventario_limpio.csv`, `inventario_sucio.csv`,
`inventario_sucio.json`).

---

## 7. Prompt listo para pegar a otro LLM

```text
Genera un archivo de inventario de supermercado dominicano para importar en un sistema POS.

Entrega el resultado como [CSV | JSON] en un bloque de código, sin explicaciones.

Requisitos:
- Cantidad: [N] productos reales y variados (abarrotes, lácteos, bebidas, limpieza, higiene, panadería).
- Cada producto debe tener obligatoriamente: código, descripción y costo unitario en pesos dominicanos.
- Puede incluir también: existencia (entero), precio de venta (mayor que el costo) y categoría.
- Los códigos deben ser EAN-13 VÁLIDOS: 13 dígitos, comenzando con 746, con el dígito verificador
  calculado correctamente (pesos 1,3,1,3... sobre los 12 primeros dígitos). No repitas ningún código.
- Usa nombres de columna al estilo de un proveedor real (por ejemplo "SKU Proveedor", "Descripción",
  "Costo Unit.", "Cant. Disponible"); no importa cuáles, pero sé coherente.
- Agrega 2 o 3 columnas irrelevantes (lote, ubicación de almacén, fecha) para simular un archivo real.
- Es válido que el archivo venga algo sucio: espacios sobrantes, mayúsculas, montos como "RD$ 1,250.50"
  o "85,5", existencias como "40.0". Incluye además 3 filas defectuosas a propósito: una sin costo,
  una sin código y una con código repetido.
- CSV: separador coma, primera fila = encabezados, texto con comas entre comillas dobles, UTF-8.
- JSON: un arreglo de objetos (o un objeto con el arreglo dentro); puedes anidar precios e inventario.
```

> Si el LLM no puede calcular bien el dígito verificador, pídele códigos de 12 dígitos y complétalos con
> `scripts/generate-sample-inventory.mjs` como referencia, o usa el generador del repositorio directamente.
