import { DEFAULT_WELCOME_MESSAGE, normalizeWhatsappNumber, whatsappLink } from '@factos/shared/contact.js';

/**
 * Datos que cambian de un despliegue a otro. Se pueden fijar en un archivo `.env` de apps/landing:
 *   VITE_CONTACT_EMAIL=correo que recibirá las solicitudes de acceso
 *   VITE_WHATSAPP_NUMBER=18095550000   (WhatsApp Business, formato internacional; opcional. También se acepta VITE_WHATSAPP)
 *   VITE_WHATSAPP_MESSAGE=Hola, quiero información sobre FACTOS.   (mensaje de bienvenida; opcional)
 *   VITE_APP_URL=https://app.tudominio.com   (donde vive el sistema; botón "Entrar")
 *   VITE_API_URL=https://api.tudominio.com/api   (API de FACTOS: recibe las solicitudes de acceso)
 */
export const CONTACT_EMAIL = import.meta.env.VITE_CONTACT_EMAIL || 'REEMPLAZAR@tu-correo.com';
export const WHATSAPP = normalizeWhatsappNumber(import.meta.env.VITE_WHATSAPP_NUMBER || import.meta.env.VITE_WHATSAPP || '');
export const WHATSAPP_MESSAGE = import.meta.env.VITE_WHATSAPP_MESSAGE || DEFAULT_WELCOME_MESSAGE;
/** Enlace wa.me con el mensaje de bienvenida (o uno propio); '' si no hay número configurado. */
export const whatsappHref = (message = WHATSAPP_MESSAGE) => whatsappLink(WHATSAPP, message);
export const APP_URL = import.meta.env.VITE_APP_URL || 'http://localhost:5180';
// Alta de cuenta nueva: el registro vive dentro del sistema (plan → cuenta → negocio → configuración)
export const SIGNUP_URL = `${APP_URL.replace(/\/$/, '')}/?registro=1`;
export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4010/api';

export const BUSINESS_TYPES = ['Colmado o minimarket', 'Ferretería', 'Tienda de ropa o calzado', 'Farmacia o perfumería', 'Supermercado', 'Otro'];
