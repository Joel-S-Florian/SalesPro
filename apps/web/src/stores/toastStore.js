import { create } from 'zustand';

let nextId = 1;
const DURATION = { success: 3500, info: 4000, warning: 5000, error: 6000 };

/**
 * Notificaciones efímeras. Fuera de React se usan con `notify` (utils/notify.js).
 */
export const useToastStore = create((set, get) => ({
  toasts: [],

  push: (type, message) => {
    if (!message) return null;
    const id = nextId++;
    // Un mensaje idéntico y reciente no se apila: se reemplaza
    set(state => ({
      toasts: [...state.toasts.filter(t => !(t.type === type && t.message === message)), { id, type, message }].slice(-4),
    }));
    setTimeout(() => get().dismiss(id), DURATION[type] || 4000);
    return id;
  },

  dismiss: id => set(state => ({ toasts: state.toasts.filter(t => t.id !== id) })),
}));
