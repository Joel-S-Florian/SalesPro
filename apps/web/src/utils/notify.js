import { useToastStore } from '../stores/toastStore';

/** API simple para mostrar notificaciones desde cualquier lugar (componentes, utilidades, handlers). */
export const notify = {
  success: (message, action) => useToastStore.getState().push('success', message, action),
  error: (message, action) => useToastStore.getState().push('error', message, action),
  warning: (message, action) => useToastStore.getState().push('warning', message, action),
  info: (message, action) => useToastStore.getState().push('info', message, action),
};
