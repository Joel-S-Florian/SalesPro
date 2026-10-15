import React, { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../services/api';
import { Download, FileText, Loader2, Plus, ScanBarcode, Trash2, X } from 'lucide-react';
import { notify } from '../utils/notify';
import { usePagedList } from '../hooks/usePagedList';
import Pagination from '../components/Pagination';
import SmartSelect from '../components/ui/SmartSelect';
import { downloadBlob, runLabelJob } from '../hooks/useLabelWorker';
import { DEFAULT_PRESET_ID, LAYOUT_PRESETS, computeGrid, getPreset, planFiles, summarize } from '../utils/labelLayouts';
import { isValidEan13 } from '../utils/labelPdf';

const inputClass =
  'px-3 py-2 border border-slate-200 dark:border-slate-800 rounded-lg bg-transparent text-xs outline-none focus:ring-1 focus:ring-indigo-500';
const cardClass = 'bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-xl p-4 shadow-sm space-y-3';
const STORAGE_KEY = 'factos-label-settings';
const MAX_COPIES = 9999;

const LAYOUT_FIELDS = [
  ['pageW', 'Ancho de la hoja (mm)'],
  ['pageH', 'Alto de la hoja (mm)'],
  ['cols', 'Columnas'],
  ['rows', 'Filas'],
  ['marginLeft', 'Margen lateral (mm)'],
  ['marginTop', 'Margen superior (mm)'],
  ['gapX', 'Separación horizontal (mm)'],
  ['gapY', 'Separación vertical (mm)'],
];

function loadSettings() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
  } catch {
    return {};
  }
}

const clampCopies = value => Math.min(MAX_COPIES, Math.max(0, Math.floor(Number(value) || 0)));

/**
 * Etiquetas de código de barras: cola de productos con copias propias, formatos de papel (hoja de stickers o rollo),
 * vista previa de la primera página y descarga en PDF generada fuera del hilo principal, con progreso y cancelación.
 * Usa EAN-13 si el código es válido y Code 128 en los demás casos.
 */
export default function BarcodeLabels() {
  const saved = useMemo(loadSettings, []);
  const [search, setSearch] = useState('');
  const [items, setItems] = useState([]); // [{ id, code, name, price, copies }]
  const [defaultCopies, setDefaultCopies] = useState(saved.defaultCopies || 1);
  const [presetId, setPresetId] = useState(saved.presetId || DEFAULT_PRESET_ID);
  const [layout, setLayout] = useState(saved.layout || getPreset(saved.presetId || DEFAULT_PRESET_ID));
  const [showName, setShowName] = useState(saved.showName ?? true);
  const [showPrice, setShowPrice] = useState(saved.showPrice ?? true);
  const [split, setSplit] = useState(saved.split || 'single');
  const [maxPerFile, setMaxPerFile] = useState(saved.maxPerFile || 500);
  const [job, setJob] = useState(null); // { done, total, cancel } mientras se genera la descarga
  const [addingAll, setAddingAll] = useState(null); // { done, total } mientras se agregan todos los productos
  const [previewUrl, setPreviewUrl] = useState('');
  const [previewBusy, setPreviewBusy] = useState(false);
  const scanRef = useRef(null);

  const grid = useMemo(() => computeGrid(layout), [layout]);
  const totals = useMemo(() => summarize(items, grid), [items, grid]);
  const files = useMemo(() => planFiles(items, { split, maxPerFile }), [items, split, maxPerFile]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ presetId, layout, showName, showPrice, split, maxPerFile, defaultCopies }));
    } catch {
      // almacenamiento no disponible
    }
  }, [presetId, layout, showName, showPrice, split, maxPerFile, defaultCopies]);

  // --- Búsqueda en el servidor (el lector también escribe aquí) ---
  const { rows, total, loading, error, page, pageSize, setPage, setPageSize } = usePagedList(api.products.page, {
    q: search.trim() || undefined,
    active: 'true',
  });

  const addProducts = (products, copies = defaultCopies) => {
    setItems(prev => {
      const next = [...prev];
      for (const p of products) {
        const index = next.findIndex(item => item.id === p.id);
        if (index >= 0) next[index] = { ...next[index], copies: clampCopies(next[index].copies + copies) };
        else next.push({ id: p.id, code: p.code, name: p.name, price: Number(p.salePrice) || 0, copies: clampCopies(copies) });
      }
      return next;
    });
  };

  // Lector de códigos: Enter con un código exacto agrega el producto (o suma copias si ya está en la cola)
  const onSearchKeyDown = async event => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    const code = search.trim();
    if (!code) return;
    try {
      const result = await api.products.page({ q: code, active: 'true', limit: 20 });
      const list = result?.data || [];
      const lower = code.toLowerCase();
      const exact = list.find(p => p.code.toLowerCase() === lower || (p.presentations || []).some(pr => pr.barcode && pr.barcode.toLowerCase() === lower));
      const match = exact || (list.length === 1 ? list[0] : null);
      if (!match) {
        notify.warning(list.length ? 'Hay varios resultados: toque el producto que desea agregar' : `No existe un producto con el código ${code}`);
        return;
      }
      addProducts([match]);
      notify.success(`${match.name}: agregado`);
      setSearch('');
      scanRef.current?.focus();
    } catch (err) {
      notify.error(err.message || 'No se pudo buscar el producto');
    }
  };

  const addAll = async () => {
    try {
      setAddingAll({ done: 0, total: total });
      let current = 1;
      let loaded = 0;
      for (;;) {
        const result = await api.products.page({ q: search.trim() || undefined, active: 'true', page: current, limit: 200 });
        const list = result?.data || [];
        addProducts(list);
        loaded += list.length;
        setAddingAll({ done: loaded, total: result?.pagination?.total ?? total });
        if (list.length < 200 || loaded >= (result?.pagination?.total ?? 0)) break;
        current += 1;
      }
    } catch (err) {
      notify.error(err.message || 'No se pudieron agregar los productos');
    } finally {
      setAddingAll(null);
    }
  };

  const setCopies = (id, value) => setItems(prev => prev.map(item => (item.id === id ? { ...item, copies: clampCopies(value) } : item)));
  const applyToAll = () => setItems(prev => prev.map(item => ({ ...item, copies: clampCopies(defaultCopies) })));

  // --- Diseño del papel ---
  const choosePreset = id => {
    setPresetId(id);
    setLayout(getPreset(id));
  };
  const setField = (key, value) => {
    setPresetId('CUSTOM');
    setLayout(prev => ({ ...prev, [key]: value === '' ? '' : Number(value) }));
  };

  // --- Vista previa: solo la primera hoja, se regenera al cambiar algo ---
  useEffect(() => {
    if (!items.some(item => item.copies > 0) || grid.error) {
      setPreviewUrl('');
      return undefined;
    }
    let cancelled = false;
    let current = null;
    const timer = setTimeout(() => {
      setPreviewBusy(true);
      current = runLabelJob({ files: planFiles(items, { split: 'single' }), grid, options: { showName, showPrice, maxLabels: grid.perPage } });
      current.promise
        .then(result => {
          if (cancelled || !result?.length) return;
          setPreviewUrl(prev => {
            if (prev) URL.revokeObjectURL(prev);
            return URL.createObjectURL(new Blob([result[0].bytes], { type: 'application/pdf' }));
          });
        })
        .catch(() => {})
        .finally(() => !cancelled && setPreviewBusy(false));
    }, 500);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      current?.cancel();
    };
  }, [items, grid, showName, showPrice]);

  useEffect(() => () => previewUrl && URL.revokeObjectURL(previewUrl), [previewUrl]);

  // --- Descarga ---
  const generate = async ({ calibration = false } = {}) => {
    if (grid.error) return notify.warning(grid.error);
    const running = runLabelJob(
      { files: calibration ? [] : files, grid, options: { showName, showPrice, calibration } },
      (done, totalLabels) => setJob(prev => (prev ? { ...prev, done, total: totalLabels } : prev))
    );
    setJob({ done: 0, total: calibration ? grid.perPage : totals.labels, cancel: () => running.cancel() });
    try {
      const result = await running.promise;
      if (!result) return notify.info('Generación cancelada');
      if (result.length === 1) {
        downloadBlob(new Blob([result[0].bytes], { type: 'application/pdf' }), `${result[0].name}.pdf`);
      } else {
        const { default: JSZip } = await import('jszip');
        const zip = new JSZip();
        result.forEach(file => zip.file(`${file.name}.pdf`, file.bytes));
        downloadBlob(await zip.generateAsync({ type: 'blob' }), 'etiquetas.zip');
      }
      notify.success(result.length === 1 ? 'PDF descargado' : `${result.length} archivos descargados en un ZIP`);
    } catch (err) {
      notify.error(err.message || 'No se pudo generar el PDF');
    } finally {
      setJob(null);
    }
  };

  const pct = job && job.total ? Math.round((job.done / job.total) * 100) : 0;

  return (
    <div className="space-y-4" id="barcode-labels-view">
      <div className={cardClass}>
        <div>
          <h3 className="font-semibold text-slate-800 dark:text-slate-100">Etiquetas de código de barras</h3>
          <p className="text-xs text-slate-400">
            Agregue productos a la cola (con el buscador o el lector), indique cuántas etiquetas de cada uno y descargue el PDF listo para imprimir en papel adhesivo.
          </p>
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="space-y-1.5">
            <label htmlFor="label-preset" className="block text-xs font-semibold text-slate-600 dark:text-slate-400">Papel</label>
            <SmartSelect id="label-preset" value={presetId} onChange={e => choosePreset(e.target.value)} className={`${inputClass} w-full`}>
              {LAYOUT_PRESETS.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </SmartSelect>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="label-split" className="block text-xs font-semibold text-slate-600 dark:text-slate-400">Archivos al descargar</label>
            <SmartSelect id="label-split" value={split} onChange={e => setSplit(e.target.value)} className={`${inputClass} w-full`}>
              <option value="single">Un solo PDF</option>
              <option value="perProduct">Un PDF por producto (ZIP)</option>
              <option value="chunk">Varios PDF de N etiquetas (ZIP)</option>
            </SmartSelect>
          </div>
          {split === 'chunk' && (
            <div className="space-y-1.5">
              <label htmlFor="label-chunk" className="block text-xs font-semibold text-slate-600 dark:text-slate-400">Etiquetas por archivo</label>
              <input id="label-chunk" type="number" min="1" max="20000" value={maxPerFile} onChange={e => setMaxPerFile(Math.max(1, Number(e.target.value) || 1))} className={`${inputClass} w-full`} />
            </div>
          )}
          <div className="flex flex-wrap items-end gap-4 text-xs">
            <label className="flex cursor-pointer items-center gap-1.5">
              <input type="checkbox" checked={showName} onChange={e => setShowName(e.target.checked)} /> Nombre
            </label>
            <label className="flex cursor-pointer items-center gap-1.5">
              <input type="checkbox" checked={showPrice} onChange={e => setShowPrice(e.target.checked)} /> Precio
            </label>
          </div>
        </div>

        <details className="rounded-lg border border-slate-100 p-3 text-xs dark:border-slate-800">
          <summary className="cursor-pointer font-semibold text-slate-600 dark:text-slate-300">Medidas del papel (avanzado)</summary>
          <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
            {LAYOUT_FIELDS.map(([key, label]) => (
              <label key={key} className="space-y-1">
                <span className="block text-[11px] text-slate-500">{label}</span>
                <input type="number" step="0.1" min="0" value={layout[key]} onChange={e => setField(key, e.target.value)} className={`${inputClass} w-full`} />
              </label>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-slate-400">
            Para un rollo térmico use 1 columna y 1 fila con el tamaño exacto de la etiqueta. Imprima la hoja de prueba sobre papel común y compárela con su hoja de stickers a contraluz.
          </p>
          <button type="button" onClick={() => generate({ calibration: true })} disabled={!!job || !!grid.error} className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 font-medium text-slate-600 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 cursor-pointer">
            <FileText className="h-3.5 w-3.5" /> Descargar hoja de prueba
          </button>
        </details>

        {grid.error ? (
          <p className="text-xs text-rose-500">{grid.error}</p>
        ) : (
          <p className="text-[11px] text-slate-400">Cada etiqueta mide {grid.cellW.toFixed(1)} × {grid.cellH.toFixed(1)} mm · {grid.perPage} por hoja.</p>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {/* Buscar y agregar */}
        <div className={cardClass}>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-0 flex-1">
              <ScanBarcode className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                ref={scanRef}
                data-scan-target
                type="text"
                aria-label="Buscar o escanear producto"
                placeholder="Buscar producto o escanear su código y presionar Enter..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                onKeyDown={onSearchKeyDown}
                className={`${inputClass} w-full pl-8`}
              />
            </div>
            <label className="flex items-center gap-1.5 text-xs">
              Copias:
              <input type="number" min="1" max={MAX_COPIES} value={defaultCopies} onChange={e => setDefaultCopies(Math.max(1, Math.min(MAX_COPIES, parseInt(e.target.value, 10) || 1)))} className={`${inputClass} w-20`} />
            </label>
            <button type="button" onClick={addAll} disabled={!!addingAll || total === 0} className="flex items-center gap-1.5 rounded-lg bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-700 disabled:opacity-50 dark:bg-slate-800 dark:text-slate-200 cursor-pointer">
              {addingAll ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
              {addingAll ? `${addingAll.done}/${addingAll.total}` : `Agregar los ${total}`}
            </button>
          </div>

          {error && <p className="text-xs text-rose-500">{error}</p>}
          <div className="max-h-[50vh] overflow-y-auto rounded-lg border border-slate-100 dark:border-slate-800">
            {loading ? (
              <div className="p-8 text-center"><Loader2 className="inline h-5 w-5 animate-spin" /></div>
            ) : (
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 bg-slate-50 uppercase text-slate-500 dark:bg-slate-800">
                  <tr>
                    <th className="px-3 py-2">Código</th>
                    <th className="px-3 py-2">Producto</th>
                    <th className="px-3 py-2">Tipo</th>
                    <th className="w-10 px-3 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {rows.map(p => (
                    <tr key={p.id}>
                      <td className="px-3 py-2 font-mono">{p.code}</td>
                      <td className="px-3 py-2">{p.name}</td>
                      <td className="px-3 py-2 text-slate-400">{isValidEan13(p.code) ? 'EAN-13' : 'Code 128'}</td>
                      <td className="px-3 py-2">
                        <button type="button" aria-label={`Agregar ${p.name}`} onClick={() => addProducts([p])} className="rounded p-1 text-indigo-600 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer">
                          <Plus className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {rows.length === 0 && (
                    <tr><td colSpan={4} className="px-3 py-6 text-center text-slate-400">Sin resultados</td></tr>
                  )}
                </tbody>
              </table>
            )}
          </div>
          <Pagination page={page} pageSize={pageSize} total={total} onPageChange={setPage} onPageSizeChange={setPageSize} noun="productos" />
        </div>

        {/* Cola de impresión */}
        <div className={cardClass}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Cola de impresión</h4>
            <div className="flex items-center gap-2 text-xs">
              <button type="button" onClick={applyToAll} disabled={items.length === 0} className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-slate-600 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 cursor-pointer">
                Poner {defaultCopies} a todos
              </button>
              <button type="button" onClick={() => setItems([])} disabled={items.length === 0} className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-slate-600 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 cursor-pointer">
                Vaciar
              </button>
            </div>
          </div>

          <div className="max-h-[32vh] overflow-y-auto rounded-lg border border-slate-100 dark:border-slate-800">
            {items.length === 0 ? (
              <p className="px-3 py-8 text-center text-xs text-slate-400">Agregue productos para armar las etiquetas.</p>
            ) : (
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 bg-slate-50 uppercase text-slate-500 dark:bg-slate-800">
                  <tr>
                    <th className="px-3 py-2">Producto</th>
                    <th className="w-28 px-3 py-2">Etiquetas</th>
                    <th className="w-10 px-3 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {items.map(item => (
                    <tr key={item.id}>
                      <td className="px-3 py-2">
                        <span className="block font-medium">{item.name}</span>
                        <span className="font-mono text-[11px] text-slate-400">{item.code}</span>
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          min="0"
                          max={MAX_COPIES}
                          aria-label={`Etiquetas de ${item.name}`}
                          value={item.copies}
                          onChange={e => setCopies(item.id, e.target.value)}
                          className={`${inputClass} w-24`}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <button type="button" aria-label={`Quitar ${item.name}`} onClick={() => setItems(prev => prev.filter(i => i.id !== item.id))} className="rounded p-1 text-slate-400 hover:text-rose-500 cursor-pointer">
                          <X className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-slate-500" aria-live="polite">
              <strong>{totals.labels.toLocaleString('es-DO')}</strong> etiquetas · {totals.pages.toLocaleString('es-DO')} {totals.pages === 1 ? 'página' : 'páginas'}
              {files.length > 1 && ` · ${files.length} archivos`}
            </p>
            {job ? (
              <button type="button" onClick={job.cancel} className="flex items-center gap-1.5 rounded-lg border border-rose-200 px-4 py-2 text-xs font-semibold text-rose-600 cursor-pointer">
                <Trash2 className="h-4 w-4" /> Cancelar
              </button>
            ) : (
              <button type="button" onClick={() => generate()} disabled={totals.labels === 0 || !!grid.error} className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white disabled:opacity-50 cursor-pointer">
                <Download className="h-4 w-4" /> Descargar {files.length > 1 ? 'ZIP' : 'PDF'}
              </button>
            )}
          </div>

          {job && (
            <div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label="Generando etiquetas" className="space-y-1">
              <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                <div className="h-full rounded-full bg-indigo-600 transition-[width] duration-200" style={{ width: `${pct}%` }} />
              </div>
              <p className="text-[11px] text-slate-500">Generando {job.done.toLocaleString('es-DO')} de {job.total.toLocaleString('es-DO')} etiquetas ({pct} %). Puede seguir usando el sistema.</p>
            </div>
          )}

          <div className="rounded-lg bg-slate-100 p-2 dark:bg-slate-800/50">
            <p className="mb-1.5 flex items-center gap-2 px-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              Vista previa de la primera hoja {previewBusy && <Loader2 className="h-3 w-3 animate-spin" />}
            </p>
            {previewUrl ? (
              <iframe title="Vista previa de etiquetas" src={`${previewUrl}#toolbar=0&navpanes=0`} className="h-[46vh] w-full rounded bg-white" />
            ) : (
              <p className="py-10 text-center text-xs text-slate-400">Agregue productos para ver cómo quedan las etiquetas.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
