import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import { Loader2, Upload, CheckCircle2, AlertTriangle } from 'lucide-react';
import SmartSelect from '../components/ui/SmartSelect';

const inputClass =
  'w-full px-3 py-2 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-800 dark:text-slate-100 bg-transparent focus:ring-1 focus:ring-indigo-500 outline-none text-xs';
const labelClass = 'block text-xs font-semibold text-slate-600 dark:text-slate-400';
const cardClass = 'bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-xl p-5 shadow-sm space-y-4';

const MAPPING_FIELDS = [
  { key: 'code', label: 'Código de barras / SKU *', required: true, hint: /barra|barcode|sku|c[oó]d|ean|upc|ref/i },
  { key: 'name', label: 'Descripción *', required: true, hint: /desc|nombre|name|producto|art[ií]culo/i },
  { key: 'cost', label: 'Costo unitario *', required: true, hint: /cost|precio.*compra|p\.?\s*unit/i },
  { key: 'stock', label: 'Existencia (opcional)', hint: /exist|stock|cant|qty|unid/i },
  { key: 'price', label: 'Precio de venta (opcional)', hint: /venta|pvp|sale|precio/i },
  { key: 'category', label: 'Categoría (opcional)', hint: /categ|depart|l[ií]nea|grupo/i },
  // Datos de alimentos (todos opcionales)
  { key: 'unit', label: 'Unidad de venta (UND, LB, KG…)', advanced: true, hint: /^unidad(\s*de\s*(venta|medida))?$|^unit$|medida|^u\.?m\.?$/i },
  { key: 'minStock', label: 'Stock mínimo', advanced: true, hint: /m[ií]n|reorden|reorder/i },
  { key: 'perishable', label: 'Perecedero (SI/NO)', advanced: true, hint: /perecedero|perishable/i },
  { key: 'lot', label: 'Lote', advanced: true, hint: /^lote|batch/i },
  { key: 'expiration', label: 'Vencimiento (AAAA-MM-DD)', advanced: true, hint: /venc|expir|caduc/i },
  { key: 'pres1Name', label: 'Presentación 1: nombre', advanced: true, hint: /pres\w*[ _-]?1.*(nombre|name)/i },
  { key: 'pres1Qty', label: 'Presentación 1: unidades que contiene', advanced: true, hint: /pres\w*[ _-]?1.*(unid|cant|qty|factor)/i },
  { key: 'pres1Price', label: 'Presentación 1: precio del paquete', advanced: true, hint: /pres\w*[ _-]?1.*(prec|price)/i },
  { key: 'pres1Barcode', label: 'Presentación 1: código de barras', advanced: true, hint: /pres\w*[ _-]?1.*(cod|barra)/i },
  { key: 'pres2Name', label: 'Presentación 2: nombre', advanced: true, hint: /pres\w*[ _-]?2.*(nombre|name)/i },
  { key: 'pres2Qty', label: 'Presentación 2: unidades que contiene', advanced: true, hint: /pres\w*[ _-]?2.*(unid|cant|qty|factor)/i },
  { key: 'pres2Price', label: 'Presentación 2: precio del paquete', advanced: true, hint: /pres\w*[ _-]?2.*(prec|price)/i },
  { key: 'pres2Barcode', label: 'Presentación 2: código de barras', advanced: true, hint: /pres\w*[ _-]?2.*(cod|barra)/i },
];
const BASIC_FIELDS = MAPPING_FIELDS.filter(field => !field.advanced);
const ADVANCED_FIELDS = MAPPING_FIELDS.filter(field => field.advanced);

const ACTION_STYLES = {
  CREATE: 'text-emerald-600',
  UPDATE: 'text-indigo-600',
  INVALID: 'text-rose-500',
};
const ACTION_LABELS = { CREATE: 'Nuevo', UPDATE: 'Actualiza', INVALID: 'Inválida' };

const money = value =>
  value === null || value === undefined
    ? '—'
    : `$${Number(value).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Propone un mapeo de columnas a partir del nombre de los encabezados. */
function guessMapping(columns) {
  const used = new Set();
  const mapping = {};
  // Primero los campos específicos (presentaciones, lote…): así «pres1_nombre» no se confunde con la descripción
  [...ADVANCED_FIELDS, ...BASIC_FIELDS].forEach(field => {
    const match = columns.find(column => !used.has(column) && field.hint.test(column));
    if (match) {
      mapping[field.key] = match;
      used.add(match);
    }
  });
  return mapping;
}

const readAsBase64 = file =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
    reader.onerror = () => reject(new Error('No se pudo leer el archivo'));
    reader.readAsDataURL(file);
  });

export default function ImportInventory() {
  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const [staged, setStaged] = useState(null); // { importId, columns, rowCount, sample }
  const [mapping, setMapping] = useState({});
  const [marginPercent, setMarginPercent] = useState(30);
  const [defaultCategoryId, setDefaultCategoryId] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [updatePrices, setUpdatePrices] = useState(false);
  const [preview, setPreview] = useState(null);
  const [result, setResult] = useState(null);

  const [categories, setCategories] = useState([]);
  const [suppliers, setSuppliers] = useState([]);

  useEffect(() => {
    api.categories.list().then(res => setCategories(Array.isArray(res) ? res : res?.data || [])).catch(() => {});
    api.suppliers.list({ active: 'true', limit: 100 }).then(res => setSuppliers(res?.data || [])).catch(() => {});
  }, []);

  const run = async action => {
    try {
      setBusy(true);
      setError('');
      await action();
    } catch (err) {
      setError(err.message || 'Ocurrió un error');
    } finally {
      setBusy(false);
    }
  };

  const handleFile = e => {
    const file = e.target.files?.[0];
    if (!file) return;
    run(async () => {
      const contentBase64 = await readAsBase64(file);
      const data = await api.inventoryImport.stage({ fileName: file.name, contentBase64 });
      setStaged(data);
      setMapping(guessMapping(data.columns));
      setStep(2);
    });
  };

  const buildPreviewPayload = () => ({
    mapping: Object.fromEntries(MAPPING_FIELDS.map(f => [f.key, mapping[f.key] || ''])),
    marginPercent: Number(marginPercent) || 0,
    defaultCategoryId: defaultCategoryId || undefined,
    supplierId: supplierId || undefined,
    updatePrices,
  });

  const handlePreview = () =>
    run(async () => {
      setPreview(await api.inventoryImport.preview(staged.importId, buildPreviewPayload()));
      setStep(3);
    });

  const handleApply = () =>
    run(async () => {
      setResult(await api.inventoryImport.apply(staged.importId));
      setStep(4);
    });

  const reset = async () => {
    if (staged && step < 4) {
      try {
        await api.inventoryImport.cancel(staged.importId);
      } catch {
        // la importación pendiente queda en staging; no bloquea una nueva
      }
    }
    setStep(1);
    setStaged(null);
    setPreview(null);
    setResult(null);
    setError('');
  };

  const missingRequired = MAPPING_FIELDS.some(f => f.required && !mapping[f.key]);
  const needsCategory = !mapping.category && !defaultCategoryId;

  const renderMappingField = field => (
    <div key={field.key} className="space-y-1.5">
      <label htmlFor={`map-${field.key}`} className={labelClass}>{field.label}</label>
      <SmartSelect
        id={`map-${field.key}`}
        value={mapping[field.key] || ''}
        onChange={e => setMapping({ ...mapping, [field.key]: e.target.value })}
        className={inputClass}
      >
        <option value="">{field.required ? 'Seleccione una columna...' : '— No usar —'}</option>
        {staged.columns.map(column => (
          <option key={column} value={column}>{column}</option>
        ))}
      </SmartSelect>
    </div>
  );

  return (
    <div className="space-y-4 max-w-5xl" id="import-inventory-view">
      <div>
        <h3 className="font-semibold text-slate-800 dark:text-slate-100">Importar inventario</h3>
        <p className="text-xs text-slate-400">
          Cargue la lista de un proveedor (CSV, Excel o JSON), asigne las columnas y revise antes de aplicar.
        </p>
        <div className="flex gap-2 mt-3 text-[11px] font-semibold">
          {['Archivo', 'Columnas', 'Revisión', 'Resultado'].map((label, i) => (
            <span
              key={label}
              className={`px-3 py-1 rounded-full ${step === i + 1 ? 'bg-indigo-600 text-white' : step > i + 1 ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-400'}`}
            >
              {i + 1}. {label}
            </span>
          ))}
        </div>
      </div>

      {error && <p className="text-xs text-rose-500 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{error}</p>}

      {step === 1 && (
        <div className={cardClass}>
          <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-xl py-12 cursor-pointer hover:border-indigo-400">
            {busy ? <Loader2 className="w-6 h-6 animate-spin text-indigo-500" /> : <Upload className="w-6 h-6 text-slate-400" />}
            <span className="text-xs text-slate-500">Seleccione un archivo .csv, .xlsx o .json (máx. 5,000 filas)</span>
            <input type="file" accept=".csv,.xlsx,.json" className="hidden" onChange={handleFile} disabled={busy} />
          </label>
          <p className="text-[11px] text-slate-400">
            La primera fila debe contener los encabezados. El archivo original se conserva sin modificar para auditoría.
          </p>
        </div>
      )}

      {step === 2 && staged && (
        <div className="space-y-4">
          <div className={cardClass}>
            <h4 className="font-semibold text-sm">Asignación de columnas</h4>
            <p className="text-xs text-slate-400">{staged.rowCount} filas detectadas. Las columnas sin asignar se descartan.</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {BASIC_FIELDS.map(renderMappingField)}
            </div>
            <details className="rounded-lg border border-slate-100 p-3 dark:border-slate-800" open={ADVANCED_FIELDS.some(f => mapping[f.key])}>
              <summary className="cursor-pointer text-xs font-semibold text-slate-600 dark:text-slate-300">
                Datos de alimentos (opcional): unidad, perecedero, lote, vencimiento y presentaciones
              </summary>
              <p className="mt-2 text-[11px] text-slate-400">
                Un producto perecedero puede ocupar varias filas con el mismo código y distinto lote. Los productos que ya existen conservan su unidad y presentaciones.
              </p>
              <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-4">{ADVANCED_FIELDS.map(renderMappingField)}</div>
            </details>
          </div>

          <div className={cardClass}>
            <h4 className="font-semibold text-sm">Reglas de importación</h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <label htmlFor="imp-margin" className={labelClass}>Margen de ganancia (%)</label>
                <input id="imp-margin" type="number" min="0" step="0.5" value={marginPercent} onChange={e => setMarginPercent(e.target.value)} className={inputClass} />
                <p className="text-[11px] text-slate-400">Precio = costo + margen, si el archivo no trae precio.</p>
              </div>
              <div className="space-y-1.5">
                <label htmlFor="imp-category" className={labelClass}>Categoría por defecto</label>
                <SmartSelect id="imp-category" value={defaultCategoryId} onChange={e => setDefaultCategoryId(e.target.value)} className={inputClass}>
                  <option value="">{mapping.category ? '— Usar la del archivo —' : 'Seleccione...'}</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </SmartSelect>
              </div>
              <div className="space-y-1.5">
                <label htmlFor="imp-supplier" className={labelClass}>Proveedor</label>
                <SmartSelect id="imp-supplier" value={supplierId} onChange={e => setSupplierId(e.target.value)} className={inputClass}>
                  <option value="">— Sin proveedor —</option>
                  {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </SmartSelect>
              </div>
            </div>
            <label className="flex items-center gap-2 text-xs cursor-pointer">
              <input type="checkbox" checked={updatePrices} onChange={e => setUpdatePrices(e.target.checked)} />
              En productos existentes, actualizar también el precio de venta
            </label>
          </div>

          <div className="flex justify-between">
            <button onClick={reset} className="px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 cursor-pointer">Cancelar</button>
            <button
              onClick={handlePreview}
              disabled={busy || missingRequired || needsCategory}
              className="px-4 py-2 text-xs rounded-lg bg-indigo-600 text-white font-semibold disabled:opacity-50 cursor-pointer"
            >
              {busy ? 'Procesando...' : 'Revisar datos'}
            </button>
          </div>
        </div>
      )}

      {step === 3 && preview && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              ['Nuevos', preview.summary.create, 'text-emerald-600'],
              ['Actualizan', preview.summary.update, 'text-indigo-600'],
              ['Inválidas (se omiten)', preview.summary.invalid, 'text-rose-500'],
              ['Valor de la entrada', money(preview.summary.value), ''],
            ].map(([label, value, color]) => (
              <div key={label} className={cardClass + ' !p-4 !space-y-1'}>
                <p className="text-[11px] text-slate-400">{label}</p>
                <p className={`text-lg font-bold font-mono ${color}`}>{value}</p>
              </div>
            ))}
          </div>
          {preview.summary.newCategories.length > 0 && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              Se crearán categorías nuevas: {preview.summary.newCategories.join(', ')}
            </p>
          )}

          <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-xl shadow-sm overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 uppercase tracking-wider">
                <tr>
                  <th className="px-3 py-2">Fila</th>
                  <th className="px-3 py-2">Acción</th>
                  <th className="px-3 py-2">Código</th>
                  <th className="px-3 py-2">Descripción</th>
                  <th className="px-3 py-2 text-right">Costo</th>
                  <th className="px-3 py-2 text-right">Precio</th>
                  <th className="px-3 py-2 text-right">Existencia</th>
                  <th className="px-3 py-2">Detalle</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {preview.rows.map(row => (
                  <tr key={row.rowNumber} className={row.action === 'INVALID' ? 'bg-rose-50/50 dark:bg-rose-950/10' : ''}>
                    <td className="px-3 py-2 font-mono">{row.rowNumber}</td>
                    <td className={`px-3 py-2 font-semibold ${ACTION_STYLES[row.action]}`}>
                      {ACTION_LABELS[row.action]}
                      {row.errors && <div className="font-normal text-[11px]">{row.errors.join('; ')}</div>}
                    </td>
                    <td className="px-3 py-2 font-mono">{row.code || '—'}</td>
                    <td className="px-3 py-2">{row.name || '—'}</td>
                    <td className="px-3 py-2 text-right font-mono">{money(row.cost)}</td>
                    <td className="px-3 py-2 text-right font-mono">{money(row.price)}</td>
                    <td className="px-3 py-2 text-right font-mono">{row.stock}{row.unit && row.unit !== 'UND' ? ` ${row.unit.toLowerCase()}` : ''}</td>
                    <td className="px-3 py-2 text-[11px] text-slate-500">
                      {[
                        row.isPerishable && 'Perecedero',
                        row.lot && `Lote ${row.lot}${row.expiration ? ` · vence ${row.expiration}` : ''}`,
                        row.extraLot && 'lote adicional',
                        row.presentations?.length > 0 && `${row.presentations.length} presentación(es)`,
                      ].filter(Boolean).join(' · ') || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {preview.summary.total > preview.rows.length && (
            <p className="text-[11px] text-slate-400">Se muestran {preview.rows.length} de {preview.summary.total} filas (las inválidas primero).</p>
          )}

          <div className="flex justify-between">
            <button onClick={() => setStep(2)} className="px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 cursor-pointer">Volver a columnas</button>
            <button
              onClick={handleApply}
              disabled={busy || preview.summary.create + preview.summary.update === 0}
              className="px-4 py-2 text-xs rounded-lg bg-emerald-600 text-white font-semibold disabled:opacity-50 cursor-pointer"
            >
              {busy ? 'Aplicando...' : `Aplicar ${preview.summary.create + preview.summary.update} productos`}
            </button>
          </div>
        </div>
      )}

      {step === 4 && result && (
        <div className={cardClass + ' text-center items-center'}>
          <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto" />
          <p className="text-sm font-semibold">{result.rejected > 0 ? 'Importación parcial' : 'Importación completada'}</p>
          <p className="text-xs text-slate-500">
            {result.created} productos creados · {result.updated} actualizados · {result.entries} entradas de inventario
          </p>
          {result.rejected > 0 && (
            <div className="w-full max-w-xl rounded-lg border border-amber-200 bg-amber-50 p-3 text-left text-xs text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
              <p className="font-semibold">{result.rejected} filas no se importaron por el plan</p>
              <ul className="mt-1.5 max-h-40 space-y-0.5 overflow-y-auto">
                {result.rejectedRows.map(row => (
                  <li key={row.rowNumber}>
                    Fila {row.rowNumber} · {row.code}: {row.reason}
                  </li>
                ))}
              </ul>
              {result.rejected > result.rejectedRows.length && <p className="mt-1 text-[11px]">Se muestran las primeras {result.rejectedRows.length}.</p>}
              <p className="mt-1.5 text-[11px]">El resto del archivo sí se importó. Puedes liberar espacio o cambiar de plan y volver a cargar esas filas.</p>
            </div>
          )}
          <button onClick={reset} className="px-4 py-2 text-xs rounded-lg bg-indigo-600 text-white font-semibold cursor-pointer">Importar otro archivo</button>
        </div>
      )}
      {step === 4 && !result && <AlertTriangle className="w-5 h-5 text-amber-500" />}
    </div>
  );
}
