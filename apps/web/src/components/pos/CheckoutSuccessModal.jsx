import React, { useEffect, useState } from 'react';
import { lineDisplay } from '../../utils/units';
import { motion } from 'motion/react';
import { ChevronDown, Printer } from 'lucide-react';
import Modal from '../Modal';
import ReceiptFormatSelect from '../ReceiptFormatSelect';
import { money, dateTime } from '../../utils/format';
import { formatTaxPercent } from '../../stores/configStore';
import { api } from '../../services/api';
import EcfStatusBadge from '../ecf/EcfStatusBadge';

const NCF_LABELS = {
  B01: 'Crédito fiscal',
  B02: 'Consumo',
  B04: 'Nota de crédito',
  E31: 'Crédito fiscal electrónico',
  E32: 'Consumo electrónico',
  E34: 'Nota de crédito electrónica',
};

/** Sigue el estado del comprobante electrónico unos segundos (la DGII suele responder en menos de 2 s). */
function useEcfStatus(sale) {
  const [state, setState] = useState({ status: sale?.ecfStatus || null, message: null });
  useEffect(() => {
    if (!sale?.eNcf) return undefined;
    let cancelled = false;
    let attempts = 0;
    const tick = async () => {
      attempts += 1;
      try {
        const result = await api.ecf.saleStatus(sale.id);
        if (cancelled) return;
        setState({ status: result.status, message: result.message });
        if (result.final || attempts >= 12) return;
      } catch {
        if (attempts >= 3) return;
      }
      if (!cancelled) setTimeout(tick, 1500);
    };
    const first = setTimeout(tick, 600);
    return () => {
      cancelled = true;
      clearTimeout(first);
    };
  }, [sale?.id, sale?.eNcf]);
  return state;
}

function AnimatedCheck() {
  return (
    <motion.div
      initial={{ scale: 0.7, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: 'spring', duration: 0.45, bounce: 0.3 }}
      className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 dark:bg-emerald-950/40"
    >
      <svg viewBox="0 0 24 24" className="h-8 w-8" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <motion.path
          d="M5 12.5l4.5 4.5L19 7.5"
          className="text-emerald-600 dark:text-emerald-400"
          stroke="currentColor"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ delay: 0.15, duration: 0.35, ease: [0.23, 1, 0.32, 1] }}
        />
      </svg>
    </motion.div>
  );
}

/**
 * Confirmación de cobro: resultado claro (total, NCF), impresión y atajo a la siguiente venta.
 * El detalle completo queda plegado: el cajero casi nunca lo necesita en este momento.
 */
export default function CheckoutSuccessModal({ sale, onPrint, onNewSale }) {
  const [showDetail, setShowDetail] = useState(false);
  const ecf = useEcfStatus(sale);
  if (!sale) return null;

  const taxBase = sale.subtotal - sale.discount;
  const taxPercent = formatTaxPercent(taxBase > 0 ? sale.tax / taxBase : 0);

  return (
    <Modal isOpen onClose={onNewSale} title="Venta registrada" maxWidth="md">
      <div className="space-y-5">
        <div className="space-y-1 text-center">
          <AnimatedCheck />
          <p className="pt-3 text-sm text-slate-500 dark:text-slate-400">Total cobrado</p>
          <p className="text-4xl font-semibold tabular-nums tracking-tight text-slate-900 dark:text-white">{money(sale.total)}</p>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {sale.paymentMethod === 'TARJETA' ? 'Tarjeta' : 'Efectivo'} · {sale.customerName}
          </p>
        </div>

        <dl className="grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-3.5 text-sm dark:bg-slate-800/50">
          <div>
            <dt className="text-xs text-slate-500 dark:text-slate-400">Comprobante</dt>
            <dd className="font-mono font-medium text-slate-800 dark:text-slate-100">{sale.invoiceNumber}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500 dark:text-slate-400">Tipo</dt>
            <dd className="font-medium text-slate-800 dark:text-slate-100">{NCF_LABELS[sale.ecfType || sale.ncfType] || sale.ecfType || sale.ncfType}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500 dark:text-slate-400">Fecha</dt>
            <dd className="text-slate-800 dark:text-slate-100">{dateTime(sale.createdAt)}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500 dark:text-slate-400">Atendió</dt>
            <dd className="text-slate-800 dark:text-slate-100">{sale.userName}</dd>
          </div>
        </dl>

        {sale.eNcf && (
          <div aria-live="polite" className="flex items-start justify-between gap-3 rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm dark:border-slate-700">
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400">Comprobante electrónico</p>
              <p className="text-xs text-slate-500">Código de seguridad <span className="font-mono font-semibold text-slate-700 dark:text-slate-200">{sale.ecfSecurityCode}</span></p>
              {ecf.message && <p className="mt-1 max-w-[18rem] text-xs text-rose-600">{ecf.message}</p>}
            </div>
            <EcfStatusBadge status={ecf.status || sale.ecfStatus} />
          </div>
        )}


        <div>
          <button
            type="button"
            onClick={() => setShowDetail(v => !v)}
            aria-expanded={showDetail}
            className="flex w-full items-center justify-between rounded-lg px-1 py-1 text-sm font-medium text-slate-600 hover:text-slate-900 dark:text-slate-300 cursor-pointer"
          >
            Detalle de la venta ({sale.details.length})
            <ChevronDown className={`h-4 w-4 transition-transform ${showDetail ? 'rotate-180' : ''}`} />
          </button>
          {showDetail && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.18, ease: [0.23, 1, 0.32, 1] }}
              className="mt-2 space-y-1.5 text-sm"
            >
              {sale.details.map((line, index) => (
                <div key={index} className="flex justify-between gap-3 text-slate-700 dark:text-slate-200">
                  <span className="min-w-0 truncate">
                    {lineDisplay(line).qtyText} × {line.productName}
                  </span>
                  <span className="shrink-0 tabular-nums">{money(line.subtotal)}</span>
                </div>
              ))}
              <div className="mt-2 space-y-1 border-t border-slate-100 pt-2 text-slate-500 dark:border-slate-800 dark:text-slate-400">
                <div className="flex justify-between"><span>Subtotal</span><span className="tabular-nums">{money(sale.subtotal)}</span></div>
                {sale.discount > 0 && (
                  <div className="flex justify-between text-rose-600"><span>Descuento</span><span className="tabular-nums">−{money(sale.discount)}</span></div>
                )}
                <div className="flex justify-between"><span>ITBIS ({taxPercent}%)</span><span className="tabular-nums">{money(sale.tax)}</span></div>
              </div>
            </motion.div>
          )}
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="flex flex-1 gap-2">
            <ReceiptFormatSelect className="!h-11 !rounded-xl !text-sm" />
            <button
              type="button"
              onClick={onPrint}
              className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800 cursor-pointer"
            >
              <Printer className="h-4 w-4" /> Imprimir
            </button>
          </div>
          <button
            type="button"
            autoFocus
            onClick={onNewSale}
            className="h-11 flex-1 rounded-xl bg-indigo-600 text-sm font-semibold text-white hover:bg-indigo-700 cursor-pointer"
          >
            Nueva venta
          </button>
        </div>
      </div>
    </Modal>
  );
}
