import jsPDF from 'jspdf';
import { useConfigStore } from '../stores/configStore';

const money = value =>
  `$${Number(value || 0).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const dateTime = value =>
  value
    ? new Date(value).toLocaleString('es-DO', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      })
    : '—';

/**
 * Reporte Z (cierre de caja) en formato ticket de 80 mm.
 * `close` es un turno devuelto por /cashier (con summary, terminal y user).
 */
export function printZReport(close) {
  if (!close) return;
  const summary = close.summary || {};
  const business = useConfigStore.getState().config.business;
  const methods = Object.entries(summary.byPaymentMethod || {});

  const width = 80;
  const margin = 4;
  const right = width - margin;
  const center = width / 2;
  const doc = new jsPDF({ unit: 'mm', format: [width, 150 + methods.length * 4] });
  let y = 8;

  const line = (text, x = margin, opts) => {
    doc.text(String(text), x, y, opts);
    y += 3.8;
  };
  const row = (label, value, bold = false) => {
    doc.setFont('courier', bold ? 'bold' : 'normal');
    doc.text(label, margin, y);
    doc.text(value, right, y, { align: 'right' });
    y += 3.8;
  };
  const rule = () => {
    doc.setLineDashPattern([0.6, 0.6], 0);
    doc.line(margin, y - 1.6, right, y - 1.6);
    doc.setLineDashPattern([], 0);
    y += 1.2;
  };

  doc.setFont('courier', 'bold');
  doc.setFontSize(12);
  line(business.name || 'FACTOS', center, { align: 'center' });
  doc.setFontSize(8);
  line('CIERRE DE CAJA (REPORTE Z)', center, { align: 'center' });
  doc.setFont('courier', 'normal');
  if (close.branch?.name) line(`Sucursal: ${close.branch.name}`);
  line(`Caja: ${close.terminal?.name || ''}`);
  line(`Cajero: ${close.user?.fullName || ''}`);
  line(`Apertura: ${dateTime(close.openedAt)}`);
  line(`Cierre:   ${dateTime(close.closedAt)}`);
  rule();

  row('Transacciones', String(summary.transactions || 0));
  row('Subtotal', money(summary.subtotal));
  row('Descuentos', `-${money(summary.discount)}`);
  row('ITBIS', money(summary.tax));
  row('TOTAL VENTAS', money(summary.total), true);
  rule();

  doc.setFont('courier', 'bold');
  line('POR MÉTODO DE PAGO');
  methods.forEach(([method, total]) => row(method, money(total)));
  rule();

  row('Efectivo inicial', money(close.openingBalance));
  row('Ventas en efectivo', money(summary.cashSales));
  row('Efectivo esperado', money(close.expectedCash), true);
  row('Efectivo declarado', money(close.declaredCash), true);
  const diff = Number(close.difference || 0);
  row(diff < 0 ? 'FALTANTE' : diff > 0 ? 'SOBRANTE' : 'DIFERENCIA', money(Math.abs(diff)), true);
  if (close.notes) {
    rule();
    doc.setFont('courier', 'normal');
    line(`Notas: ${close.notes.substring(0, 120)}`);
  }

  y += 10;
  doc.setFont('courier', 'normal');
  line('________________    ________________');
  line('Cajero                Supervisor');

  doc.save(`CierreCaja_${close.terminal?.name || 'caja'}_${dateTime(close.closedAt).replace(/\W+/g, '')}.pdf`);
  window.open(URL.createObjectURL(doc.output('blob')), '_blank');
}
