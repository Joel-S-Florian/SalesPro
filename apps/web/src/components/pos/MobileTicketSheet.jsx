import React, { useEffect } from 'react';
import { AnimatePresence, motion, useDragControls } from 'motion/react';
import { ChevronUp, ShoppingBag } from 'lucide-react';
import AnimatedMoney from './AnimatedMoney';

const DRAWER_EASE = [0.32, 0.72, 0, 1];

/**
 * Móvil/tablet: barra inferior con el resumen del ticket que abre el ticket completo en una hoja.
 * La hoja se cierra arrastrándola hacia abajo (también por velocidad: un gesto rápido basta), con
 * Escape o tocando el fondo.
 */
export default function MobileTicketSheet({ open, onOpen, onClose, units, total, children }) {
  const controls = useDragControls();

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = event => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  return (
    <>
      <div className="fixed inset-x-0 bottom-0 z-[44] border-t border-slate-200 bg-white/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 shadow-[0_-8px_24px_-12px_rgba(15,23,42,0.25)] backdrop-blur dark:border-slate-800 dark:bg-slate-900/95 lg:hidden">
        <button
          type="button"
          onClick={onOpen}
          aria-haspopup="dialog"
          className="flex h-14 w-full items-center justify-between gap-3 rounded-xl bg-indigo-600 px-4 text-white shadow-sm cursor-pointer"
        >
          <span className="flex items-center gap-2.5 text-sm font-medium">
            <span className="relative">
              <ShoppingBag className="h-5 w-5" />
              {units > 0 && (
                <motion.span
                  key={units}
                  initial={{ scale: 1.4 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', duration: 0.3, bounce: 0.4 }}
                  className="absolute -right-2 -top-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-white px-1 text-[10px] font-bold text-indigo-700"
                >
                  {units}
                </motion.span>
              )}
            </span>
            Ver ticket
          </span>
          <span className="flex items-center gap-2">
            <AnimatedMoney value={total} className="text-lg font-semibold tabular-nums" />
            <ChevronUp className="h-4 w-4 opacity-80" />
          </span>
        </button>
      </div>

      <AnimatePresence>
        {open && (
          <div className="fixed inset-0 z-[46] lg:hidden">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: { duration: 0.15 } }}
              transition={{ duration: 0.2 }}
              onClick={onClose}
              className="absolute inset-0 bg-slate-900/50"
            />
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label="Ticket de la venta"
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%', transition: { duration: 0.2, ease: DRAWER_EASE } }}
              transition={{ duration: 0.32, ease: DRAWER_EASE }}
              drag="y"
              dragControls={controls}
              dragListener={false}
              dragConstraints={{ top: 0, bottom: 0 }}
              dragElastic={{ top: 0, bottom: 0.6 }}
              onDragEnd={(_, info) => {
                if (info.offset.y > 120 || info.velocity.y > 500) onClose();
              }}
              className="absolute inset-x-0 bottom-0 flex max-h-[92dvh] flex-col rounded-t-2xl bg-white pb-[env(safe-area-inset-bottom)] shadow-2xl dark:bg-slate-900"
            >
              <div
                onPointerDown={event => controls.start(event)}
                className="flex shrink-0 cursor-grab touch-none justify-center py-3 active:cursor-grabbing"
                aria-hidden="true"
              >
                <span className="h-1.5 w-10 rounded-full bg-slate-300 dark:bg-slate-700" />
              </div>
              <div className="min-h-0 flex-1">{children}</div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
