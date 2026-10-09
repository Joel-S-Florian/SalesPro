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
};

/** Porcentaje de impuesto para mostrar en etiquetas, ej. 0.18 -> "18". */
export const formatTaxPercent = rate => String(Number((Number(rate) * 100).toFixed(2)));

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
