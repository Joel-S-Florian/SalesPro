import React from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { CheckCircle2, AlertCircle, AlertTriangle, Info, X } from 'lucide-react';
import { useToastStore } from '../stores/toastStore';

const STYLES = {
  success: { icon: CheckCircle2, accent: 'text-emerald-500', ring: 'border-emerald-200 dark:border-emerald-900/60' },
  error: { icon: AlertCircle, accent: 'text-rose-500', ring: 'border-rose-200 dark:border-rose-900/60' },
  warning: { icon: AlertTriangle, accent: 'text-amber-500', ring: 'border-amber-200 dark:border-amber-900/60' },
  info: { icon: Info, accent: 'text-indigo-500', ring: 'border-indigo-200 dark:border-indigo-900/60' },
};

/**
 * Contenedor de notificaciones (esquina inferior derecha). Los errores se anuncian de forma asertiva
 * a lectores de pantalla; el resto, de forma cortés.
 */
export default function ToastHost() {
  const toasts = useToastStore(state => state.toasts);
  const dismiss = useToastStore(state => state.dismiss);

  return (
    <div
      className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 w-[calc(100vw-2rem)] sm:w-96 pointer-events-none"
      aria-live="polite"
    >
      <AnimatePresence initial={false}>
        {toasts.map(toast => {
          const { icon: Icon, accent, ring } = STYLES[toast.type] || STYLES.info;
          return (
            <motion.div
              key={toast.id}
              layout
              role={toast.type === 'error' ? 'alert' : 'status'}
              initial={{ opacity: 0, y: 16, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, transition: { duration: 0.14, ease: [0.23, 1, 0.32, 1] } }}
              transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
              className={`pointer-events-auto flex items-start gap-3 rounded-xl border bg-white dark:bg-slate-900 px-4 py-3 shadow-[0_8px_30px_rgba(15,23,42,0.12)] ${ring}`}
            >
              <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${accent}`} />
              <div className="flex-1">
                <p className="text-[13px] leading-snug text-slate-700 dark:text-slate-200">{toast.message}</p>
                {toast.action && (
                  <button
                    type="button"
                    onClick={() => {
                      toast.action.onClick();
                      dismiss(toast.id);
                    }}
                    className="mt-1.5 rounded-md bg-indigo-600 px-2.5 py-1 text-xs font-semibold text-white cursor-pointer"
                  >
                    {toast.action.label}
                  </button>
                )}
              </div>
              <button
                onClick={() => dismiss(toast.id)}
                aria-label="Cerrar notificación"
                className="shrink-0 -mr-1 p-1 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
