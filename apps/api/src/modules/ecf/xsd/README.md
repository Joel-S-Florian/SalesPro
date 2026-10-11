# Esquemas XSD oficiales de la DGII

Descargados del portal de la DGII (Facturación Electrónica → Documentación sobre e-CF → Documentación Técnica (XSD)).
Se usan en `../ecf.xsd.js` para validar cada comprobante firmado antes de enviarlo.

## Parches mínimos (para que compilen con libxml2)

La DGII publica algunos esquemas con errores que impiden compilarlos. Solo se corrigió eso; no se cambió ninguna regla de negocio.

| Archivo | Problema original | Corrección |
|---|---|---|
| `ecf-31.xsd` | Usa `IndicadorServicioTodoIncluidoType` pero no la define (sí existe en `ecf-32.xsd`) | Se copió la definición del E32 |
| `rfce-32.xsd` | Patrones con sintaxis no válida en XSD: `(?:` y `[12][$0-9]`, y `.` sin escapar en decimales | `(?:` → `(`, `[$0-9]` → `[0-9]`, `.` → `\.` |
| `acecf.xsd` | Patrón con `(?:20\|20)` | `(?:` → `(` |

Si la DGII publica versiones nuevas, vuelva a descargarlas y reaplique estas correcciones.
