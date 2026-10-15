import jsPDF from 'jspdf';

const money = (value, currency = 'DOP') => `${currency === 'DOP' ? 'RD$' : currency} ${Number(value || 0).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const day = value => (value ? new Date(value).toLocaleDateString('es-DO', { day: '2-digit', month: 'long', year: 'numeric' }) : '—');

export const METHOD_LABELS = { TRANSFER: 'Transferencia', DEPOSIT: 'Depósito', CASH: 'Efectivo', OTHER: 'Otro', CARD: 'Tarjeta' };

/**
 * Recibo de suscripción (media carta). `receipt` viene de GET .../payments/:id/receipt.
 * No es un comprobante fiscal: así se dice en el propio documento.
 */
export function printSubscriptionReceipt(receipt) {
  if (!receipt) return;
  const doc = new jsPDF({ unit: 'mm', format: [139.7, 215.9] }); // media carta, vertical
  const left = 14;
  const right = 139.7 - 14;
  let y = 18;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text('FACTOS', left, y);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text('Recibo de suscripción', right, y - 5, { align: 'right' });
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text(receipt.receiptCode, right, y + 1, { align: 'right' });
  y += 10;
  doc.line(left, y, right, y);
  y += 8;

  const row = (label, value) => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(110);
    doc.text(label, left, y);
    doc.setTextColor(20);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    const lines = doc.splitTextToSize(String(value || '—'), right - left - 38);
    doc.text(lines, left + 38, y);
    y += Math.max(7, lines.length * 5);
  };

  row('Empresa', receipt.company?.name);
  if (receipt.company?.rnc) row('RNC', receipt.company.rnc);
  row('Plan', receipt.planName);
  row('Período cubierto', `${day(receipt.periodStart)} al ${day(receipt.periodEnd)}`);
  row('Método de pago', METHOD_LABELS[receipt.method] || receipt.method);
  if (receipt.reference) row('Referencia', receipt.reference);
  row('Fecha del recibo', day(receipt.createdAt));
  row('Registrado por', receipt.recordedByName);
  if (receipt.note) row('Nota', receipt.note);
  y += 2;
  doc.line(left, y, right, y);
  y += 9;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text(receipt.status === 'VOIDED' ? 'MONTO (ANULADO)' : 'MONTO PAGADO', left, y);
  doc.setFontSize(16);
  doc.text(money(receipt.amount, receipt.currency), right, y, { align: 'right' });
  y += 14;

  if (receipt.status === 'VOIDED') {
    doc.setTextColor(200, 30, 30);
    doc.setFontSize(22);
    doc.text('ANULADO', 139.7 / 2, y + 6, { align: 'center' });
    doc.setTextColor(20);
    y += 16;
  }

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(110);
  doc.text(doc.splitTextToSize(receipt.notFiscal || 'Este recibo no es un comprobante fiscal.', right - left), left, y);

  doc.save(`Recibo_${receipt.receiptCode}.pdf`);
  window.open(URL.createObjectURL(doc.output('blob')), '_blank');
}
