/**
 * Datos que cambian de un despliegue a otro. Se pueden fijar en un archivo `.env` de apps/landing:
 *   VITE_CONTACT_EMAIL=correo que recibirá las solicitudes de acceso
 *   VITE_WHATSAPP=18095550000   (solo dígitos con código de país; opcional)
 *   VITE_APP_URL=https://app.tudominio.com   (donde vive el sistema; botón "Entrar")
 *   VITE_API_URL=https://api.tudominio.com/api   (API de FACTOS: recibe las solicitudes de acceso)
 */
export const CONTACT_EMAIL = import.meta.env.VITE_CONTACT_EMAIL || 'REEMPLAZAR@tu-correo.com';
export const WHATSAPP = import.meta.env.VITE_WHATSAPP || '';
export const APP_URL = import.meta.env.VITE_APP_URL || 'http://localhost:5180';
// Alta de cuenta nueva: el registro vive dentro del sistema (plan → cuenta → negocio → configuración)
export const SIGNUP_URL = `${APP_URL.replace(/\/$/, '')}/?registro=1`;
export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4010/api';

export const BUSINESS_TYPES = ['Colmado o minimarket', 'Ferretería', 'Tienda de ropa o calzado', 'Farmacia o perfumería', 'Supermercado', 'Otro'];
