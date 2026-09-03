import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export function generateFilename(reportType, filters = {}) {
  const from = filters.from || 'all';
  const to = filters.to || 'all';
  const safe = (s) => String(s).replace(/[^a-zA-Z0-9-_]/g, '');
  return `salespro_${safe(reportType)}_${safe(from)}_${safe(to)}`;
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function flattenRow(row, columns) {
  const out = {};
  columns.forEach((col) => {
    const val = row[col.key];
    out[col.label] = val === null || val === undefined ? '' : val;
  });
  return out;
}

export function exportToCSV(data, filename, columns) {
  const rows = Array.isArray(data) ? data : [];
  if (rows.length === 0) return;
  const cols = columns || Object.keys(rows[0]).map((k) => ({ key: k, label: k }));
  const flat = rows.map((r) => flattenRow(r, cols));
  const headers = cols.map((c) => c.label);
  const csv = [
    headers.join(','),
    ...flat.map((row) => headers.map((h) => `"${String(row[h] ?? '').replace(/"/g, '""')}"`).join(',')),
  ].join('\n');
  downloadBlob(new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' }), `${filename}.csv`);
}

export function exportToJSON(data, filename) {
  downloadBlob(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }), `${filename}.json`);
}

function escapeXml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function exportToXML(data, filename, rootElement = 'report', itemElement = 'row') {
  const rows = Array.isArray(data) ? data : [];
  const items = rows
    .map((row) => {
      const fields = Object.entries(row)
        .filter(([, v]) => v !== null && typeof v !== 'object')
        .map(([k, v]) => `    <${k}>${escapeXml(v)}</${k}>`)
        .join('\n');
      return `  <${itemElement}>\n${fields}\n  </${itemElement}>`;
    })
    .join('\n');
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<${rootElement}>\n${items}\n</${rootElement}>`;
  downloadBlob(new Blob([xml], { type: 'application/xml' }), `${filename}.xml`);
}

export function exportToPDF(title, columns, data, filename) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();

  doc.setFillColor(79, 70, 229);
  doc.rect(0, 0, pageWidth, 5, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(30, 41, 59);
  doc.text('SALESPRO v2', 14, 16);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(100, 116, 139);
  doc.text(title, 14, 22);

  autoTable(doc, {
    startY: 28,
    head: [columns.map((c) => c.label)],
    body: (Array.isArray(data) ? data : []).map((row) =>
      columns.map((c) => {
        const v = row[c.key];
        return v === null || v === undefined ? '' : String(v);
      })
    ),
    theme: 'striped',
    headStyles: { fillColor: [79, 70, 229], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 9 },
    styles: { font: 'helvetica', fontSize: 8, textColor: [30, 41, 59] },
    margin: { left: 14, right: 14 },
  });

  doc.save(`${filename}.pdf`);
}
