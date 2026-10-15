import { AppError } from '../../shared/exceptions/AppError.js';

/**
 * Proveedores de cobro de la suscripción. Todo el sistema pasa por esta interfaz; hoy solo el cobro MANUAL está activo
 * (el SUPERADMIN registra una transferencia ya recibida). Azul queda como esqueleto DESHABILITADO: sin credenciales, sin llamadas
 * de red y sin cobrar nada, hasta que haya contrato (ver Doc/Cobros_y_Suscripciones.md).
 *
 * Contrato de un proveedor (`PaymentProvider`):
 *   id        'MANUAL' | 'AZUL'     se guarda en SubscriptionPayment.provider
 *   label     nombre para mostrar
 *   enabled   solo un proveedor habilitado puede registrar cobros
 *   recurring ¿cobra solo cada mes? (Azul sí, cuando exista; el manual no)
 *   collect(input) → { status: 'PAID' | 'PENDING' | 'FAILED', reference, method, failureReason? }
 *        recibe { companyId, plan, amount, currency, method, reference } y devuelve el resultado normalizado.
 */

/** Cobro manual: el dinero ya se recibió por fuera (transferencia, depósito, efectivo) y el SUPERADMIN lo registra. */
export const ManualProvider = {
  id: 'MANUAL',
  label: 'Manual (transferencia o depósito)',
  enabled: true,
  recurring: false,
  methods: ['TRANSFER', 'DEPOSIT', 'CASH', 'OTHER'],
  async collect({ method, reference }) {
    return { status: 'PAID', method, reference: reference || null };
  },
};

/**
 * Esqueleto de Azul (pasarela de tarjeta con cobro recurrente). NO está habilitado: no lee credenciales, no abre conexiones.
 * Cuando se firme el contrato aquí irán: tokenizar la tarjeta (página de pago alojada de Azul, nunca el número en FACTOS), crear el cobro,
 * confirmar el resultado (respuesta o webhook firmado) y reintentar los cobros fallidos.
 */
export const AzulProvider = {
  id: 'AZUL',
  label: 'Azul (tarjeta, cobro recurrente)',
  enabled: false,
  recurring: true,
  methods: ['CARD'],
  async collect() {
    throw AppError.badRequest('El cobro con tarjeta (Azul) todavía no está habilitado. Registra el pago como transferencia.');
  },
};

const PROVIDERS = { MANUAL: ManualProvider, AZUL: AzulProvider };

export const listProviders = () => Object.values(PROVIDERS).map(({ id, label, enabled, recurring, methods }) => ({ id, label, enabled, recurring, methods }));

/** Devuelve un proveedor habilitado; si no existe o está apagado, falla con un mensaje claro. */
export function getProvider(id = 'MANUAL') {
  const provider = PROVIDERS[id];
  if (!provider) throw AppError.badRequest('Proveedor de cobro no válido');
  if (!provider.enabled) throw AppError.badRequest(`El proveedor «${provider.label}» no está habilitado`);
  return provider;
}
