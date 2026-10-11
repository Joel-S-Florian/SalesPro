import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useAnimationControls, useReducedMotion } from 'motion/react';
import { CUSTOMER_DISPLAY_CHANNEL } from '../utils/customerDisplay';
import AnimatedMoney from '../components/pos/AnimatedMoney';
import { money } from '../utils/format';

const EMPTY = {
  business: { name: 'FACTOS' },
  items: [],
  totals: { subtotal: 0, discount: 0, tax: 0, total: 0 },
  taxPercent: '18',
};

const EASE = [0.23, 1, 0.32, 1];
const GRID = 'grid grid-cols-[minmax(0,1fr)_11rem_13rem_13rem] gap-4';

/** Número/texto que "salta" brevemente cada vez que cambia (cantidad, importe). */
function Pop({ value, className = '', reduce }) {
  return (
    <motion.span
      key={String(value)}
      initial={reduce ? false : { scale: 1.18, opacity: 0.5 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: 'spring', duration: 0.35, bounce: 0.4 }}
      className={`inline-block ${className}`}
    >
      {value}
    </motion.span>
  );
}

/** Línea del ticket: entra deslizándose con un destello, se actualiza con pequeños saltos y sale encogiéndose. */
function Row({ item, reduce }) {
  return (
    <motion.div
      layout="position"
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 28, backgroundColor: 'rgba(99, 102, 241, 0.35)' }}
      animate={{ opacity: 1, y: 0, backgroundColor: 'rgba(99, 102, 241, 0)' }}
      exit={reduce ? { opacity: 0 } : { opacity: 0, x: -40, transition: { duration: 0.18 } }}
      transition={{ duration: 0.45, ease: EASE, backgroundColor: { duration: 1.2 } }}
      className={`${GRID} items-center rounded-xl px-3 py-4 text-3xl`}
    >
      <div className="min-w-0">
        <p className="truncate font-semibold">{item.name}</p>
        <AnimatePresence initial={false}>
          {item.expiryDiscount > 0 && (
            <motion.p
              key="expiry"
              initial={reduce ? { opacity: 0 } : { opacity: 0, y: -6, scale: 0.94 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3, ease: EASE }}
              className="mt-1 inline-flex items-center gap-2 rounded-full bg-amber-400/15 px-3 py-0.5 text-xl font-semibold text-amber-300"
            >
              Descuento por vencimiento{item.expiryPercent ? ` ${item.expiryPercent}%` : ''}
            </motion.p>
          )}
        </AnimatePresence>
      </div>
      <p className="text-center font-mono">
        <Pop value={item.quantityText} reduce={reduce} />
      </p>
      <p className="text-right font-mono text-slate-300">
        {money(item.unitPrice)}
        {item.unitLabel && <span className="block text-lg text-slate-500">por {item.unitLabel}</span>}
      </p>
      <p className="text-right font-mono font-bold">
        <AnimatedMoney value={item.total} />
        {item.discount > 0 && <span className="block text-lg font-normal text-amber-400">desc. -{money(item.discount)}</span>}
      </p>
    </motion.div>
  );
}

/** Total fijo: cuenta hasta el nuevo valor y da un latido corto cuando cambia. */
function TotalBlock({ totals, taxPercent, reduce }) {
  const pulse = useAnimationControls();
  useEffect(() => {
    if (!reduce && totals.total > 0) pulse.start({ scale: [1, 1.06, 1], transition: { duration: 0.45, ease: EASE } });
  }, [totals.total, reduce, pulse]);
  return (
    <footer className="shrink-0 border-t border-slate-700 bg-slate-900 px-10 py-6">
      <div className="flex items-end justify-between gap-8">
        <dl className="space-y-1 text-2xl text-slate-300">
          <div className="flex justify-between gap-10">
            <dt>Subtotal</dt>
            <dd className="font-mono"><AnimatedMoney value={totals.subtotal} /></dd>
          </div>
          <AnimatePresence initial={false}>
            {totals.discount > 0 && (
              <motion.div
                key="discount"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.25, ease: EASE }}
                className="flex justify-between gap-10 overflow-hidden text-amber-400"
              >
                <dt>Descuento</dt>
                <dd className="font-mono">-<AnimatedMoney value={totals.discount} /></dd>
              </motion.div>
            )}
          </AnimatePresence>
          <div className="flex justify-between gap-10">
            <dt>ITBIS ({taxPercent}%)</dt>
            <dd className="font-mono"><AnimatedMoney value={totals.tax} /></dd>
          </div>
        </dl>
        <div className="text-right">
          <p className="text-3xl uppercase tracking-widest text-slate-400">Total a pagar</p>
          <motion.p
            animate={pulse}
            className="origin-right font-mono text-8xl font-black text-emerald-400"
          >
            <AnimatedMoney value={totals.total} />
          </motion.p>
        </div>
      </div>
    </footer>
  );
}

function ThankYou({ completed, business, reduce }) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const timer = setTimeout(() => setShown(completed.total), 250);
    return () => clearTimeout(timer);
  }, [completed.total]);
  const rise = delay => ({
    initial: reduce ? { opacity: 0 } : { opacity: 0, y: 24 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.5, ease: EASE, delay },
  });

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="flex h-screen flex-col items-center justify-center gap-6 bg-emerald-600 p-8 text-center text-white"
    >
      <motion.svg
        viewBox="0 0 120 120"
        className="h-48 w-48"
        initial={reduce ? false : { scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', duration: 0.6, bounce: 0.35 }}
        aria-hidden="true"
      >
        <circle cx="60" cy="60" r="54" fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="6" />
        <motion.path
          d="M34 62 L53 80 L88 42"
          fill="none"
          stroke="white"
          strokeWidth="9"
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={reduce ? false : { pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.55, ease: EASE, delay: 0.25 }}
        />
      </motion.svg>
      <motion.h1 {...rise(0.3)} className="text-6xl font-extrabold">¡Gracias por su compra!</motion.h1>
      <motion.p {...rise(0.4)} className="text-3xl opacity-90">Total pagado</motion.p>
      <motion.p {...rise(0.45)} className="font-mono text-8xl font-black"><AnimatedMoney value={shown} /></motion.p>
      <motion.p {...rise(0.55)} className="text-2xl opacity-80">{business.name}</motion.p>
    </motion.div>
  );
}

function Welcome({ reduce }) {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 p-10 text-center">
      <motion.div
        animate={reduce ? undefined : { y: [0, -10, 0] }}
        transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut' }}
        className="mb-2 text-8xl"
        aria-hidden="true"
      >
        🛒
      </motion.div>
      <motion.p initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: EASE }} className="text-7xl font-extrabold">
        ¡Bienvenido!
      </motion.p>
      <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.6, delay: 0.25 }} className="text-3xl text-slate-400">
        Los artículos aparecerán aquí a medida que se registren.
      </motion.p>
    </main>
  );
}

/**
 * Pantalla para el cliente: se abre en una segunda ventana/monitor y recibe el carrito del POS
 * por BroadcastChannel (misma máquina y navegador; no usa la red ni el servidor).
 * La barra de totales queda fija abajo; solo la lista de artículos se desplaza.
 */
export default function CustomerDisplay() {
  const reduce = useReducedMotion();
  const [state, setState] = useState(EMPTY);
  const [completed, setCompleted] = useState(null);
  const [connected, setConnected] = useState(false);
  const listRef = useRef(null);

  useEffect(() => {
    document.title = 'Pantalla del cliente';
    const channel = new BroadcastChannel(CUSTOMER_DISPLAY_CHANNEL);
    let resetTimer;

    channel.onmessage = event => {
      const message = event.data;
      if (message?.type === 'cart') {
        clearTimeout(resetTimer);
        setCompleted(null);
        setConnected(true);
        setState({ ...EMPTY, ...message.payload });
      } else if (message?.type === 'sale-complete') {
        setConnected(true);
        setCompleted(message.payload);
        resetTimer = setTimeout(() => setCompleted(null), 12000);
      }
    };
    channel.postMessage({ type: 'hello' });

    return () => {
      clearTimeout(resetTimer);
      channel.close();
    };
  }, []);

  // Mantiene visible el último artículo agregado
  useEffect(() => {
    if (listRef.current) listRef.current.scrollTo({ top: listRef.current.scrollHeight, behavior: reduce ? 'auto' : 'smooth' });
  }, [state.items.length, reduce]);

  const toggleFullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen?.();
  };

  const { items, totals, taxPercent, business } = state;

  if (completed) {
    return (
      <div onDoubleClick={toggleFullscreen}>
        <ThankYou completed={completed} business={business} reduce={reduce} />
      </div>
    );
  }

  return (
    <div
      onDoubleClick={toggleFullscreen}
      title="Doble clic para pantalla completa"
      className="flex h-screen select-none flex-col overflow-hidden bg-slate-950 text-white"
    >
      <header className="flex shrink-0 items-center justify-between bg-indigo-700 px-10 py-6">
        <h1 className="text-4xl font-extrabold tracking-wider">{business.name}</h1>
        <span className="flex items-center gap-3 text-xl opacity-90">
          {connected ? 'Su compra' : 'Esperando al cajero...'}
          {items.length > 0 && (
            <motion.span
              key={items.length}
              initial={reduce ? false : { scale: 1.4 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', duration: 0.35, bounce: 0.45 }}
              className="rounded-full bg-white/20 px-3 py-0.5 font-mono"
            >
              {items.length} {items.length === 1 ? 'artículo' : 'artículos'}
            </motion.span>
          )}
        </span>
      </header>

      {items.length === 0 ? (
        <Welcome reduce={reduce} />
      ) : (
        <main className="flex min-h-0 flex-1 flex-col px-10 py-6">
          <div className={`${GRID} border-b border-slate-700 px-3 pb-3 text-xl uppercase tracking-wider text-slate-400`}>
            <span>Artículo</span>
            <span className="text-center">Cant.</span>
            <span className="text-right">Precio</span>
            <span className="text-right">Importe</span>
          </div>
          <div ref={listRef} className="min-h-0 flex-1 space-y-1 overflow-y-auto py-2">
            <AnimatePresence initial={false} mode="popLayout">
              {items.map(item => (
                <Row key={item.id} item={item} reduce={reduce} />
              ))}
            </AnimatePresence>
          </div>
        </main>
      )}

      <TotalBlock totals={totals} taxPercent={taxPercent} reduce={reduce} />
    </div>
  );
}
