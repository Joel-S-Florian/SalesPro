# Plan de pruebas: lectores de código de barras y pantallas del POS

Cómo probar todo el flujo de lectura de códigos **sin productos físicos**, y cómo se haría en una tienda real.
Incluye también la prueba de la **pantalla del cliente** y la **vista de caja**.

---

## 1. Cómo funciona un lector en una tienda real

| Tipo de lector | Cómo lo ve el sistema | En FACTOS |
|---|---|---|
| **USB / Bluetooth en modo teclado (HID)** — el más común | Teclea el código muy rápido y pulsa Enter, como si fuera un teclado. | Funciona **sin configurar nada** con el POS abierto. Detecta teclas con menos de 50 ms entre sí. |
| **Serial / COM** (lectores fijos de mostrador) | Envía el código por un puerto COM. | Botón con icono de enchufe en el POS (solo Chrome/Edge). |
| **Cámara** (teléfono, tablet, webcam) | Decodifica la imagen. | Botón de cámara en el POS. |
| **Teléfono como lector** (apps tipo *Barcode to PC*) | La app del teléfono escanea y "teclea" en la computadora. | Se comporta como un lector HID: ver prueba 3. |

El flujo real de una venta: el cajero escanea cada artículo → aparece en el carrito (y en la pantalla del cliente) →
se elige el método de pago → se cobra → se imprime el comprobante.

## 2. Preparación de datos (una sola vez)

1. Generar los archivos de ejemplo (30 productos con EAN-13 válidos):
   ```
   node scripts/generate-sample-inventory.mjs
   ```
2. En FACTOS, entrar como **administrador** → **Importar Inventario** → subir `Doc/ejemplos/inventario_limpio.csv`.
   Asignar columnas (el sistema las propone), elegir margen y aplicar. Quedan 30 productos con existencia.
3. (Opcional) Probar también `inventario_sucio.csv` y `inventario_sucio.json` para ver el manejo de errores.
4. Ir a **Etiquetas / Códigos** → seleccionar los productos → ver la vista previa de los códigos.

## 3. Cómo "tener" códigos para escanear

Elige una de estas opciones (de la más simple a la más realista):

| Opción | Qué necesitas | Notas |
|---|---|---|
| **A. Escanear la pantalla** | El teléfono + un segundo monitor (o la propia laptop). | Abrir **Etiquetas / Códigos** en una ventana/monitor y apuntar el lector del teléfono a la pantalla. Subir el brillo y el zoom del navegador (Ctrl +) si cuesta leer. |
| **B. Imprimir etiquetas** | Una impresora común (papel carta). | Botón **Imprimir** en Etiquetas / Códigos (3 columnas por hoja; recortar). Es lo más parecido a una tienda real. Imprimir al 100%, sin "ajustar a página". |
| **C. Etiquetas de otro papel** | Cualquier producto con código real en casa (caja de cereal, botella). | Sirve para probar el lector, pero ese código **no existe** en FACTOS: usarlo para probar el mensaje "no se encontró producto", o crear un producto con ese código. |

## 4. Pruebas paso a paso

> Para todas: iniciar sesión, ir al **POS** y, si usas cajas, abrir turno.

### Prueba 1: Simulación sin ningún dispositivo (consola del navegador)
Pega esto en la consola (F12) con el POS abierto y un código real de tus productos:
```js
(async (code) => {
  for (const k of code) { window.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true })); await new Promise(r => setTimeout(r, 10)); }
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
})('7460001000004')
```
**Esperado:** el producto se agrega al carrito. Repetir el mismo código antes de 3 s **no** lo agrega otra vez.

### Prueba 2: Entrada manual
Escribir el código completo en el buscador del POS y pulsar **Enter**. **Esperado:** se agrega al carrito.

### Prueba 3: Teléfono como lector HID (Barcode to PC en iPhone)
1. Instalar la app en el iPhone y su programa/servidor en la computadora; emparejar (misma red Wi-Fi).
2. Dejar el cursor en una zona que **no** sea un campo de texto del POS (por ejemplo, clic en un espacio vacío de la
   página). *El buscador del POS también acepta lecturas.*
3. Escanear una etiqueta (de la pantalla o impresa).
4. **Esperado:** el producto aparece en el carrito sin tocar el teclado.

> Nota: estas apps suelen teclear el código con una pausa **mayor a 50 ms** entre caracteres (por la red). Si la
> lectura no se detecta en el carrito, el código aparecerá escrito como texto; en ese caso usa el buscador del POS
> (Enter agrega el producto) o prueba la cámara (prueba 4). Ver "Problemas conocidos".

### Prueba 4: Cámara
1. Abrir FACTOS desde `http://localhost:5173` en la computadora (la cámara exige HTTPS o localhost).
2. Botón de **cámara** junto al buscador → permitir el acceso.
3. Apuntar a una etiqueta (pantalla o impresa). **Esperado:** el carrito crece y
   aparece "Último: <código>" en la ventana de la cámara. Se pueden escanear varios seguidos.
4. Para usarla **desde el teléfono**, el servidor debe estar en HTTPS (por ejemplo con un túnel); desde otra IP en
   HTTP el navegador bloqueará la cámara.

### Prueba 5: Código inexistente y duplicados
- Escanear un código que no está en el sistema → mensaje "No se encontró ningún producto con el código ...".
- Escanear el mismo código dos veces seguidas en menos de 3 s → se cuenta una sola vez; pasados 3 s suma otra unidad.
- Escanear un producto con existencia 0 → mensaje de stock insuficiente.

### Prueba 6: Venta completa
Escanear 3-4 productos distintos → ajustar cantidades → cobrar → ver el comprobante. Verificar en **Inventario / Kárdex**
que las existencias bajaron, y en **Cierres de Caja** que la venta quedó en el turno.

## 5. Pantalla del cliente y vista de caja

### Pantalla del cliente (segundo monitor)
1. En el POS, botón **Pantalla del cliente** → se abre una ventana nueva.
2. Arrastrar la ventana al segundo monitor y hacer **doble clic** para pantalla completa.
3. Escanear productos en el POS. **Esperado:** la pantalla del cliente muestra cada artículo, cantidad, importe y el
   total en grande, en tiempo real. Al cobrar muestra "¡Gracias por su compra!" con el total durante 12 segundos.
4. Solo funciona entre ventanas del **mismo navegador y equipo** (no usa red). Si cierras y reabres la ventana del
   cliente, se vuelve a sincronizar sola.

### Vista de caja
Botón **Vista de caja** del POS: agranda la interfaz (≈120 %) y cubre el menú lateral, dejando el POS ocupando toda la
ventana. El botón de expandir (al lado) activa además la pantalla completa del navegador.
Para salir: **Salir de vista de caja**. La preferencia se recuerda en ese equipo.

## 6. Problemas conocidos / límites

- **Lectores lentos:** la detección HID asume menos de 50 ms entre teclas. Algunas apps de teléfono son más lentas;
  si ocurre, subir ese umbral (constante `MAX_KEY_GAP_MS` en `apps/web/src/hooks/useBarcodeScanner.js`) o usar
  cámara/búsqueda manual.
- **Códigos de barras sin Enter final:** el lector debe estar configurado para enviar Enter (casi todos lo hacen por
  defecto).
- **Cámara en Firefox:** usa el decodificador ZXing (más lento que el nativo de Chrome/Edge).
- **Iluminación y tamaño:** una etiqueta pequeña o con reflejos falla en cámara; aumentar tamaño (zoom) o imprimir.
- **Pantalla del cliente en otro equipo:** no soportado todavía (requeriría WebSocket o servidor). Hoy es
  solo para dos monitores conectados a la misma computadora.

## 7. Checklist final

- [ ] Importación de `inventario_limpio.csv` (30 productos)
- [ ] Importación de `inventario_sucio.csv` (30 buenos, 3 inválidos con motivo)
- [ ] Importación de `inventario_sucio.json` (12 productos)
- [ ] Lectura por consola (prueba 1) y búsqueda manual (prueba 2)
- [ ] Lectura con teléfono (prueba 3) o cámara (prueba 4)
- [ ] Código inexistente / duplicado / sin stock (prueba 5)
- [ ] Venta completa con kárdex y cierre de caja (prueba 6)
- [ ] Pantalla del cliente y vista de caja (sección 5)
