import React, { memo } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { money } from '../../utils/format';
import { sellableStock } from '../../utils/expiry';
import { formatQty, isFractional, unitInfo } from '../../utils/units';
import ExpiryBadge from '../inventory/ExpiryBadge';

/**
 * Tarjeta de producto: todo el recuadro es el botón de agregar. La cantidad ya en el ticket se muestra
 * como insignia que "salta" al cambiar. Si no hay existencia, el recuadro tiembla al intentar agregarlo.
 */
function ProductCard({ product, inCart, shake, onAdd, large }) {
  const available = sellableStock(product);
  const outOfStock = available <= 0;
  const low = !outOfStock && available <= product.minStock;
  const nearest = product.isPerishable ? product.nearestBatch : null;
  const fractional = isFractional(product.unit);
  const packs = product.presentations?.length || 0;

  return (
    <button
      type="button"
      onClick={() => onAdd(product)}
      aria-label={`Agregar ${product.name}, ${money(product.salePrice)}, ${outOfStock ? 'agotado' : `${available} en existencia`}`}
      className={`group relative flex flex-col justify-between gap-3 rounded-xl border bg-white p-3.5 text-left dark:bg-slate-900 ${
        shake ? 'animate-shake' : ''
      } ${
        inCart
          ? 'border-indigo-300 ring-1 ring-indigo-200 dark:border-indigo-700 dark:ring-indigo-900'
          : 'border-slate-200 hover:border-slate-300 hover:shadow-sm dark:border-slate-800 dark:hover:border-slate-700'
      } ${outOfStock ? 'opacity-60' : ''}`}
    >
      <AnimatePresence>
        {inCart > 0 && (
          <motion.span
            key={inCart}
            initial={{ scale: 1.35, opacity: 0.6 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', duration: 0.3, bounce: 0.35 }}
            className="absolute -right-1.5 -top-1.5 flex h-6 min-w-6 items-center justify-center rounded-full bg-indigo-600 px-1.5 text-xs font-semibold tabular-nums text-white shadow"
          >
            {inCart}
          </motion.span>
        )}
      </AnimatePresence>

      <div className="space-y-1.5">
        <p className="font-mono text-[11px] text-slate-500 dark:text-slate-400">{product.code}</p>
        {(packs > 0 || fractional) && (
          <span className="inline-flex rounded-full bg-sky-50 px-1.5 py-0.5 text-[10px] font-semibold text-sky-700 dark:bg-sky-950/40 dark:text-sky-300">
            {fractional ? `Por ${unitInfo(product.unit).label.toLowerCase()}` : `+${packs} presentación${packs > 1 ? 'es' : ''}`}
          </span>
        )}
        {nearest && (
          <div className="flex flex-wrap items-center gap-1">
            <ExpiryBadge status={nearest.status} daysLeft={nearest.daysLeft} />
            {nearest.discountPercent > 0 && (
              <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">-{nearest.discountPercent}%</span>
            )}
          </div>
        )}
        <h4
          className={`line-clamp-2 font-medium leading-snug text-slate-800 dark:text-slate-100 ${large ? 'text-[15px]' : 'text-sm'}`}
        >
          {product.name}
        </h4>
      </div>

      <div className="flex items-end justify-between gap-2">
        <span className={`font-semibold tabular-nums text-slate-900 dark:text-white ${large ? 'text-xl' : 'text-base'}`}>
          {money(product.salePrice)}
          {fractional && <span className="ml-0.5 text-xs font-medium text-slate-500 dark:text-slate-400">/{unitInfo(product.unit).short}</span>}
        </span>
        <span
          className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
            outOfStock
              ? 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300'
              : low
                ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300'
                : 'text-slate-500 dark:text-slate-400'
          }`}
        >
          {outOfStock ? 'Agotado' : low ? `Quedan ${formatQty(available, product.unit)}` : `${formatQty(available, product.unit)} disp.`}
        </span>
      </div>
    </button>
  );
}

export default memo(ProductCard);
