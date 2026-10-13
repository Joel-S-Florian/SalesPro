# Pagos con tarjeta y terminal de pago

Estado: **base hecha y probada** (`scripts/test-card-payments.mjs`, 27 comprobaciones, y recorrido en navegador). La conexión real con **Azul** está pendiente de contrato,
credenciales y documentación técnica: la interfaz ya está lista y solo falta implementar `charge` y `void` en `modules/payments/providers/index.js`.

## Modos de cobro (Configuración → Pagos con tarjeta, solo administradores)

| Modo | Qué hace |
|---|---|
| **Sin terminal** (por defecto) | Igual que siempre: al elegir «Tarjeta» solo se marca el método de pago. No cambia nada para quien no lo configure. |
| **Terminal independiente (manual)** | El cajero cobra en su terminal y escribe el **código de aprobación** y los **últimos 4 dígitos** del voucher (y la marca). Queda ligado a la venta. |
| **Simulador** | Pruebas sin tarjeta real: aprueba; un monto con centavos `.13` se rechaza y `.99` simula un fallo del terminal. |
| **Azul** | Aún no se puede activar. Guarda ya los datos del comercio (comercio, terminal, clave **cifrada** con `ECF_MASTER_KEY`, nunca devuelta al navegador). |

## Flujo en el POS

1. El cajero elige **Tarjeta** y pulsa **Cobrar** (F9). Con terminal configurado se abre la ventana *Cobro con tarjeta* con el monto.
2. Manual: captura aprobación y últimos 4. Terminal/simulador: pulsa **Cobrar** y el sistema envía el monto y espera la respuesta.
3. **Aprobado** → se registra la venta y el cobro queda ligado (`CardPayment.saleId`). **Rechazado o con error** → se informa el motivo y se puede reintentar, usar otra tarjeta
   o cancelar (y cobrar en efectivo). Nada se vende sin cobro aprobado.
4. Si el cobro fue aprobado pero la venta **no se pudo registrar** (p. ej. stock), el sistema **anula el cobro** automáticamente.

## Reglas de seguridad

- El servidor exige, para una venta con tarjeta, un cobro **aprobado, libre y por el monto exacto** del total (tolerancia de 1 centavo). Si el total cambió, **anula el cobro** y pide cobrar de nuevo.
- Un cobro **no se puede usar en dos ventas** (se reclama de forma atómica dentro de la transacción de la venta).
- Un cobro libre lo anula su cajero o un administrador; uno ya ligado a una venta solo se revierte con **nota de crédito** (el reembolso en el terminal es manual por ahora).
- Un cobro con tarjeta no se puede adjuntar a una venta en efectivo. Límite de 20 cobros por minuto y conexión.
- El detalle de la venta incluye la tarjeta (marca, últimos 4, aprobación) para consulta; nunca se guarda el número completo ni el CVV.

## Datos

`CardProviderConfig` (una por empresa: proveedor, ambiente, comercio, terminal, clave cifrada) y `CardPayment` (proveedor, estado `APPROVED/DECLINED/VOIDED/ERROR`, monto, aprobación,
últimos 4, marca, referencia, caja, usuario, venta). Ambas por empresa (`TENANT_MODELS`). API: `GET/PUT /api/payments/card/config`, `POST /api/payments/card/charge`,
`POST /api/payments/card/:id/void`.

## Para integrar Azul (cuando haya contrato)

1. Obtener del procesador: tipo de integración (terminal físico, web service o página de pago), credenciales de pruebas y la documentación técnica.
2. Implementar `azulProvider.charge({ amount, config })` y `void({ payment, config })` (autenticar, armar la transacción, mapear la respuesta a `{ status, authCode, last4, brand, reference }`),
   poner `available: true` y probar contra su ambiente de pruebas con el simulador como referencia.
3. Pendientes naturales: reembolso automático desde la nota de crédito, conciliación de tarjetas en el cierre de caja y propina/cuotas si el procesador las maneja.
