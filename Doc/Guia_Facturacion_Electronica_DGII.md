# Guía de estudio: Facturación Electrónica DGII (e-CF) y su configuración en FACTOS

> Documento de estudio, **no es asesoría legal ni contable**. Lo marcado con ⚠️ no está verificado en una fuente oficial
> y debe confirmarse con la DGII, el contador o un abogado antes de decidir. Fuentes oficiales usadas (PDF de la DGII):
> *Descripción Técnica Servicios DGII* (act. 02-01-2026), *Descripción Técnica Emisores Electrónicos*,
> *Preguntas Técnicas e-CF*, *Proceso de Certificación con Proveedor*. Detalle técnico de la implementación:
> [`Facturacion_Electronica.md`](Facturacion_Electronica.md).

---

## 1. Qué es y por qué importa

La **Factura Electrónica (e-CF, Comprobante Fiscal Electrónico)** reemplaza al comprobante de papel con número de
comprobante fiscal (NCF, serie B). En vez de imprimir una factura con un NCF autorizado, el contribuyente genera un
**archivo XML firmado digitalmente**, lo envía a la DGII, y la DGII lo **valida y acepta o rechaza** en el momento. Lo que
se entrega al cliente es una *representación impresa* (RI) con un **código QR** y un **código de seguridad**.

Lo sensible: el e-CF es el documento que sustenta el ITBIS y el gasto del cliente. Un e-CF mal emitido, no enviado o
rechazado puede significar que la venta **no tiene validez fiscal**. Por eso el sistema nunca debe "vender sin
comprobante" en silencio: si la DGII no responde, el e-CF queda en cola y se reintenta (contingencia).

Base legal: Ley 32-23 de Facturación Electrónica y normas generales de la DGII. ⚠️ Confirmar números de norma vigentes.

## 2. ¿Se puede tener el POS sin facturación electrónica?

- La **obligación es del contribuyente que factura** (la empresa que usa el POS), **no del software**. Un POS que emite
  NCF de papel (serie B) no es "ilegal" por sí mismo.
- Cada contribuyente tiene un **calendario** para pasar a e-CF según su tamaño. Cuando le toque, **ya no podrá seguir
  facturando con NCF de papel**; su software tiene que emitir e-CF.
- ⚠️ Según blogs contables (no verificado en fuente oficial), los pequeños, micro y no clasificados tienen fecha límite el
  **15 de noviembre de 2026**. Grandes y medianos tenían fechas anteriores.
- Consecuencia comercial: si FACTOS se vende a negocios que emiten comprobantes fiscales, **necesita e-CF** o los clientes
  tendrán que usar otro sistema al llegar su fecha. Un negocio que solo vende a consumidor final sin comprobante fiscal
  también debe ver qué le exige el calendario. **Pregunta a la DGII y a un contador** antes de prometerlo en la landing.

## 3. Tipos de comprobante

| Tipo | Nombre | Uso |
|---|---|---|
| **E31** | Factura de crédito fiscal | Cliente con RNC que se deduce el ITBIS |
| **E32** | Factura de consumo | Consumidor final |
| E33 | Nota de débito | Aumenta un comprobante anterior |
| **E34** | Nota de crédito | Devolución o anulación parcial/total (referencia al original) |
| E41 | Compras | Compras a informales |
| E43 | Gastos menores | |
| E44 | Regímenes especiales | |
| E45 | Gubernamental | |
| E46 | Exportaciones | |
| E47 | Pagos al exterior | |

FACTOS emite hoy E31, E32 y E34. El **e-NCF** = `E` + tipo (2 dígitos) + **10 dígitos** (13 caracteres), por ejemplo
`E310000000001`. Cada tipo tiene su propio rango de secuencia autorizado por la DGII, con fecha de vencimiento.

Serie B de papel (para entender el cambio): B01 crédito fiscal, B02 consumo, B03 nota de débito, B04 nota de crédito.

## 4. El ciclo completo, paso a paso

### 4.1 Autenticación (el "token")
1. `GET /autenticacion/api/autenticacion/semilla` → la DGII devuelve una **semilla** (un XML con un valor aleatorio).
2. El sistema **firma la semilla** con el certificado digital de la empresa.
3. `POST /autenticacion/api/autenticacion/validarsemilla` (multipart, campo `xml`) → la DGII verifica la firma y devuelve un
   **token JWT válido 1 hora**.
4. Todo lo demás se envía con `Authorization: Bearer {token}`.

En FACTOS el token es de la **empresa** (no del usuario): vive en memoria del servidor, se renueva 5 minutos antes de
vencer, se comparte entre cajas y usuarios, y no llega al navegador.

### 4.2 Armar y firmar el e-CF
- Se genera el XML según los **XSD oficiales** (FACTOS valida contra ellos antes de enviar).
- Se firma con **XML-DSig** (RSA-SHA256). El **certificado debe estar a nombre del RNC/cédula del emisor**.
- **Código de seguridad** = primeros 6 caracteres de la firma (`SignatureValue`). Va en el QR y en la RI.
- Un XML firmado **no se puede alterar**: cualquier cambio invalida la firma.

### 4.3 Enviar a la DGII (hay dos caminos)
- **E31, E34 y facturas ≥ RD$250,000** → `POST /recepcion/api/facturaselectronicas` → devuelve un **trackId**. Luego se
  consulta `GET /consultaresultado/api/consultas/estado?trackid=` hasta tener resultado.
- **E32 < RD$250,000 (la mayoría del mostrador)** → se envía un **resumen RFCE** a `fc.dgii.gov.do`, con respuesta
  inmediata (aceptado/rechazado, sin trackId). El **XML completo se guarda** en el emisor (no se envía completo).

Estados del resultado: 0 no encontrado · **1 aceptado** · **2 rechazado** · 3 en proceso · 4 aceptado condicional.

### 4.4 Entregar al cliente
- **Primero a la DGII, después al cliente.** No se entrega como válido algo que la DGII no aceptó.
- Cliente que **no** es emisor electrónico → recibe la **representación impresa** (con QR).
- Cliente que **sí** es emisor electrónico → se le envía el XML a su URL de recepción (se consulta en el **directorio**
  de contribuyentes). Él responde con un **ARECF** (acuse de recibo firmado) y luego puede dar su **aprobación
  comercial (ACECF)**.

### 4.5 Ser también receptor
Todo emisor debe poder **recibir** e-CF de sus proveedores. Debe exponer, con ruta estándar y **HTTPS accesible desde
internet**: `POST /fe/recepcion/api/ecf` (responde un ARECF firmado en el momento) y `POST /fe/aprobacioncomercial/api/ecf`.
Motivos de rechazo del ARECF: 1 error de especificación · 2 error de firma · 3 duplicado · 4 el comprador no corresponde.

### 4.6 Anulación de rangos (ANECF)
Los números autorizados que no se van a usar se **anulan por rango** ante la DGII (solo números sin usar). Una factura ya
emitida **no se borra**: se corrige con una **nota de crédito (E34)**.

## 5. Ambientes de la DGII

| Ambiente | Para qué | Ruta |
|---|---|---|
| **Pre-certificación** | Pruebas del set oficial | `.../testecf/...` |
| **Certificación** | Validación final | `.../certecf/...` |
| **Producción** | Facturas reales | `.../ecf/...` |

Hosts: `ecf.dgii.gov.do` y `fc.dgii.gov.do`. El directorio de contribuyentes solo existe en `testecf` y `ecf`.
En FACTOS cada empresa elige su modo: **Apagado, Pre-certificación, Certificación o Producción**.

## 6. Cómo se certifica una empresa (usando FACTOS como su software)

Modelo elegido: **cada cliente se certifica ante la DGII** usando FACTOS (el diseño deja abierta la opción de que FACTOS sea
proveedor certificado, "PSFE", más adelante — ⚠️ requisitos por confirmar con la DGII).

Pasos del cliente (la empresa):
1. **Requisitos:** RNC activo, usuario en la **Oficina Virtual (OFV)** de la DGII, y solicitar la **autorización de
   secuencias (Alta de NCF)** para e-CF.
2. **Certificado digital** (`.p12`/`.pfx`) emitido por una entidad certificadora autorizada (**INDOTEL**), a nombre del RNC
   o cédula de quien factura. Tiene vencimiento y contraseña.
3. **Formulario de solicitud** (FI-GDF-016) y habilitación para pruebas.
4. **Pruebas en pre-certificación:** primero los tipos 31 y 33–47 y luego 32 y RFCE. La DGII entrega un **set de pruebas**
   que hay que enviar correctamente. Los envíos de prueba se guardan 60 días; las secuencias de prueba van del 1 al
   10,000,000 (E32: 1 al 50,000,000).
5. **Postulación** firmada: se registran las **URL de recepción, aprobación y autenticación** de la empresa.
6. **Declaración jurada** firmada.
7. **Habilitación** en la OFV → la empresa pasa a **producción** y puede emitir e-CF reales.

Cada empresa tarda **semanas** en este proceso; conviene empezar con un primer cliente real en paralelo al desarrollo.

## 7. Cómo se configura en FACTOS

Ruta: **Configuración → pestaña "Facturación electrónica"** (solo `ADMINISTRADOR`). Pasos de la pantalla:

1. **Datos fiscales:** RNC, razón social, dirección, provincia y municipio.
2. **Certificado:** subir el `.p12` y su contraseña. Se guarda **cifrado** (AES-256-GCM); la llave nunca vuelve al
   navegador. El sistema valida contraseña, que el titular coincida con el RNC y la vigencia (alerta a < 30 días).
3. **Secuencias autorizadas:** por tipo (E31, E32, E34), rango `desde–hasta` y fecha de vencimiento, tal como las
   autorizó la DGII.
4. **URL a registrar ante la DGII:** FACTOS calcula las direcciones de recepción y aprobación de la empresa
   (`/api/ecf-receptor/{RNC}/fe/...`); se copian y se registran en la postulación. Requieren **dominio público HTTPS**.
5. **Probar conexión:** pide el token a la DGII (semilla → firma → token) y muestra "Conectado · ambiente X".
6. **Modo:** Apagado → Pre-certificación → Certificación → Producción. Producción solo se activa con certificado vigente,
   RNC coincidente y sin simulador configurado.

Variables de entorno del servidor:

| Variable | Uso |
|---|---|
| `ECF_MASTER_KEY` | 32 bytes en base64. Obligatoria para guardar certificados. En producción, en un gestor de secretos. |
| `ECF_BASE_URL_OVERRIDE` | Apunta todo al **simulador** local. Debe estar **vacía** en producción. |
| `PUBLIC_API_URL` | Dirección pública del API; sirve para calcular las URL a registrar. |

**Qué pasa en una venta (modo activo):** se crea la venta, se asigna el e-NCF, se arma, firma y valida el XML **todo en la
misma transacción** (si algo falla no se vende ni se consume número). El envío a la DGII es posterior, en una cola con
reintentos (30 s … 1 h); tras 8 intentos pasa a **contingencia**. El POS muestra el estado (Pendiente / Aceptado /
Rechazado) y el recibo lleva QR, e-NCF y código de seguridad.

**Tablero** (menú *Facturación electrónica*): aceptados, en proceso, con error, rechazados; alertas (certificado por
vencer, secuencias por agotarse); pestañas Emitidos, Recibidos y Numeración; reintentar, bajar XML, aprobar/rechazar
comprobantes recibidos y anular rangos.

## 8. Estado actual en FACTOS y qué falta

Hecho y probado contra un **simulador local** de la DGII: token, firma, XML E31/E32/E34/RFCE/ARECF/ACECF/ANECF validado
contra los XSD, cola con reintentos, directorio, entrega y recepción, aprobación comercial, anulación de rangos y tablero.

**Falta (fase 5, con la DGII real):**
- Certificado real de INDOTEL y habilitación del primer cliente (OFV, Alta de NCF, FI-GDF-016).
- Cambiar del simulador a `testecf` y **ajustar lo que la DGII rechace**; pasar el **set de pruebas oficial**.
- Dominio público con HTTPS para las URL de recepción.
- ⚠️ Confirmar con la DGII: canonicalización exacta de la firma, reglas de **contingencia** (qué hacer si la DGII está
  caída), si un mismo RNC puede tener **varios tokens vivos** a la vez, y requisitos para ser **PSFE**.
- Autenticación opcional del receptor; tablas de provincia/municipio por nombre.

## 9. Riesgos fiscales a tener presentes

- **Certificado vencido** = no se puede firmar ni emitir. Alerta a 30 días y renovar con tiempo.
- **Secuencia agotada o vencida** = no se puede emitir. Pedir nueva autorización antes de agotarla.
- **Rechazo de la DGII:** el comprobante no tiene validez; hay que corregir y emitir de nuevo (la corrección de uno ya
  aceptado es con nota de crédito, no borrándolo).
- **Hora/fecha:** las fechas van en hora de República Dominicana (UTC-4); un servidor con hora errada genera rechazos.
- **DGII caída:** el comprobante queda en cola/contingencia; no entregar como definitivo hasta que se acepte (⚠️ confirmar
  reglas de contingencia).
- **Producción vs pruebas:** nunca mezclar. Un e-CF de pruebas no vale; uno de producción no se puede deshacer.
- **Datos del comprador** (RNC) incorrectos → rechazo (E31). Consultar el directorio antes.
- **Notas de crédito:** toda devolución con comprobante electrónico se hace con E34 referenciando el original.

## 10. Checklist para el primer cliente

- [ ] Verificar con la DGII/contador la fecha de obligación del cliente.
- [ ] RNC activo y usuario en la Oficina Virtual.
- [ ] Solicitar certificado digital (INDOTEL) a nombre del RNC.
- [ ] Alta de secuencias de NCF electrónico (E31, E32, E34) y fechas de vencimiento.
- [ ] Dominio público HTTPS para FACTOS y `PUBLIC_API_URL` configurada.
- [ ] Configurar en FACTOS: datos fiscales, certificado, secuencias; **Probar conexión** en pre-certificación.
- [ ] Correr el set de pruebas oficial; corregir rechazos.
- [ ] Registrar URL de recepción y aprobación (postulación) y firmar la declaración jurada.
- [ ] Pasar a producción; primeras ventas vigiladas en el tablero.
- [ ] Capacitar al cajero: qué significa Pendiente / Rechazado y a quién avisar.

## 11. Glosario

- **e-CF:** comprobante fiscal electrónico. **e-NCF:** su número (E + tipo + 10 dígitos).
- **RFCE:** resumen de factura de consumo menor a RD$250,000.
- **ARECF:** acuse de recibo del e-CF. **ACECF:** aprobación comercial. **ANECF:** anulación de rangos.
- **RI:** representación impresa (con QR). **OFV:** Oficina Virtual de la DGII.
- **PSFE:** proveedor de servicios de facturación electrónica certificado.
- **XSD:** esquema que define cómo debe ser el XML. **XML-DSig:** estándar de firma digital de XML.
- **trackId:** identificador que devuelve la DGII para consultar el resultado de un envío.
