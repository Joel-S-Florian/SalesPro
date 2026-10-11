import jsPDF from 'jspdf';
import QRCode from 'qrcode';
import autoTable from 'jspdf-autotable';
import { api } from '../services/api';
import { useConfigStore, formatTaxPercent } from '../stores/configStore';
import { notify } from './notify';


const NCF_LABELS = {
  B01: 'Crédito Fiscal (B01)',
  B02: 'Consumo (B02)',
  B03: 'Nota de Débito (B03)',
  B04: 'Nota de Crédito (B04)',
  B11: 'Comprobante de Compras (B11)',
  B12: 'Registro Único de Ingresos (B12)',
  B13: 'Gastos Menores (B13)',
  B14: 'Regímenes Especiales (B14)',
  B15: 'Gubernamental (B15)',
  B16: 'Exportaciones (B16)',
  E31: 'Factura de Crédito Fiscal Electrónica (E31)',
  E32: 'Factura de Consumo Electrónica (E32)',
  E34: 'Nota de Crédito Electrónica (E34)',
};

/** Fecha y hora de firma del e-CF como la exige la DGII: dd-MM-yyyy HH:mm:ss (hora dominicana). */
function ecfSignDate(sale) {
  if (!sale.ecfSignedAt) return '';
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'America/Santo_Domingo',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    })
      .formatToParts(new Date(sale.ecfSignedAt))
      .map(part => [part.type, part.value])
  );
  return `${parts.day}-${parts.month}-${parts.year} ${parts.hour === '24' ? '00' : parts.hour}:${parts.minute}:${parts.second}`;
}

/** Imagen del código QR del timbre electrónico (o null si la venta no es electrónica). */
async function buildStampQr(sale) {
  if (!sale?.ecfStampUrl) return null;
  try {
    return await QRCode.toDataURL(sale.ecfStampUrl, { margin: 1, width: 360, errorCorrectionLevel: 'M' });
  } catch (err) {
    console.error('No se pudo generar el código QR del e-CF:', err);
    return null;
  }
}

/** Etiqueta del tipo de comprobante (catálogo de la DGII). */
function ncfLabelOf(type) {
  return NCF_LABELS[type] || `Tipo NCF: ${type || 'B02'}`;
}

export const RECEIPT_FORMATS = { A4: 'A4', TICKET: 'TICKET', BOTH: 'BOTH' };
const FORMAT_STORAGE_KEY = 'factos-receipt-format';

/** Formato de comprobante preferido en este equipo (hasta que exista SystemConfig en el servidor). */
export function getReceiptFormat() {
  try {
    const stored = localStorage.getItem(FORMAT_STORAGE_KEY);
    if (Object.values(RECEIPT_FORMATS).includes(stored)) return stored;
  } catch {
    // almacenamiento no disponible: se usa el valor global
  }
  return useConfigStore.getState().config.receiptFormat || RECEIPT_FORMATS.A4;
}

export function setReceiptFormat(format) {
  try {
    localStorage.setItem(FORMAT_STORAGE_KEY, format);
  } catch {
    // almacenamiento no disponible: se usa el valor por defecto
  }
}

const getBusiness = () => useConfigStore.getState().config.business;

/** Etiqueta de ITBIS según lo realmente cobrado en la venta (la tasa pudo cambiar después). */
function taxLabel(sale) {
  const base = Number(sale.subtotal || 0) - Number(sale.discount || 0);
  const rate = base > 0 ? Number(sale.tax || 0) / base : useConfigStore.getState().config.taxRate;
  return `ITBIS (${formatTaxPercent(rate)}%)`;
}

const money = value => `$${Number(value || 0).toFixed(2)}`;

/** Plantilla A: carta / A4 con todos los detalles legales (B01/B02). */
function buildA4Receipt(sale, qr = null) {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();

  // Top decorative bar
  doc.setFillColor(79, 70, 229); // Indigo 600
  doc.rect(0, 0, pageWidth, 5, 'F');

  // Header: Business Information
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(30, 41, 59); // Slate 800
  const business = getBusiness();
  doc.text(business.name || 'FACTOS', 14, 18);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(100, 116, 139); // Slate 500
  doc.text('Sistema de Facturación & Control de Inventarios', 14, 23);
  if (business.rnc) doc.text(`RNC: ${business.rnc}`, 14, 27.5);
  if (business.address) doc.text(business.address.substring(0, 80), 14, 32);
  const contact = [business.phone && `Tel: ${business.phone}`, business.email && `Email: ${business.email}`]
    .filter(Boolean)
    .join(' | ');
  if (contact) doc.text(contact, 14, 36.5);

  // NCF / Invoice Badge Box (Right side)
  const badgeX = pageWidth - 80;
  const badgeY = 12;
  const badgeWidth = 66;
  const badgeHeight = 27;

  doc.setFillColor(248, 250, 252); // Slate 50
  doc.setDrawColor(199, 210, 254); // Indigo 200
  doc.roundedRect(badgeX, badgeY, badgeWidth, badgeHeight, 2, 2, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(79, 70, 229); // Indigo 600
  doc.text(sale.eNcf ? 'COMPROBANTE FISCAL ELECTRÓNICO' : 'FACTURA / COMPROBANTE FISCAL', badgeX + badgeWidth / 2, badgeY + 6, {
    align: 'center',
  });

  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42); // Slate 900
  doc.text(sale.invoiceNumber || 'B0200000001', badgeX + badgeWidth / 2, badgeY + 13.5, {
    align: 'center',
  });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  const ncfLabel = ncfLabelOf(sale.ecfType || sale.ncfType);
  doc.text(ncfLabel, badgeX + badgeWidth / 2, badgeY + 19, { align: 'center' });
  doc.text('Válido para fines tributarios', badgeX + badgeWidth / 2, badgeY + 23.5, {
    align: 'center',
  });

  // Horizontal Divider
  doc.setDrawColor(226, 232, 240); // Slate 200
  doc.setLineWidth(0.5);
  doc.line(14, 43, pageWidth - 14, 43);

  // Metadata Grid: Customer Info & Transaction Info
  const custName = sale.customerName || sale.customer?.name || 'CONSUMIDOR FINAL';
  const custDoc = sale.customer?.documentId || sale.customer?.rnc || '000-0000000-0';
  const custPhone = sale.customer?.phone || sale.customer?.address || 'N/D';

  const saleDate = new Date(sale.createdAt || Date.now()).toLocaleString('es-DO', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
  const payment = sale.paymentMethod || 'EFECTIVO';
  const cashier = sale.userName || sale.user?.fullName || 'Cajero Principal';

  // Column 1: Customer Details
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text('DATOS DEL CLIENTE', 14, 48);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(30, 41, 59);
  doc.text(`Nombre / Razón:`, 14, 53);
  doc.setFont('helvetica', 'bold');
  doc.text(custName.substring(0, 35), 40, 53);

  doc.setFont('helvetica', 'normal');
  doc.text(`RNC / Cédula:`, 14, 58);
  doc.setFont('helvetica', 'bold');
  doc.text(custDoc, 40, 58);

  doc.setFont('helvetica', 'normal');
  doc.text(`Contacto:`, 14, 63);
  doc.text(custPhone.substring(0, 35), 40, 63);

  // Column 2: Sale & Fiscal Details
  const col2X = 118;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text('DATOS DE EMISIÓN', col2X, 48);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(30, 41, 59);
  doc.text(`Fecha Emisión:`, col2X, 53);
  doc.text(saleDate, col2X + 26, 53);

  doc.text(`Método Pago:`, col2X, 58);
  doc.setFont('helvetica', 'bold');
  doc.text(payment, col2X + 26, 58);

  doc.setFont('helvetica', 'normal');
  doc.text(`Vendedor/Caja:`, col2X, 63);
  doc.text(cashier, col2X + 26, 63);

  // Detailed Items Table
  const tableRows = (sale.details || []).map((det, index) => {
    const qty = det.quantity || 1;
    const unit = Number(det.unitPrice || 0);
    const disc = Number(det.discount || 0);
    const sub = Number(det.subtotal || unit * qty - disc);

    return [
      index + 1,
      det.productName || det.product?.name || `Artículo #${index + 1}`,
      qty,
      `$${unit.toFixed(2)}`,
      disc > 0 ? `-$${disc.toFixed(2)}` : '$0.00',
      `$${sub.toFixed(2)}`,
    ];
  });

  autoTable(doc, {
    startY: 68,
    head: [['#', 'Descripción del Producto', 'Cant.', 'Precio Unit.', 'Desc.', 'Total']],
    body: tableRows,
    theme: 'striped',
    headStyles: {
      fillColor: [79, 70, 229], // Indigo 600
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8.5,
      halign: 'left',
    },
    columnStyles: {
      0: { cellWidth: 10, halign: 'center' },
      1: { cellWidth: 'auto', halign: 'left' },
      2: { cellWidth: 16, halign: 'center' },
      3: { cellWidth: 26, halign: 'right' },
      4: { cellWidth: 22, halign: 'right' },
      5: { cellWidth: 28, halign: 'right' },
    },
    styles: {
      font: 'helvetica',
      fontSize: 8,
      cellPadding: 2.5,
      textColor: [30, 41, 59],
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
    margin: { left: 14, right: 14 },
  });

  // Totals Calculations Box
  let finalY = doc.lastAutoTable?.finalY ? doc.lastAutoTable.finalY + 6 : 120;
  if (finalY > (qr ? 205 : 235)) {
    doc.addPage();
    finalY = 20;
  }

  const totalBoxX = pageWidth - 80;
  const totalBoxWidth = 66;

  const subtotalVal = Number(sale.subtotal || 0);
  const discountVal = Number(sale.discount || 0);
  const taxVal = Number(sale.tax || 0);
  const totalVal = Number(sale.total || 0);

  // Left column: Commercial notes / fiscal compliance
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text('TÉRMINOS & CONDICIONES', 14, finalY + 4);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(148, 163, 184); // Slate 400
  doc.text(
    '• Comprobante fiscal electrónico conforme a las normativas de la DGII.',
    14,
    finalY + 9
  );
  doc.text(
    '• No se aceptan devoluciones sin la presentación de este comprobante.',
    14,
    finalY + 13.5
  );
  doc.text('• ¡Gracias por su compra y preferir nuestros servicios!', 14, finalY + 18);

  // Timbre electrónico del e-CF: QR + código de seguridad + fecha de firma (requisitos de la representación impresa)
  if (qr) {
    doc.addImage(qr, 'PNG', 14, finalY + 24, 30, 30);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(71, 85, 105);
    doc.text(`e-NCF: ${sale.eNcf}`, 48, finalY + 32);
    doc.text(`Código de seguridad: ${sale.ecfSecurityCode || ''}`, 48, finalY + 37);
    doc.text(`Fecha de firma digital: ${ecfSignDate(sale)}`, 48, finalY + 42);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(148, 163, 184);
    doc.text('Verifique este comprobante escaneando el código QR.', 48, finalY + 47);
  }

  // Right column: Financial Summary
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(71, 85, 105); // Slate 600

  doc.text('Subtotal:', totalBoxX, finalY + 4);
  doc.text(`$${subtotalVal.toFixed(2)}`, pageWidth - 14, finalY + 4, { align: 'right' });

  doc.text('Descuentos:', totalBoxX, finalY + 9);
  doc.setTextColor(225, 29, 72); // Rose 600
  doc.text(`-$${discountVal.toFixed(2)}`, pageWidth - 14, finalY + 9, { align: 'right' });

  doc.setTextColor(71, 85, 105);
  doc.text(`${taxLabel(sale)}:`, totalBoxX, finalY + 14);
  doc.text(`$${taxVal.toFixed(2)}`, pageWidth - 14, finalY + 14, { align: 'right' });

  // Total Final Highlight Box
  doc.setFillColor(238, 242, 255); // Indigo 50
  doc.setDrawColor(199, 210, 254); // Indigo 200
  doc.roundedRect(totalBoxX - 2, finalY + 18, totalBoxWidth + 2, 9, 1.5, 1.5, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(79, 70, 229); // Indigo 600
  doc.text('TOTAL A PAGAR:', totalBoxX, finalY + 24);
  doc.text(`$${totalVal.toFixed(2)}`, pageWidth - 14, finalY + 24, { align: 'right' });

  // Page Footer
  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(148, 163, 184);
    doc.text(
      `Factos — Documento Fiscal Digital • Página ${i} de ${pageCount}`,
      pageWidth / 2,
      doc.internal.pageSize.getHeight() - 7,
      { align: 'center' }
    );
  }

  return doc;
}

/** Parte un texto en líneas de máximo `max` caracteres. */
function splitName(text, max) {
  const lines = [];
  let current = '';
  String(text)
    .split(' ')
    .forEach(word => {
      if ((current + ' ' + word).trim().length > max) {
        if (current) lines.push(current);
        current = word.substring(0, max);
      } else {
        current = (current + ' ' + word).trim();
      }
    });
  if (current) lines.push(current);
  return lines.length ? lines : [''];
}

/** Plantilla B: ticket de 80 mm para impresoras térmicas. */
function buildTicketReceipt(sale, qr = null) {
  const width = 80;
  const margin = 4;
  const right = width - margin;
  const center = width / 2;
  const details = sale.details || [];
  const itemLines = details.map(det =>
    splitName(det.productName || det.product?.name || 'Artículo', 30)
  );
  const rows = itemLines.reduce((acc, lines) => acc + lines.length + 1, 0);

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: [width, 85 + rows * 3.6 + 30 + (qr ? 48 : 0)],
  });
  let y = 8;
  const line = (text, x = margin, opts) => {
    doc.text(String(text), x, y, opts);
    y += 3.6;
  };
  const rule = () => {
    doc.setLineDashPattern([0.6, 0.6], 0);
    doc.line(margin, y - 1.6, right, y - 1.6);
    doc.setLineDashPattern([], 0);
    y += 1.2;
  };

  doc.setFont('courier', 'bold');
  doc.setFontSize(13);
  const business = getBusiness();
  line(business.name || 'FACTOS', center, { align: 'center' });
  doc.setFont('courier', 'normal');
  doc.setFontSize(7.5);
  line('Sistema de Facturación', center, { align: 'center' });
  if (business.rnc) line(`RNC: ${business.rnc}`, center, { align: 'center' });
  if (business.phone) line(`Tel: ${business.phone}`, center, { align: 'center' });
  rule();

  doc.setFont('courier', 'bold');
  line(sale.invoiceNumber || '', center, { align: 'center' });
  doc.setFont('courier', 'normal');
  const ncfLabel = ncfLabelOf(sale.ecfType || sale.ncfType);
  line(ncfLabel, center, { align: 'center' });
  rule();

  const custName = sale.customerName || sale.customer?.name || 'CONSUMIDOR FINAL';
  const custDoc = sale.customer?.rnc || sale.customer?.documentId;
  const saleDate = new Date(sale.createdAt || Date.now()).toLocaleString('es-DO', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
  line(`Fecha: ${saleDate}`);
  line(`Cliente: ${custName.substring(0, 30)}`);
  if (custDoc) line(`RNC/Céd: ${custDoc}`);
  line(`Cajero: ${(sale.userName || sale.user?.fullName || '').substring(0, 30)}`);
  line(`Pago: ${sale.paymentMethod || 'EFECTIVO'}`);
  rule();

  doc.setFont('courier', 'bold');
  doc.text('DESCRIPCIÓN', margin, y);
  doc.text('TOTAL', right, y, { align: 'right' });
  y += 3.6;
  doc.setFont('courier', 'normal');
  details.forEach((det, i) => {
    const qty = det.quantity || 1;
    const unit = Number(det.unitPrice || 0);
    const disc = Number(det.discount || 0);
    const sub = Number(det.subtotal ?? unit * qty - disc);
    itemLines[i].forEach(text => line(text));
    doc.text(`${qty} x ${money(unit)}${disc > 0 ? ` (-${money(disc)})` : ''}`, margin + 2, y);
    doc.text(money(sub), right, y, { align: 'right' });
    y += 3.6;
  });
  rule();

  const totalRow = (label, value, bold = false) => {
    doc.setFont('courier', bold ? 'bold' : 'normal');
    doc.setFontSize(bold ? 9.5 : 7.5);
    doc.text(label, margin, y);
    doc.text(value, right, y, { align: 'right' });
    y += bold ? 4.4 : 3.6;
  };
  totalRow('Subtotal', money(sale.subtotal));
  totalRow('Descuentos', `-${money(sale.discount)}`);
  totalRow(taxLabel(sale), money(sale.tax));
  totalRow('TOTAL', money(sale.total), true);
  rule();

  doc.setFont('courier', 'normal');
  doc.setFontSize(7);
  y += 1;
  line('¡Gracias por su compra!', center, { align: 'center' });
  line('Conserve este comprobante', center, { align: 'center' });
  if (qr) {
    y += 1;
    doc.addImage(qr, 'PNG', center - 14, y, 28, 28);
    y += 31;
    line(`e-NCF: ${sale.eNcf}`, center, { align: 'center' });
    line(`Código de seguridad: ${sale.ecfSecurityCode || ''}`, center, { align: 'center' });
    line(`Fecha de firma:`, center, { align: 'center' });
    line(ecfSignDate(sale), center, { align: 'center' });
  }
  return doc;
}

/**
 * Genera el comprobante de una venta (respuesta de POST /sales o GET /sales/:id), lo descarga y
 * lo abre en una pestaña nueva. Reutilizado por el POS y por el historial de ventas.
 */
export async function printReceipt(sale, format = getReceiptFormat()) {
  if (!sale) return;
  try {
    const qr = await buildStampQr(sale);
    const invoice = sale.invoiceNumber || 'POS';
    const outputs = [];
    if (format !== RECEIPT_FORMATS.TICKET) {
      outputs.push({ doc: buildA4Receipt(sale, qr), name: `Factura_${invoice}.pdf` });
    }
    if (format !== RECEIPT_FORMATS.A4) {
      outputs.push({ doc: buildTicketReceipt(sale, qr), name: `Factura_${invoice}_ticket.pdf` });
    }
    outputs.forEach(({ doc, name }) => {
      doc.save(name);
      window.open(URL.createObjectURL(doc.output('blob')), '_blank');
    });
  } catch (err) {
    console.error('Error al generar PDF de factura:', err);
    notify.error('Ocurrió un error al generar el PDF del comprobante.');
  }
}

/**
 * Reimprime una venta histórica: la carga del API (que valida propiedad/rol) y genera el PDF.
 */
export async function reprintSaleById(saleId) {
  try {
    const result = await api.sales.get(saleId);
    await printReceipt(result?.data || result);
  } catch (err) {
    console.error('Error al reimprimir la factura:', err);
    notify.error(err.message || 'No se pudo cargar la factura para reimprimir.');
  }
}
