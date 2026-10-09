import React, { useState } from 'react';
import { RECEIPT_FORMATS, getReceiptFormat, setReceiptFormat } from '../utils/receiptPdf';

/** Selector del formato de comprobante (carta / ticket 80mm), recordado en este equipo. */
export default function ReceiptFormatSelect({ className = '' }) {
  const [format, setFormat] = useState(getReceiptFormat());

  return (
    <select
      value={format}
      onChange={e => {
        setFormat(e.target.value);
        setReceiptFormat(e.target.value);
      }}
      aria-label="Formato de comprobante"
      className={`text-xs border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-2 bg-transparent cursor-pointer ${className}`}
    >
      <option value={RECEIPT_FORMATS.A4}>Carta (A4)</option>
      <option value={RECEIPT_FORMATS.TICKET}>Ticket 80 mm</option>
      <option value={RECEIPT_FORMATS.BOTH}>Ambos (A4 + Ticket)</option>
    </select>
  );
}
