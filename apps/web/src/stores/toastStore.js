import { create } from 'zustand';

let nextId = 1;
const DURATION = { success: 3500, info: 4000, warning: 5000, error: 6000 };

/**
 * Notificaciones efímeras. Fuera de React se usan con `notify` (utils/notify.js).
 */
export const useToastStore = create((set, get) => ({
  toasts: [],

  // `action` = { label, onClick }: botón dentro de la notificación (p. ej. «Ver planes»)
  push: (type, message, action) => {
    if (!message) return null;
    const id = nextId++;
    // Un mensaje idéntico no se apila: se reemplaza (conservando la acción si la tenía)
    set(state => {
      const same = state.toasts.find(t => t.message === message);
      return { toasts: [...state.toasts.filter(t => t.message !== message), { id, type, message, action: action || same?.action }].slice(-4) };
    });
    setTimeout(() => get().dismiss(id), DURATION[type] || 4000);
    return id;
  },

  dismiss: id => set(state => ({ toasts: state.toasts.filter(t => t.id !== id) })),
}));
