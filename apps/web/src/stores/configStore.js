import { create } from 'zustand';
import { api } from '../services/api';

export const DEFAULT_CONFIG = {
  business: {
    name: 'FACTOS',
    rnc: '',
    address: '',
    phone: '',
    email: '',
  },
  taxRate: 0.18,
  receiptFormat: 'A4',
  paymentMethods: ['EFECTIVO', 'TARJETA'],
  vendedorCanDiscount: false,
  requireOpenShift: false,
  perishable: {
    enabled: false,
    yellowThresholdDays: 30,
    redThresholdDays: 7,
    blockExpiredSales: true,
    autoDiscountEnabled: false,
    discountRules: [
      { daysRemaining: 3, discountPercent: 30 },
      { daysRemaining: 7, discountPercent: 15 },
    ],
  },
};

/** Porcentaje de impuesto para mostrar en etiquetas, ej. 0.18 -> "18". */
export const formatTaxPercent = rate => {
  const percent = Number(rate) * 100;
  const whole = Math.round(percent);
  // La tasa que se muestra se deduce de ITBIS/base de la venta; el redondeo de centavos la deja en 18.01 en lugar de 18
  return String(Math.abs(percent - whole) < 0.2 ? whole : Number(percent.toFixed(2)));
};

/**
 * Configuración global del sistema (ITBIS, datos del negocio, métodos de pago...).
 * Se carga al iniciar sesión; fuera de React se lee con useConfigStore.getState().config.
 */
export const useConfigStore = create(set => ({
  config: DEFAULT_CONFIG,
  loaded: false,

  load: async () => {
    try {
      const config = await api.config.get();
      set({ config: { ...DEFAULT_CONFIG, ...config }, loaded: true });
    } catch {
      // se mantienen los valores por defecto si el API no responde
    }
  },

  setConfig: config => set({ config: { ...DEFAULT_CONFIG, ...config }, loaded: true }),
}));
