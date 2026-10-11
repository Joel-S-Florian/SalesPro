# Facturación electrónica (e-CF, DGII)

Estado: **fases 0 a 4 hechas y probadas contra el simulador local de la DGII.** Falta la fase 5 (DGII real: certificado de
INDOTEL, habilitación en la Oficina Virtual, set de pruebas de pre-certificación, dominio público HTTPS). Este documento es la referencia técnica viva.

## Cómo funciona la conexión con la DGII

1. **Token (lo que pide el sistema a la DGII):** `GET semilla` → se firma la semilla con el certificado digital de la empresa →
   `POST validarsemilla` → la DGII devuelve un **JWT de 1 hora**. Se envía como `Authorization: Bearer …` en el resto de los servicios.
2. **Modelo:** cada empresa se certifica ante la DGII usando FACTOS como su software. El certificado `.p12` y su contraseña los
   sube la empresa y se guardan **cifrados** (AES-256-GCM, llave `ECF_MASTER_KEY`). El token es de la **empresa** (no del
   usuario), vive en memoria del servidor, se renueva 5 minutos antes de vencer, se comparte entre sus usuarios y cajas, y se
   precalienta al iniciar sesión. No va en la sesión del navegador.
3. **Ambientes:** `PRECERT` → `testecf`, `CERT` → `certecf`, `PROD` → `ecf`. Cada empresa tiene su modo (Apagado por defecto).
4. **Directorio (buscar clientes):** `consultadirectorio/obtenerdirectorioporrnc` indica si un RNC es emisor electrónico y a qué
   URL enviarle el e-CF (fase 3).

Fuentes oficiales (PDF de la DGII): *Descripción Técnica Servicios DGII*, *Descripción Técnica Emisores Electrónicos*,
*Preguntas Técnicas e-CF*, *Proceso de Certificación con Proveedor*.

## Fase 0: corrección fiscal (hecha)

- **Catálogo de la serie B corregido** (`packages/shared/constants.js`): B01 crédito fiscal, B02 consumo, B03 nota de débito,
  B04 nota de crédito, B11 compras, B12 registro único de ingresos, B13 gastos menores, B14 regímenes especiales,
  B15 gubernamental, B16 exportaciones. Antes la lógica asignaba B01 al consumidor y B02 al contribuyente (invertido).
- **`determineNCFType`** vive solo en `shared/utils/dgii.js` (se re-exporta desde `ncf.js`): cliente con RNC → **B01**; consumidor final → **B02**.
- **Notas de crédito** (`sales.service.js: createCreditNote`): tipo **B04**, referencia a la venta original (`Sale.relatedSaleId`),
  **montos y cantidades negativos** (por eso caja, reportes y totales restan solos), **devuelven el stock** y registran un
  movimiento `DEVOLUCION`. Solo se puede devolver lo vendido y aún no devuelto; ITBIS y descuento van en la misma proporción.
- Los reportes ya usan B04 y las etiquetas de la DGII.
- Datos de desarrollo: las ventas creadas antes de este cambio tienen el tipo invertido; no se corrigieron (no hay datos reales).

## Configuración (Configuración → Facturación electrónica)

Pasos: datos fiscales → certificado → secuencias autorizadas → direcciones a registrar → probar conexión → modo.
Solo `ADMINISTRADOR`. Las respuestas nunca incluyen el certificado, su contraseña ni el token; todo cambio queda en `AuditLog`.
Producción solo se activa con certificado vigente, RNC de la empresa coincidente y **sin** simulador configurado.

API (`/api/ecf`): `GET/PUT /config`, `POST/DELETE /certificate`, `POST /test-connection`, `GET/POST /sequences`,
`PUT/DELETE /sequences/:id`.

### Variables de entorno

| Variable | Uso |
|---|---|
| `ECF_MASTER_KEY` | 32 bytes en base64. **Obligatoria** para guardar certificados. En producción, guárdela en un gestor de secretos; rotarla exige volver a cifrar. |
| `ECF_BASE_URL_OVERRIDE` | Apunta todos los servicios al simulador (p. ej. `http://localhost:4090`). Vacía en producción; con ella puesta no se puede activar PROD. |
| `PUBLIC_API_URL` | Dirección pública del API; con ella se calculan las URL que cada empresa registra ante la DGII. |

## Emisión (fase 2)

- **Cuándo se emite e-CF:** si la empresa tiene modo PRECERT/CERT/PROD. Cliente con RNC → **E31**; consumidor final → **E32**;
  devolución → **E34**. Con modo apagado se sigue emitiendo la serie B de papel.
- **Todo en una transacción:** venta + e-NCF (`allocateENcf`, atómico) + XML + firma + validación contra los XSD oficiales
  (`xmllint-wasm`, siempre sobre el XML ya firmado). Si algo falla, no se vende ni se consume número. El envío es posterior.
- **XML** (`ecf.builder.js`): E31/E32/E34, RFCE, ARECF, ACECF, ANECF. Sin espacios entre etiquetas; fechas `dd-MM-yyyy` en hora RD (UTC-4).
  El descuento global se reparte entre líneas. Los 15 XSD oficiales están en `modules/ecf/xsd/` (los de E31, RFCE y ACECF no compilaban
  y se parcharon al mínimo; ver `xsd/README.md`).
- **Firma** (`ecf.signer.js`): XML-DSig RSA-SHA256, `Reference URI=""`, una transformación enveloped, firma como último hijo.
  Código de seguridad = 6 primeros caracteres de `SignatureValue`. QR de consulta de timbre (`ecf.stamp.js`).
- **Cola** (`ecf.outbox.js`): tabla `EcfDocument` como outbox, reclamo optimista, reintentos 30 s … 1 h y pase a **CONTINGENCY** tras 8 intentos.
  E32 < RD$250,000 se informa con **RFCE** (respuesta inmediata, se guarda el e-CF completo); el resto va a recepción → `trackId` → consulta de resultado
  (0 no encontrado, 1 aceptado, 2 rechazado, 3 en proceso, 4 condicional). Estados: PENDING, SENT, ACCEPTED, CONDITIONAL, REJECTED, ERROR, CONTINGENCY, STORED.
- **Notas de crédito electrónicas (E34)** igual que B04: negativas, devuelven stock, referencia a la venta.
- **Recibo** (`receiptPdf.js`): QR, e-NCF, código de seguridad y fecha de firma. El POS muestra el estado en vivo.

## Intercambio (fase 3)

- **Directorio** (`ecf.directory.service.js`): `Clientes → Consultar en la DGII` guarda si el RNC es emisor electrónico y sus URL de recepción/aprobación.
  Solo existe en `testecf` y `ecf` (no en certecf).
- **Entrega al comprador** (`ecf.delivery.js`): tras aceptar la DGII, si el comprador es emisor electrónico se le envía el e-CF; se procesa su ARECF y,
  si responde, su aprobación comercial. Las URL se validan contra SSRF (`ecf.safety.js`: solo HTTPS a hosts públicos).
- **Receptor público** (`/api/ecf-receptor/:rnc/fe/recepcion/api/ecf` y `.../fe/aprobacioncomercial/api/ecf`): valida XSD, firma, certificado = RNC del emisor,
  comprador = la empresa y duplicados; responde un ARECF firmado (motivos 1 especificación, 2 firma, 3 duplicado, 4 comprador no corresponde).
  Límite 120 peticiones/min. Los e-CF recibidos quedan en `EcfInbox`. La autenticación opcional del receptor no está implementada.
- **Aprobación comercial:** desde Recibidos se aprueba o rechaza; se genera un ACECF firmado que se envía a la DGII y al emisor.

## Operación (fase 4)

- **Anulación de rangos** (`ecf.void.service.js`): ANECF a la DGII, solo desde el siguiente número sin usar.
- **Tablero** (menú *Facturación electrónica*): KPI (aceptados, en proceso, con error, rechazados), alertas (certificado por vencer, secuencias por agotarse,
  rechazos), pestañas Emitidos / Recibidos / Numeración. El detalle de cada venta muestra estado, motivo de rechazo, entrega, aprobación, XML y reintento.
- Reporte *Fiscal* con e-NCF y estado DGII; huecos de numeración para B y E.

API adicional (`/api/ecf`): `summary`, `documents`, `sales/:id` (+`/status`, `/xml`, `/retry`), `customers/:id/check`, `inbox` (+`/xml`, `/respond`), `void-ranges`.

## Simulador de la DGII

```
node scripts/dgii-sim.mjs 4090          # SIM_TOKEN_TTL_SECONDS=60 para probar la renovación
# apps/api/.env →  ECF_BASE_URL_OVERRIDE=http://localhost:4090
```

Implementa semilla, validación de semilla firmada (verifica la firma y que no se reutilice), directorio, recepción, resultado, RFCE,
aprobación comercial, anulación y un "otro contribuyente" (RNC 101010101). Es una aproximación: **no reemplaza** el set de pruebas
oficial de pre-certificación. Certificado de prueba: `generateTestPkcs12()` en `modules/ecf/ecf.certificate.js`.

## Pruebas

- `npx vitest run` en `apps/api` (100 pruebas: cifrado, certificado, firma, token, builder contra XSD, anti-SSRF).
- `node --env-file=apps/api/.env scripts/test-credit-notes.mjs` (B01/B02/B04, stock, reportes, caja).
- `scripts/test-ecf-config.mjs` (API de configuración), `scripts/test-ecf-sales.mjs` (emisión, rechazo, reintento, anulación),
  `scripts/test-ecf-peers.mjs` (directorio, entrega, receptor, aprobaciones). Todos limpian sus datos.

## Pendiente para la fase 5 (DGII real)

- Certificado real de INDOTEL, habilitación en la Oficina Virtual (Alta NCF, FI-GDF-016), set de pruebas de pre-certificación, postulación y declaración jurada.
- Dominio público con HTTPS para registrar las URL de recepción y aprobación.
- Confirmar con la DGII: canonicalización exacta, reglas de contingencia, si un RNC admite varios tokens vivos, requisitos de PSFE.
- Autenticación opcional del receptor; tablas de provincia/municipio por nombre (hoy códigos libres validados por XSD).
- Plazo: según blogs (no verificado) pequeños y micro deben emitir desde el 15-nov-2026.
