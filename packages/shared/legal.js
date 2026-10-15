/**
 * Documentos legales (BORRADORES pendientes de revisión de un abogado) y su versión.
 * La versión viaja con la aceptación al registrarse (`Company.termsVersion`); al cambiar los textos, súbala.
 * Los archivos viven en `apps/landing/public/legal/` y se sirven desde la página de promoción.
 */
export const TERMS_VERSION = '2026-10-borrador-1';

export const LEGAL_PAGES = [
  { id: 'terminos', title: 'Términos de servicio', path: '/legal/terminos.html' },
  { id: 'privacidad', title: 'Política de privacidad', path: '/legal/privacidad.html' },
  { id: 'seguridad', title: 'Política de seguridad', path: '/legal/seguridad.html' },
  { id: 'datos-personales', title: 'Tratamiento de datos personales', path: '/legal/datos-personales.html' },
];

/** Proveedores donde obtener el certificado digital para e-CF (sin precios: no están verificados). */
export const CERTIFICATE_PROVIDERS = [
  { name: 'Viafirma', url: 'https://viafirma.do', host: 'viafirma.do' },
  { name: 'Cámara de Comercio y Producción de Santo Domingo', url: 'https://digi.camarasantodomingo.do', host: 'digi.camarasantodomingo.do' },
];
