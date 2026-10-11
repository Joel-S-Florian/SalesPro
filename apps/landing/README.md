# @factos/landing

Página de promoción de FACTOS: sitio estático (Vite + React + Tailwind) sin backend, independiente del sistema. Se despliega por separado
(por ejemplo `factos.tudominio.com` para la página y `app.tudominio.com` para el sistema).

## Desarrollo

```bash
npm run dev:landing          # http://localhost:5190
npm run build --workspace @factos/landing   # genera apps/landing/dist
```

## Configuración (`apps/landing/.env`, opcional)

| Variable | Para qué |
|---|---|
| `VITE_API_URL` | API de FACTOS que recibe las solicitudes (por defecto `http://localhost:4010/api`) |
| `VITE_CONTACT_EMAIL` | Correo de respaldo si el API no responde. **Cámbielo antes de publicar**: por defecto es un marcador de posición |
| `VITE_WHATSAPP` | Número con código de país, solo dígitos. Si se define, aparece el botón de WhatsApp |
| `VITE_APP_URL` | Dirección del sistema (botón "Entrar") |

**Empezar gratis** y **Entrar** apuntan al sistema (`VITE_APP_URL`): el primero abre el asistente de registro (`/?registro=1`) y el segundo
la pantalla de inicio de sesión.

El formulario de contacto envía la solicitud al API de FACTOS (`POST /api/public/leads`, con límite de 5 por hora por IP y campo trampa anti-bots); llega a la
bandeja **Solicitudes** del panel de plataforma. Si el API no responde, abre el correo del visitante con los datos ya escritos (respaldo).
El origen de la página debe estar en `CORS_ORIGIN` del API (lista separada por comas).

## Contenido

- `src/components/LiveReceipt.jsx`: ticket animado del inicio (con "reducir movimiento" se muestra quieto).
- `src/components/Tour.jsx`: recorrido con capturas reales en `public/img/` (datos de demostración). Para renovarlas, tome nuevas
  capturas del sistema con datos de ejemplo y reemplace los archivos.
- `src/components/Sections.jsx`: funciones, pasos, bloque fiscal, planes y preguntas frecuentes.
- **Textos con compromiso:** los planes y precios son los de referencia de la hoja de ruta y la facturación electrónica (e-CF) figura como
  "en desarrollo". Actualice ambos cuando cambien.
