import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Minus, Plus, Scale } from 'lucide-react';
import Modal from '../Modal';
import { money } from '../../utils/format';
import { sellableStock } from '../../utils/expiry';
import { isFractional, trimQty, unitInfo } from '../../utils/units';

const round2 = n => Math.round((n + Number.EPSILON) * 100) / 100;
const QUICK = { LB: [0.25, 0.5, 1, 2, 5], KG: [0.25, 0.5, 1, 2, 5], default: [0.25, 0.5, 1, 2] };

/**
 * Elegir cómo vender un producto: por presentación (unidad, paquete, caja) y, a granel, por peso o por monto.
 *  - Peso: el cajero escribe (o toca) la cantidad: 1.25 lb × $40.00 = $50.00.
 *  - Monto: "RD$100 de tomate" → se calcula el peso redondeado a 2 decimales y se muestra el importe real.
 * `onConfirm({ presentation, quantity })`: quantity está en la unidad elegida (presentaciones o unidad base).
 */
export default function ProductOptionsModal({ product, onConfirm, onClose }) {
  const presentations = useMemo(() => product?.presentations?.filter(p => p.active !== false) || [], [product]);
  const [choice, setChoice] = useState('BASE'); // 'BASE' o id de presentación
  const [mode, setMode] = useState('WEIGHT'); // WEIGHT | AMOUNT
  const [text, setText] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    setChoice('BASE');
    setMode('WEIGHT');
    setText('');
  }, [product]);

  useEffect(() => {
    if (product) setTimeout(() => inputRef.current?.focus(), 60);
  }, [product, choice, mode]);

  if (!product) return null;
  const unit = unitInfo(product.unit);
  const presentation = choice === 'BASE' ? null : presentations.find(p => p.id === choice);
  const fractional = !presentation && isFractional(product.unit);
  const price = presentation ? Number(presentation.salePrice) : Number(product.salePrice);
  const value = Number(text);

  // Cantidad resultante en la unidad elegida
  let quantity = 0;
  if (fractional && mode === 'AMOUNT') quantity = price > 0 ? round2(value / price) : 0;
  else quantity = fractional ? round2(value) : Math.floor(value || 0);
  const total = round2(quantity * price);
  const baseQuantity = round2(quantity * (presentation ? Number(presentation.factor) : 1));
  const available = sellableStock(product);
  const tooMuch = baseQuantity > available + 0.004;
  const valid = quantity > 0 && !tooMuch;

  const submit = event => {
    event.preventDefault();
    if (valid) onConfirm({ presentation, quantity });
  };
  const bump = delta => setText(trimQty(Math.max(0, round2((Number(text) || 0) + delta))));
  const quick = QUICK[product.unit] || QUICK.default;

  return (
    <Modal isOpen onClose={onClose} title={product.name} maxWidth="sm">
      <form onSubmit={submit} className="space-y-4">
        <p className="text-xs text-slate-500 dark:text-slate-400">
          {fractional ? `Precio por ${unit.label.toLowerCase()}` : 'Precio'}: <strong className="tabular-nums text-slate-800 dark:text-slate-100">{money(price)}</strong>
          {' · '}Disponible: <span className="tabular-nums">{trimQty(available)} {unit.short}</span>
        </p>

        {presentations.length > 0 && (
          <div role="radiogroup" aria-label="Presentación" className="grid gap-2">
            {[{ id: 'BASE', name: unit.label, salePrice: product.salePrice, factor: 1 }, ...presentations].map(option => {
              const active = choice === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => { setChoice(option.id); setText(''); }}
                  className={`flex items-center justify-between rounded-xl border px-3.5 py-2.5 text-left text-sm transition-colors cursor-pointer ${
                    active
                      ? 'border-indigo-500 bg-indigo-50 text-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-200'
                      : 'border-slate-200 text-slate-700 hover:border-slate-300 dark:border-slate-700 dark:text-slate-200'
                  }`}
                >
                  <span className="font-medium">
                    {option.name}
                    {option.id !== 'BASE' && <span className="ml-1.5 text-xs font-normal text-slate-500 dark:text-slate-400">({trimQty(option.factor)} {unit.short})</span>}
                  </span>
                  <span className="tabular-nums font-semibold">{money(option.salePrice)}</span>
                </button>
              );
            })}
          </div>
        )}

        {fractional && (
          <div className="flex rounded-lg bg-slate-100 p-1 text-sm dark:bg-slate-800" role="radiogroup" aria-label="Cómo capturar">
            {[['WEIGHT', `Por ${unit.label.toLowerCase()}`], ['AMOUNT', 'Por monto']].map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={mode === id}
                onClick={() => { setMode(id); setText(''); }}
                className={`h-9 flex-1 rounded-md font-medium cursor-pointer ${mode === id ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white' : 'text-slate-500 dark:text-slate-400'}`}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        <div className="space-y-2">
          <label htmlFor="opt-qty" className="block text-xs font-semibold text-slate-600 dark:text-slate-400">
            {fractional ? (mode === 'AMOUNT' ? 'Monto a vender (RD$)' : `Cantidad (${unit.short})`) : `Cantidad${presentation ? ` de ${presentation.name}` : ''}`}
          </label>
          <div className="flex items-center gap-2">
            {!fractional && (
              <button type="button" onClick={() => bump(-1)} aria-label="Menos" className="flex h-12 w-12 items-center justify-center rounded-xl border border-slate-200 dark:border-slate-700 cursor-pointer">
                <Minus className="h-4 w-4" />
              </button>
            )}
            <div className="relative flex-1">
              {fractional && <Scale className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />}
              <input
                id="opt-qty"
                ref={inputRef}
                type="number"
                inputMode="decimal"
                min="0"
                step={fractional ? '0.01' : '1'}
                value={text}
                onChange={e => setText(e.target.value)}
                placeholder={fractional ? '0.00' : '1'}
                className={`h-12 w-full rounded-xl border border-slate-200 bg-white text-center text-xl font-semibold tabular-nums outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-900 ${fractional ? 'pl-9' : ''}`}
              />
            </div>
            {!fractional && (
              <button type="button" onClick={() => bump(1)} aria-label="Más" className="flex h-12 w-12 items-center justify-center rounded-xl border border-slate-200 dark:border-slate-700 cursor-pointer">
                <Plus className="h-4 w-4" />
              </button>
            )}
          </div>
          {fractional && mode === 'WEIGHT' && (
            <div className="flex flex-wrap gap-1.5">
              {quick.map(q => (
                <button key={q} type="button" onClick={() => setText(String(q))} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 cursor-pointer">
                  {q} {unit.short}
                </button>
              ))}
            </div>
          )}
        </div>

        <AnimatePresence initial={false} mode="wait">
          <motion.div
            key={`${quantity}-${choice}-${mode}`}
            initial={{ opacity: 0.4, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.16, ease: [0.23, 1, 0.32, 1] }}
            className={`rounded-xl px-4 py-3 text-sm ${tooMuch ? 'bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-300' : 'bg-slate-50 dark:bg-slate-800/50'}`}
            role={tooMuch ? 'alert' : undefined}
          >
            {tooMuch ? (
              <span>No hay tanto: solo quedan {trimQty(available)} {unit.short}.</span>
            ) : (
              <div className="flex items-center justify-between gap-3">
                <span className="text-slate-600 dark:text-slate-300">
                  {quantity > 0
                    ? `${trimQty(quantity)} ${presentation ? presentation.name : unit.short} × ${money(price)}`
                    : fractional ? 'Escriba el peso o el monto' : 'Elija la cantidad'}
                </span>
                <span className="text-lg font-bold tabular-nums text-slate-900 dark:text-white">{money(total)}</span>
              </div>
            )}
            {mode === 'AMOUNT' && fractional && quantity > 0 && !tooMuch && Math.abs(total - value) >= 0.005 && (
              <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">El peso se redondea a 2 decimales: el importe real es {money(total)}.</p>
            )}
          </motion.div>
        </AnimatePresence>

        <div className="flex justify-end gap-3">
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 dark:border-slate-700 dark:text-slate-300 cursor-pointer">
            Cancelar
          </button>
          <button type="submit" disabled={!valid} className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50 cursor-pointer">
            Agregar al ticket
          </button>
        </div>
      </form>
    </Modal>
  );
}
