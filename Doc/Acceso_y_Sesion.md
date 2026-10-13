# Acceso y sesión: recuperar contraseña, clave temporal, cierre por inactividad y avisos por correo

Estado: **hecho y probado** (`scripts/test-auth-recovery.mjs` y recorrido en navegador).

## Correo saliente (avisos de la landing y recuperación)

El API envía correos por SMTP (`nodemailer`, `apps/api/src/shared/utils/mailer.js`). Variables en `apps/api/.env`:

| Variable | Uso |
|---|---|
| `SMTP_HOST`, `SMTP_PORT` (587), `SMTP_USER`, `SMTP_PASS`, `SMTP_SECURE` | Servidor SMTP (Gmail con contraseña de aplicación, Brevo, Resend SMTP, SES, etc.) |
| `MAIL_FROM` | Remitente, p. ej. `FACTOS <no-responder@tudominio.com>` |
| `NOTIFY_EMAIL` | **A dónde llegan** las solicitudes de la landing y los registros nuevos |
| `WEB_URL` | Dirección pública del sistema, para los enlaces de los correos (`http://localhost:5180` en desarrollo) |

Sin `SMTP_HOST` y `MAIL_FROM` **no se envía nada** (queda un aviso en el log), pero **nada se pierde**: cada solicitud de la landing se guarda siempre en la bandeja
*Solicitudes* del panel de plataforma. El correo es un aviso adicional; si falla, no tumba la solicitud.

- **Landing → «Enviar mensaje»:** `POST /api/public/leads` guarda la solicitud (límite por IP, campo trampa contra bots) y envía un correo a `NOTIFY_EMAIL`
  (con el correo del interesado en *Responder a*, si dejó uno). Cada cuenta nueva del registro autónomo también avisa.
- Si hace falta que lleguen a más de un sitio (WhatsApp/Telegram), el punto único es `sendMail` y `createLead`.

## ¿Olvidaste tu contraseña?

- El usuario puede tener un **correo** (opcional; se pone en *Personal / Roles*). Las cuentas creadas con el registro autónomo ya lo tienen (su usuario es su correo).
- Login → «¿Olvidaste tu contraseña?» → escribe usuario o correo → `POST /api/auth/forgot-password`. **La respuesta es siempre la misma**, exista o no la cuenta.
- Si la cuenta tiene correo se envía un enlace de **un solo uso, válido 30 minutos** (`/?reset=…`). Solo se guarda el hash SHA-256 del enlace; pedir uno nuevo anula los anteriores;
  máximo 3 por hora y usuario y límite por IP.
- `POST /api/auth/reset-password` fija la contraseña nueva (8+ caracteres, letras y números) y **cierra todas las sesiones** del usuario.
- **Sin correo registrado:** el administrador de la empresa le asigna una **clave temporal** (editar usuario → contraseña). Esa clave es temporal: al entrar, el sistema obliga a
  cambiarla (`mustChangePassword`). Al administrador lo restablece la plataforma (*Empresas → usuarios → restablecer*), que también deja la clave como temporal.
- En desarrollo, sin SMTP, el enlace se imprime en el log del API (`[DEV] Enlace de recuperación…`) para poder probar el flujo. Nunca en producción.
- Cualquier usuario puede **cambiar su contraseña** desde el menú lateral («Cambiar contraseña»).

## Cierre de sesión por inactividad

- **Navegador** (`components/auth/SessionGuard.jsx`): cuenta como actividad tocar, mover el ratón, escribir (el lector de códigos también), desplazarse; se comparte entre pestañas.
  Un minuto antes aparece «¿Sigues ahí?» con cuenta regresiva y «Seguir conectado». Al cumplirse, la sesión se cierra y la pantalla de acceso lo explica.
  Si el equipo estuvo dormido o la pestaña cerrada más del límite, al volver cierra de inmediato.
- **Servidor:** la renovación de sesión se rechaza si nadie la renovó en (límite + 15 min), así un token olvidado en un navegador no sigue vivo (`Session.lastActivityAt`).
- **Configuración → Seguridad de la sesión:** minutos sin actividad (30 por defecto; `0` = nunca). Por empresa (`SystemConfig` clave `security`).
- Aviso de diseño: lo que haya en el carrito del POS sin cobrar se pierde al cerrar la sesión.

## Pruebas

`node --env-file=apps/api/.env scripts/test-auth-recovery.mjs` (26 comprobaciones: enlaces, vencimiento, un solo uso, límite por hora, clave temporal, inactividad en el servidor,
solicitud de landing sin SMTP). Limpia sus datos en «Empresa Prueba».
