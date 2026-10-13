# Devuelta por billetes y monedas

Estado: **hecho y probado** (`cashChange.test.js` con 13 pruebas, `scripts/test-cash-change.mjs` con 19 comprobaciones y recorrido en navegador).
Se activa por empresa en *Configuración → Calcular la devuelta por billetes y monedas al cobrar en efectivo* (apagado por defecto: sin activarlo, el POS cobra como siempre).

## Denominaciones

Billetes **2000, 1000, 500, 200, 100, 50** y monedas **25, 10, 5, 1** (`shared/utils/cashChange.js`, con copia para el navegador en `web/src/utils/cashChange.js`: mantenga ambas iguales).
Un *desglose* es `{ denominación: cantidad }`, por ejemplo `{ "1000": 1, "50": 2 }`.

## Cómo se calcula la devuelta eficiente

`makeChange(monto, caja)` reparte el monto usando **lo que hay en la caja**:
- Nunca entrega más piezas de las que existen.
- Minimiza un costo por pieza que sube a medida que se agota una denominación: la pieza *j* de una denominación con *a* disponibles cuesta `1 + 2·j/(a+1)`.
  Resultado: devuelve **de lo que más hay**, con **pocas piezas**, y evita dejar la caja sin lo que escasea (p. ej. prefiere tres monedas de 10 antes que gastar la última de 25 y la última de 5).
- Si no se puede dar el monto exacto, da lo más cercano por debajo e indica **cuánto falta**; el cajero puede ajustar la devuelta a mano.
- Lo que el cliente entrega también cuenta como disponible para la devuelta. Los centavos se redondean a pesos enteros (la devuelta se entrega en pesos).

## Flujo del cajero

1. **Abrir turno** (*Abrir turno* en la barra del POS): opcionalmente **contar billetes y monedas**; el fondo inicial pasa a ser su suma y queda guardado como conteo de apertura.
2. **Cobrar en efectivo:** se abre *Cobro en efectivo*. El cajero toca los billetes y monedas que recibe (o escribe el monto, o pulsa *Exacto*). El sistema muestra la **devuelta** y propone **qué entregar**.
3. **Confirmar:** la venta guarda lo recibido y la devuelta (`Sale.cashReceived` / `Sale.cashChange`). El servidor comprueba que lo recibido cubra el total y que la devuelta sea exactamente la diferencia.
4. La caja del turno se actualiza sola: **conteo de apertura + efectivo recibido − devueltas** (`GET /api/cashier/:id/drawer`). Si el turno se abrió sin conteo, o hubo movimientos no registrados,
   la sugerencia sigue funcionando pero avisa que puede no coincidir con la caja.

El **efectivo esperado del cierre** no cambia: fondo inicial + ventas en efectivo (recibido − devuelta = total de la venta).

## Cierre de caja con conteo por denominación

Al cerrar, el cajero puede abrir *Contar billetes y monedas de la caja*: el efectivo contado pasa a ser la suma del conteo (`CashierClose.closingCount`).
Si el turno se abrió con conteo, el modal muestra al instante las diferencias por pieza (p. ej. «RD$ 100 faltan 1») y el servidor las guarda en `summary.denominationDifferences`
(`{ denominación: { expected, counted, difference } }`, solo las que no cuadran). Sin conteo de apertura no hay base confiable y solo se compara el total, como antes.

## Pendiente / ideas

- Mostrar las diferencias por denominación en el reporte Z impreso y en el historial de cierres.
- Retiros e ingresos de efectivo durante el turno (alimentan la caja por denominación).
- Aviso de «poco cambio» (monedas o billetes bajos) y sugerencia de pedir cambio al banco.
- Reembolsos en efectivo de notas de crédito: no descuentan aún de la caja por denominación.
