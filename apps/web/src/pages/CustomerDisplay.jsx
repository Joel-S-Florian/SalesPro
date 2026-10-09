import React, { useEffect, useRef, useState } from 'react';
import { CUSTOMER_DISPLAY_CHANNEL } from '../utils/customerDisplay';

const money = value =>
  `$${Number(value || 0).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const EMPTY = {
  business: { name: 'FACTOS' },
  items: [],
  totals: { subtotal: 0, discount: 0, tax: 0, total: 0 },
  taxPercent: '18',
};

/**
 * Pantalla para el cliente: se abre en una segunda ventana/monitor y recibe el carrito del POS
 * por BroadcastChannel (misma máquina y navegador; no usa la red ni el servidor).
 */
export default function CustomerDisplay() {
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
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [state.items.length]);

  const toggleFullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen?.();
  };

  const { items, totals, taxPercent, business } = state;

  if (completed) {
    return (
      <div
        onDoubleClick={toggleFullscreen}
        className="min-h-screen flex flex-col items-center justify-center bg-emerald-600 text-white text-center p-8 gap-6"
      >
        <div className="text-[9rem] leading-none">✓</div>
        <h1 className="text-6xl font-extrabold">¡Gracias por su compra!</h1>
        <p className="text-3xl opacity-90">Total pagado</p>
        <p className="text-8xl font-black font-mono">{money(completed.total)}</p>
        <p className="text-2xl opacity-80">{business.name}</p>
      </div>
    );
  }

  return (
    <div
      onDoubleClick={toggleFullscreen}
      title="Doble clic para pantalla completa"
      className="min-h-screen flex flex-col bg-slate-950 text-white select-none"
    >
      <header className="flex items-center justify-between px-10 py-6 bg-indigo-700">
        <h1 className="text-4xl font-extrabold tracking-wider">{business.name}</h1>
        <span className="text-xl opacity-80">{connected ? 'Su compra' : 'Esperando al cajero...'}</span>
      </header>

      {items.length === 0 ? (
        <main className="flex-1 flex flex-col items-center justify-center text-center gap-4 p-10">
          <p className="text-7xl font-extrabold">¡Bienvenido!</p>
          <p className="text-3xl text-slate-400">Los artículos aparecerán aquí a medida que se registren.</p>
        </main>
      ) : (
        <main className="flex-1 flex flex-col min-h-0 px-10 py-6">
          <div className="grid grid-cols-[1fr_8rem_12rem_12rem] gap-4 text-xl text-slate-400 uppercase tracking-wider pb-3 border-b border-slate-700">
            <span>Artículo</span>
            <span className="text-center">Cant.</span>
            <span className="text-right">Precio</span>
            <span className="text-right">Importe</span>
          </div>
          <div ref={listRef} className="flex-1 overflow-y-auto divide-y divide-slate-800">
            {items.map((item, index) => (
              <div
                key={`${item.id}-${index}`}
                className="grid grid-cols-[1fr_8rem_12rem_12rem] gap-4 items-center py-4 text-3xl"
              >
                <span className="font-semibold truncate">{item.name}</span>
                <span className="text-center font-mono">{item.quantity}</span>
                <span className="text-right font-mono text-slate-300">{money(item.unitPrice)}</span>
                <span className="text-right font-mono font-bold">
                  {money(item.total)}
                  {item.discount > 0 && (
                    <span className="block text-base font-normal text-amber-400">desc. -{money(item.discount)}</span>
                  )}
                </span>
              </div>
            ))}
          </div>
        </main>
      )}

      <footer className="px-10 py-6 bg-slate-900 border-t border-slate-700">
        <div className="flex items-end justify-between gap-8">
          <div className="text-2xl text-slate-300 space-y-1">
            <p>Subtotal: <span className="font-mono">{money(totals.subtotal)}</span></p>
            {totals.discount > 0 && (
              <p className="text-amber-400">Descuento: <span className="font-mono">-{money(totals.discount)}</span></p>
            )}
            <p>ITBIS ({taxPercent}%): <span className="font-mono">{money(totals.tax)}</span></p>
          </div>
          <div className="text-right">
            <p className="text-3xl text-slate-400 uppercase tracking-widest">Total a pagar</p>
            <p className="text-8xl font-black font-mono text-emerald-400">{money(totals.total)}</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
