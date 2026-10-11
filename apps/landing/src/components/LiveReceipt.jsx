import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, animate, motion, useMotionValue, useReducedMotion, useTransform } from 'motion/react';
import { Check } from 'lucide-react';

const ITEMS = [
  { name: 'Arroz Selecto 5 lb', qty: 1, price: 182.4 },
  { name: 'Habichuelas Rojas 1 lb', qty: 2, price: 62.4 },
  { name: 'Aceite Vegetal 1 L', qty: 1, price: 214.5 },
  { name: 'Leche Entera 1 L', qty: 3, price: 80.0 },
  { name: 'Café Molido 1 lb', qty: 1, price: 256.0 },
];
const TAX = 0.18;
const money = n => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function Total({ value }) {
  const mv = useMotionValue(value);
  const text = useTransform(mv, money);
  useEffect(() => {
    const controls = animate(mv, value, { duration: 0.45, ease: [0.23, 1, 0.32, 1] });
    return () => controls.stop();
  }, [value, mv]);
  return <motion.span>{text}</motion.span>;
}

// Barras deterministas (no es un código real, solo adorno)
const BARS = Array.from({ length: 46 }, (_, i) => 1 + ((i * 7 + (i % 3) * 5) % 4));

/**
 * Ticket que se "imprime" solo: cada artículo entra como si se escaneara, el total cuenta hasta su valor
 * y al final se marca como pagado. Con "reducir movimiento" se muestra el ticket completo y quieto.
 */
export default function LiveReceipt() {
  const reduce = useReducedMotion();
  const [count, setCount] = useState(reduce ? ITEMS.length : 0);
  const [paid, setPaid] = useState(!!reduce);
  const timers = useRef([]);

  useEffect(() => {
    if (reduce) return undefined;
    let cancelled = false;
    const later = (fn, ms) => {
      const id = setTimeout(() => !cancelled && fn(), ms);
      timers.current.push(id);
    };
    const cycle = () => {
      setPaid(false);
      setCount(0);
      ITEMS.forEach((_, i) => later(() => setCount(i + 1), 900 + i * 1050));
      later(() => setPaid(true), 900 + ITEMS.length * 1050 + 500);
      later(cycle, 900 + ITEMS.length * 1050 + 4200);
    };
    cycle();
    return () => {
      cancelled = true;
      timers.current.forEach(clearTimeout);
      timers.current = [];
    };
  }, [reduce]);

  const shown = ITEMS.slice(0, count);
  const subtotal = shown.reduce((a, it) => a + it.qty * it.price, 0);
  const tax = subtotal * TAX;
  const total = subtotal + tax;

  return (
    <div className="relative mx-auto w-full max-w-[22rem] rotate-[1.5deg] text-ink" role="img" aria-label="Ticket de venta de ejemplo que se llena a medida que se escanean productos">
      <div className="receipt-edge bg-white pb-6 shadow-receipt">
        <div className="border-b border-dashed border-ink/20 px-6 pb-4 pt-6 text-center">
          <p className="font-mono text-sm font-semibold tracking-[0.2em]">FACTOS</p>
          <p className="mt-1 font-mono text-[11px] text-ink/55">Colmado La Esquina · Caja 1</p>
        </div>

        <ul className="min-h-[13.5rem] space-y-2.5 px-6 py-4 font-mono text-[12.5px]">
          <AnimatePresence initial={false}>
            {shown.map(item => (
              <motion.li
                key={item.name}
                initial={{ opacity: 0, y: 8, backgroundColor: 'rgba(79,70,229,0.14)' }}
                animate={{ opacity: 1, y: 0, backgroundColor: 'rgba(79,70,229,0)' }}
                transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1], backgroundColor: { duration: 0.9 } }}
                className="-mx-1 flex justify-between gap-3 rounded px-1"
              >
                <span className="min-w-0 truncate">
                  {item.qty} × {item.name}
                </span>
                <span className="shrink-0 tabular-nums">{money(item.qty * item.price)}</span>
              </motion.li>
            ))}
          </AnimatePresence>
          {shown.length === 0 && <li className="pt-6 text-center text-ink/40">Escanea el primer producto…</li>}
        </ul>

        <div className="space-y-1 border-t border-dashed border-ink/20 px-6 pt-3 font-mono text-[12px] text-ink/65">
          <div className="flex justify-between">
            <span>Subtotal</span>
            <span className="tabular-nums">{money(subtotal)}</span>
          </div>
          <div className="flex justify-between">
            <span>ITBIS 18%</span>
            <span className="tabular-nums">{money(tax)}</span>
          </div>
        </div>

        <div className="flex items-baseline justify-between px-6 pb-2 pt-3 font-mono">
          <span className="text-xs text-ink/65">TOTAL</span>
          <span className="text-2xl font-semibold tabular-nums">
            <Total value={total} />
          </span>
        </div>

        <div className="px-6">
          <div className={`flex h-10 items-center justify-center gap-2 rounded-lg font-sans text-sm font-semibold ${paid ? 'bg-mint text-ink' : 'bg-brand text-white'}`}>
            {paid ? (
              <>
                <Check className="h-4 w-4" strokeWidth={3} /> Pagado
              </>
            ) : (
              <>Cobrar {money(total)}</>
            )}
          </div>
        </div>

        <div className="relative mx-6 mt-5 h-9 overflow-hidden" aria-hidden="true">
          <div className="flex h-full items-stretch gap-[2px]">
            {BARS.map((w, i) => (
              <span key={i} className="bg-ink" style={{ width: `${w}px` }} />
            ))}
          </div>
          {!reduce && count > 0 && !paid && (
            <motion.span
              key={count}
              initial={{ top: 0, opacity: 0 }}
              animate={{ top: '100%', opacity: [0, 1, 1, 0] }}
              transition={{ duration: 0.6, ease: 'linear' }}
              className="absolute inset-x-0 h-0.5 bg-rose-500 shadow-[0_0_8px_2px_rgba(244,63,94,0.55)]"
            />
          )}
        </div>
      </div>
    </div>
  );
}
