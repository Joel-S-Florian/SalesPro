import { useToastStore } from '../stores/toastStore';

/** API simple para mostrar notificaciones desde cualquier lugar (componentes, utilidades, handlers). */
export const notify = {
  success: message => useToastStore.getState().push('success', message),
  error: message => useToastStore.getState().push('error', message),
  warning: message => useToastStore.getState().push('warning', message),
  info: message => useToastStore.getState().push('info', message),
};
