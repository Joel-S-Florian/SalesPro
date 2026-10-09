import React, { useEffect, useMemo, useRef, useState } from 'react';
import JsBarcode from 'jsbarcode';
import { api } from '../services/api';
import { Loader2, Printer } from 'lucide-react';

const inputClass =
  'px-3 py-2 border border-slate-200 dark:border-slate-800 rounded-lg bg-transparent text-xs outline-none focus:ring-1 focus:ring-indigo-500';

// EAN-13 válido: 13 dígitos con dígito verificador correcto
function isValidEan13(value) {
  if (!/^\d{13}$/.test(value)) return false;
  const digits = value.split('').map(Number);
  const sum = digits.slice(0, 12).reduce((acc, d, i) => acc + d * (i % 2 === 0 ? 1 : 3), 0);
  return (10 - (sum % 10)) % 10 === digits[12];
}

function Barcode({ value, withPrice, name, price }) {
  const ref = useRef(null);

  useEffect(() => {
    if (!ref.current) return;
    try {
      JsBarcode(ref.current, value, {
        format: isValidEan13(value) ? 'EAN13' : 'CODE128',
        width: 2,
        height: 60,
        fontSize: 14,
        margin: 6,
        displayValue: true,
      });
    } catch {
      ref.current.innerHTML = '';
    }
  }, [value]);

  return (
    <div className="label border border-slate-300 rounded p-2 flex flex-col items-center bg-white text-black break-inside-avoid">
      <div className="name text-[11px] font-semibold text-center leading-tight h-7 overflow-hidden">{name}</div>
      <svg ref={ref} className="max-w-full" />
      {withPrice && <div className="price text-sm font-bold">${Number(price || 0).toFixed(2)}</div>}
    </div>
  );
}

/**
 * Genera hojas de etiquetas con código de barras para imprimir (o mostrar en otra pantalla
 * para probar un lector). Usa EAN-13 si el código es válido y CODE128 en los demás casos.
 */
export default function BarcodeLabels() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState({});
  const [copies, setCopies] = useState(1);
  const [withPrice, setWithPrice] = useState(true);
  const sheetRef = useRef(null);

  useEffect(() => {
    api.products
      .list({ limit: 100 })
      .then(res => setProducts((Array.isArray(res) ? res : res?.data || []).filter(p => p.active)))
      .catch(err => setError(err.message || 'Error al cargar productos'))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter(
      p => !q || p.name.toLowerCase().includes(q) || p.code.toLowerCase().includes(q)
    );
  }, [products, search]);

  const chosen = products.filter(p => selected[p.id]);
  const allSelected = filtered.length > 0 && filtered.every(p => selected[p.id]);

  const toggleAll = () => {
    const next = { ...selected };
    filtered.forEach(p => {
      next[p.id] = !allSelected;
    });
    setSelected(next);
  };

  const handlePrint = () => {
    const win = window.open('', '_blank');
    if (!win) {
      alert('El navegador bloqueó la ventana de impresión. Permita las ventanas emergentes.');
      return;
    }
    win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Etiquetas</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 8mm; }
        .sheet { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4mm; }
        .label { border: 1px dashed #999; padding: 3mm; text-align: center; break-inside: avoid; }
        .label svg { max-width: 100%; }
        .name { font-size: 11px; font-weight: 600; height: 28px; overflow: hidden; }
        .price { font-size: 14px; font-weight: bold; }
      </style></head><body><div class="sheet">${sheetRef.current.innerHTML}</div>
      <script>window.onload = () => { window.print(); }</script></body></html>`);
    win.document.close();
  };

  return (
    <div className="space-y-4" id="barcode-labels-view">
      <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-xl p-4 shadow-sm space-y-3">
        <div>
          <h3 className="font-semibold text-slate-800 dark:text-slate-100">Etiquetas de código de barras</h3>
          <p className="text-xs text-slate-400">
            Seleccione productos para imprimir sus etiquetas (o mostrarlas en otra pantalla y probar el lector).
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="text"
            placeholder="Buscar producto o código..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className={`${inputClass} w-64`}
          />
          <label className="flex items-center gap-1.5 text-xs">
            Copias:
            <input
              type="number"
              min="1"
              max="50"
              value={copies}
              onChange={e => setCopies(Math.min(50, Math.max(1, parseInt(e.target.value) || 1)))}
              className={`${inputClass} w-16`}
            />
          </label>
          <label className="flex items-center gap-1.5 text-xs cursor-pointer">
            <input type="checkbox" checked={withPrice} onChange={e => setWithPrice(e.target.checked)} />
            Mostrar precio
          </label>
          <button
            onClick={handlePrint}
            disabled={chosen.length === 0}
            className="ml-auto flex items-center gap-1.5 bg-indigo-600 text-white text-xs font-semibold px-4 py-2 rounded-lg disabled:opacity-50 cursor-pointer"
          >
            <Printer className="w-4 h-4" /> Imprimir {chosen.length * copies} etiquetas
          </button>
        </div>
      </div>

      {error && <p className="text-xs text-rose-500">{error}</p>}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-xl shadow-sm max-h-[70vh] overflow-y-auto">
          {loading ? (
            <div className="p-8 text-center"><Loader2 className="w-5 h-5 animate-spin inline" /></div>
          ) : (
            <table className="w-full text-xs text-left">
              <thead className="sticky top-0 bg-slate-50 dark:bg-slate-800 text-slate-500 uppercase">
                <tr>
                  <th className="px-3 py-2 w-8"><input type="checkbox" checked={allSelected} onChange={toggleAll} aria-label="Seleccionar todos" /></th>
                  <th className="px-3 py-2">Código</th>
                  <th className="px-3 py-2">Producto</th>
                  <th className="px-3 py-2">Tipo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filtered.map(p => (
                  <tr key={p.id} className="cursor-pointer" onClick={() => setSelected({ ...selected, [p.id]: !selected[p.id] })}>
                    <td className="px-3 py-2"><input type="checkbox" readOnly checked={!!selected[p.id]} /></td>
                    <td className="px-3 py-2 font-mono">{p.code}</td>
                    <td className="px-3 py-2">{p.name}</td>
                    <td className="px-3 py-2 text-slate-400">{isValidEan13(p.code) ? 'EAN-13' : 'Code 128'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="bg-slate-100 dark:bg-slate-800/50 rounded-xl p-3 max-h-[70vh] overflow-y-auto">
          {chosen.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-10">Seleccione productos para ver la vista previa.</p>
          ) : (
            <div ref={sheetRef} className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {chosen.flatMap(p =>
                Array.from({ length: copies }, (_, i) => (
                  <Barcode key={`${p.id}-${i}`} value={p.code} name={p.name} price={p.salePrice} withPrice={withPrice} />
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
