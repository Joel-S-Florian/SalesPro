import { AppError } from '../../../shared/exceptions/AppError.js';

/**
 * Proveedores de cobro con tarjeta. Cada uno implementa:
 *   - id, label
 *   - interactive: true si el cobro lo hace un terminal/servicio (el cajero solo pulsa «Cobrar»);
 *                  false si el cajero captura los datos del voucher (modo manual).
 *   - available: false si todavía no se puede usar (p. ej. falta el contrato con el procesador).
 *   - charge({ amount, config, manual, reference }) -> { status: 'APPROVED'|'DECLINED'|'ERROR', authCode, last4, brand, reference, message }
 *   - void({ payment, config }) -> { ok: boolean, message? }
 * Un rechazo NO lanza error (devuelve status DECLINED); los fallos de conexión devuelven ERROR.
 */

const digits = value => String(value ?? '').replace(/\D/g, '');

export const manualProvider = {
  id: 'MANUAL',
  label: 'Terminal independiente (el cajero captura la aprobación)',
  interactive: false,
  available: true,
  async charge({ manual }) {
    const authCode = String(manual?.authCode || '').trim().toUpperCase();
    const last4 = digits(manual?.last4).slice(-4);
    if (!/^[A-Z0-9]{4,12}$/.test(authCode)) throw AppError.badRequest('Escriba el código de aprobación del voucher (4 a 12 caracteres)');
    if (last4.length !== 4) throw AppError.badRequest('Escriba los últimos 4 dígitos de la tarjeta');
    return {
      status: 'APPROVED',
      authCode,
      last4,
      brand: manual?.brand ? String(manual.brand).slice(0, 20) : null,
      reference: manual?.reference ? String(manual.reference).slice(0, 40) : null,
      message: 'Aprobación capturada por el cajero',
    };
  },
  async void() {
    return { ok: true, message: 'Anule el cobro también en el terminal' };
  },
};

/** Simulador para pruebas: monto con centavos .13 = rechazado; .99 = error de conexión; el resto, aprobado. */
export const simulatorProvider = {
  id: 'SIMULATOR',
  label: 'Simulador (pruebas)',
  interactive: true,
  available: true,
  async charge({ amount }) {
    await new Promise(resolve => setTimeout(resolve, 600));
    const cents = Math.round(amount * 100) % 100;
    if (cents === 13) return { status: 'DECLINED', message: 'Fondos insuficientes (simulado)' };
    if (cents === 99) return { status: 'ERROR', message: 'El terminal no respondió (simulado)' };
    const authCode = String(Math.floor(100000 + Math.random() * 900000));
    return { status: 'APPROVED', authCode, last4: '4242', brand: 'VISA', reference: `SIM-${Date.now().toString(36).toUpperCase()}`, message: 'Aprobado (simulado)' };
  },
  async void() {
    return { ok: true, message: 'Anulado (simulado)' };
  },
};

/**
 * Azul (Banco Popular). BASE LISTA, SIN CONEXIÓN REAL: falta el contrato, las credenciales y la documentación técnica del
 * servicio que se vaya a usar (terminal físico, web service o página de pago). Cuando existan, implemente aquí `charge` y `void`
 * (la autenticación, el armado de la transacción y el mapeo de la respuesta a { status, authCode, last4, brand, reference })
 * sin tocar el resto del sistema: el POS, la venta y el cierre de caja ya consumen esta interfaz.
 */
export const azulProvider = {
  id: 'AZUL',
  label: 'Azul (próximamente)',
  interactive: true,
  available: false,
  async charge({ config }) {
    if (!config.merchantId || !config.hasSecret) throw AppError.badRequest('Azul: faltan las credenciales del comercio (comercio, terminal y clave) en Configuración');
    throw AppError.badRequest('La integración con Azul todavía no está habilitada: falta el contrato y la documentación técnica del procesador');
  },
  async void() {
    throw AppError.badRequest('La integración con Azul todavía no está habilitada');
  },
};

const PROVIDERS = { MANUAL: manualProvider, SIMULATOR: simulatorProvider, AZUL: azulProvider };

export const providerList = () => [
  { id: 'NONE', label: 'Sin terminal (solo marcar «tarjeta»)', interactive: false, available: true },
  ...Object.values(PROVIDERS).map(({ id, label, interactive, available }) => ({ id, label, interactive, available })),
];

export const getProvider = id => PROVIDERS[id] || null;
