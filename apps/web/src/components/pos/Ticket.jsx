import React, { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Loader2, Minus, Plus, ReceiptText, Tag, Trash2 } from 'lucide-react';
import AnimatedMoney from './AnimatedMoney';
import CustomerPicker from './CustomerPicker';
import { money } from '../../utils/format';
import { expiryPercentFor, sellableStock } from '../../utils/expiry';
import { baseQuantityOf, expiryOf, lineTotalOf } from '../../hooks/usePosCart';
import { isFractional, stepFor, trimQty, unitInfo } from '../../utils/units';

const PAYMENT_LABELS = { EFECTIVO: 'Efectivo', TARJETA: 'Tarjeta' };

const stepButton =
  'flex h-8 w-8 items-center justify-center rounded-md text-slate-600 hover:bg-slate-100 disabled:opacity-40 dark:text-slate-300 dark:hover:bg-slate-800 [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11 cursor-pointer';

function CartLine({ item, canDiscount, onQuantity, onDiscount, onRemove }) {
  const [showDiscount, setShowDiscount] = useState(false);
  const { product, presentation, quantity, discount } = item;
  const expiryDiscount = expiryOf(item);
  const expiryPercent = expiryPercentFor(product, baseQuantityOf(item));
  const lineTotal = lineTotalOf(item);
  // Unidad de venta: presentaciones (paquetes), peso/volumen (lb) o unidades
  const fractional = !presentation && isFractional(product.unit);
  const step = fractional ? stepFor(product.unit) : 1;
  const unitShort = unitInfo(product.unit).short;
  const priceLabel = presentation
    ? `${money(presentation.salePrice)} c/u`
    : fractional
      ? `${money(product.salePrice)} por ${unitShort}`
      : `${money(product.salePrice)} c/u`;
  const discountVisible = canDiscount && (showDiscount || discount > 0);

  return (
    <motion.li
      layout="position"
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, x: -16, transition: { duration: 0.14 } }}
      transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
      className="list-none py-3"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">{product.name}</p>
          <p className="text-xs tabular-nums text-slate-500 dark:text-slate-400">
            {presentation ? `${trimQty(quantity)} × ${presentation.name} · ` : fractional ? `${trimQty(quantity)} ${unitShort} · ` : ''}
            {priceLabel}
          </p>
          <AnimatePresence initial={false}>
            {expiryDiscount > 0 && (
              <motion.p
                key="expiry"
                initial={{ opacity: 0, y: -4, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, transition: { duration: 0.12 } }}
                transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
                className="mt-1 inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:bg-amber-950/30 dark:text-amber-300"
              >
                <Tag className="h-3 w-3" aria-hidden="true" />
                Descuento por vencimiento{expiryPercent ? ` ${expiryPercent}%` : ''}: -{money(expiryDiscount)}
              </motion.p>
            )}
          </AnimatePresence>
        </div>
        <p className="shrink-0 text-sm font-semibold tabular-nums text-slate-900 dark:text-white">{money(lineTotal)}</p>
      </div>

      <div className="mt-2 flex items-center justify-between gap-2">
        <div className="flex items-center rounded-lg border border-slate-200 dark:border-slate-700" role="group" aria-label={`Cantidad de ${product.name}`}>
          <button type="button" className={stepButton} onClick={() => onQuantity(item.lineId, Math.round((quantity - step) * 100) / 100)} aria-label={fractional ? `Quitar ${step} ${unitShort}` : 'Quitar una unidad'}>
            <Minus className="h-3.5 w-3.5" />
          </button>
          <input
            type="number"
            inputMode={fractional ? 'decimal' : 'numeric'}
            min={fractional ? '0.01' : '1'}
            step={fractional ? '0.01' : '1'}
            max={presentation ? undefined : sellableStock(product)}
            value={quantity}
            aria-label={`Cantidad de ${product.name}`}
            onFocus={e => e.target.select()}
            onChange={e => onQuantity(item.lineId, fractional ? parseFloat(e.target.value) || 0.01 : parseInt(e.target.value, 10) || 1)}
            className={`h-8 ${fractional ? 'w-16' : 'w-11'} border-0 bg-transparent p-0 text-center text-sm font-medium tabular-nums text-slate-800 outline-none dark:text-slate-100 [@media(pointer:coarse)]:h-11 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none`}
          />
          <button
            type="button"
            className={stepButton}
            onClick={() => onQuantity(item.lineId, Math.round((quantity + step) * 100) / 100)}
            disabled={!presentation && quantity >= sellableStock(product)}
            aria-label={fractional ? `Agregar ${step} ${unitShort}` : 'Agregar una unidad'}
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="flex items-center gap-1">
          {canDiscount && !discountVisible && (
            <button
              type="button"
              onClick={() => setShowDiscount(true)}
              className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 [@media(pointer:coarse)]:h-11 cursor-pointer"
            >
              <Tag className="h-3.5 w-3.5" /> Descuento
            </button>
          )}
          <button
            type="button"
            onClick={() => onRemove(item.lineId)}
            aria-label={`Quitar ${product.name} del ticket`}
            className="flex h-8 w-8 items-center justify-center rounded-md text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/30 [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11 cursor-pointer"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {discountVisible && (
        <div className="mt-2 flex items-center gap-2">
          <label htmlFor={`disc-${item.lineId}`} className="text-xs text-slate-500 dark:text-slate-400">
            Descuento
          </label>
          <input
            id={`disc-${item.lineId}`}
            type="number"
            inputMode="decimal"
            min="0"
            step="0.5"
            placeholder="0.00"
            value={discount || ''}
            onChange={e => onDiscount(item.lineId, parseFloat(e.target.value) || 0)}
            className="h-8 w-24 rounded-md border border-slate-200 bg-white px-2 text-right text-sm tabular-nums outline-none dark:border-slate-700 dark:bg-slate-900"
          />
        </div>
      )}
    </motion.li>
  );
}

function PaymentSegmented({ methods, value, onChange, scope }) {
  return (
    <div role="radiogroup" aria-label="Método de pago" className="flex rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
      {methods.map(method => {
        const active = value === method;
        return (
          <button
            key={method}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(method)}
            className={`relative h-9 flex-1 rounded-md text-sm font-medium [@media(pointer:coarse)]:h-11 cursor-pointer ${
              active ? 'text-slate-900 dark:text-white' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400'
            }`}
          >
            {active && (
              <motion.span
                layoutId={`payment-pill-${scope}`}
                transition={{ type: 'spring', duration: 0.3, bounce: 0.15 }}
                className="absolute inset-0 rounded-md bg-white shadow-sm dark:bg-slate-700"
              />
            )}
            <span className="relative">{PAYMENT_LABELS[method] || method}</span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * Ticket de la venta: cliente, líneas, totales, método de pago y botón de cobro.
 * Se usa tal cual en el panel lateral (escritorio) y dentro de la hoja inferior (móvil).
 */
export default function Ticket({
  scope,
  cart,
  customer,
  onSelectCustomer,
  onCreateCustomer,
  paymentMethods,
  paymentMethod,
  onPaymentMethod,
  taxPercent,
  canDiscount,
  submitting,
  onRequestRemove,
  onCheckout,
  large,
}) {
  const { items, totals, globalDiscount } = cart;
  const [showGlobalDiscount, setShowGlobalDiscount] = useState(false);
  const empty = items.length === 0;
  const globalVisible = canDiscount && (showGlobalDiscount || globalDiscount > 0);

  const handleQuantity = (lineId, quantity) => {
    if (cart.setQuantity(lineId, quantity) === 'remove') onRequestRemove(lineId);
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="space-y-1.5 border-b border-slate-100 p-4 dark:border-slate-800">
        <p className="text-[13px] font-medium text-slate-600 dark:text-slate-400">Cliente</p>
        <CustomerPicker customer={customer} onSelect={onSelectCustomer} onCreate={onCreateCustomer} />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4">
        {empty ? (
          <div className="flex h-full min-h-48 flex-col items-center justify-center gap-2 py-8 text-center">
            <ReceiptText className="h-9 w-9 text-slate-300 dark:text-slate-600" strokeWidth={1.5} />
            <p className="text-sm font-medium text-slate-700 dark:text-slate-200">El ticket está vacío</p>
            <p className="max-w-56 text-sm text-slate-500 dark:text-slate-400">
              Escanee un código de barras o toque un producto para agregarlo.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800" aria-label="Productos del ticket">
            <AnimatePresence initial={false} mode="popLayout">
              {items.map(item => (
                <CartLine
                  key={item.lineId}
                  item={item}
                  canDiscount={canDiscount}
                  onQuantity={handleQuantity}
                  onDiscount={cart.setLineDiscount}
                  onRemove={onRequestRemove}
                />
              ))}
            </AnimatePresence>
          </ul>
        )}
      </div>

      <div className="space-y-3 border-t border-slate-100 bg-slate-50/60 p-4 dark:border-slate-800 dark:bg-slate-900/60">
        <dl className="space-y-1 text-sm text-slate-600 dark:text-slate-400">
          <div className="flex justify-between">
            <dt>Subtotal ({totals.units} {totals.units === 1 ? 'artículo' : 'artículos'})</dt>
            <dd className="tabular-nums">{money(totals.subtotal)}</dd>
          </div>
          {totals.discount > 0 && (
            <div className="flex justify-between text-rose-600 dark:text-rose-400">
              <dt>Descuento</dt>
              <dd className="tabular-nums">−{money(totals.discount)}</dd>
            </div>
          )}
          <div className="flex justify-between">
            <dt>ITBIS ({taxPercent}%)</dt>
            <dd className="tabular-nums">{money(totals.tax)}</dd>
          </div>
        </dl>

        {canDiscount && !empty && (
          <div>
            {globalVisible ? (
              <div className="flex items-center justify-between gap-3">
                <label htmlFor={`global-discount-${scope}`} className="text-sm text-slate-600 dark:text-slate-400">
                  Descuento general
                </label>
                <input
                  id={`global-discount-${scope}`}
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.5"
                  placeholder="0.00"
                  value={globalDiscount || ''}
                  onChange={e => cart.setGlobalDiscount(parseFloat(e.target.value) || 0)}
                  className="h-9 w-28 rounded-md border border-slate-200 bg-white px-2 text-right text-sm tabular-nums outline-none dark:border-slate-700 dark:bg-slate-900"
                />
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowGlobalDiscount(true)}
                className="text-sm font-medium text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 cursor-pointer"
              >
                Agregar descuento general
              </button>
            )}
          </div>
        )}

        <PaymentSegmented methods={paymentMethods} value={paymentMethod} onChange={onPaymentMethod} scope={scope} />

        <div className="flex items-baseline justify-between pt-1">
          <span className="text-sm font-medium text-slate-600 dark:text-slate-400">Total a cobrar</span>
          <AnimatedMoney
            value={totals.total}
            className={`font-semibold tabular-nums tracking-tight text-slate-900 dark:text-white ${large ? 'text-5xl' : 'text-4xl'}`}
          />
        </div>

        <button
          type="button"
          onClick={onCheckout}
          disabled={submitting || empty}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 text-base font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:bg-slate-200 disabled:text-slate-500 disabled:shadow-none dark:disabled:bg-slate-800 dark:disabled:text-slate-500 [@media(pointer:coarse)]:h-14 cursor-pointer"
        >
          {submitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Procesando…
            </>
          ) : empty ? (
            'Agregue productos para cobrar'
          ) : (
            <>
              Cobrar {money(totals.total)}
              <kbd className="ml-1 hidden rounded border border-white/30 px-1.5 py-0.5 font-sans text-[11px] font-medium text-white/80 lg:inline">F9</kbd>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
