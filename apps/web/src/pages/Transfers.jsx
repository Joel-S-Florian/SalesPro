import React, { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Ban, CheckCircle2, Loader2, PackageCheck, Plus, Search, Truck, X } from 'lucide-react';
import { api } from '../services/api';
import Modal from '../components/Modal';
import SmartSelect from '../components/ui/SmartSelect';
import { notify } from '../utils/notify';
import { useBranches } from '../hooks/queries';

const inputClass =
  'w-full px-3.5 py-2 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-800 dark:text-slate-100 bg-transparent focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-xs';
const labelClass = 'block text-xs font-semibold text-slate-600 dark:text-slate-400';

const STATUS = {
  ENVIADA: { label: 'En camino', tone: 'bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300' },
  RECIBIDA: { label: 'Recibida', tone: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300' },
  ANULADA: { label: 'Anulada', tone: 'bg-slate-100 text-slate-500 dark:bg-slate-800' },
};
const day = value => new Date(value).toLocaleString('es-DO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

/** Transferencias de mercancía entre sucursales: enviar, recibir y anular mientras van en camino. */
export default function Transfers() {
  const { data: branches = [] } = useBranches();
  const [rows, setRows] = useState([]);
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState('');
  const [form, setForm] = useState(null); // { fromBranchId, toBranchId, note, lines: [{productId, name, quantity, stock, unit}] }
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [search, setSearch] = useState('');
  const [found, setFound] = useState([]);

  const load = async () => {
    try {
      setLoading(true);
      setError('');
      const result = await api.transfers.list({ status: status || undefined, limit: 50 });
      setRows(result?.data || []);
    } catch (err) {
      setError(err.message || 'No se pudieron cargar las transferencias');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  const openForm = () => {
    const main = branches.find(b => b.isMain) || branches[0];
    const other = branches.find(b => b.id !== main?.id);
    setForm({ fromBranchId: main?.id || '', toBranchId: other?.id || '', note: '', lines: [] });
    setFormError('');
    setSearch('');
    setFound([]);
  };

  // Búsqueda de productos con el stock de la sucursal de origen (el servidor responde con la sucursal del encabezado, no del origen)
  useEffect(() => {
    if (!form || search.trim().length < 2) {
      setFound([]);
      return undefined;
    }
    const timer = setTimeout(async () => {
      try {
        const result = await api.products.page({ q: search.trim(), active: true, limit: 8, branchId: form.fromBranchId });
        setFound(result?.data || []);
      } catch {
        setFound([]);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [search, form?.fromBranchId]); // eslint-disable-line react-hooks/exhaustive-deps

  const addLine = product => {
    setForm(f => (f.lines.some(l => l.productId === product.id) ? f : { ...f, lines: [...f.lines, { productId: product.id, name: product.name, code: product.code, unit: product.unit, stock: product.stock, quantity: 1 }] }));
    setSearch('');
    setFound([]);
  };
  const setQty = (productId, value) => setForm(f => ({ ...f, lines: f.lines.map(l => (l.productId === productId ? { ...l, quantity: value } : l)) }));
  const removeLine = productId => setForm(f => ({ ...f, lines: f.lines.filter(l => l.productId !== productId) }));
  const changeFrom = value => setForm(f => ({ ...f, fromBranchId: value, toBranchId: f.toBranchId === value ? branches.find(b => b.id !== value)?.id || '' : f.toBranchId, lines: [] }));

  const save = async e => {
    e.preventDefault();
    if (!form.lines.length) {
      setFormError('Agrega al menos un producto');
      return;
    }
    try {
      setSaving(true);
      setFormError('');
      await api.transfers.create({ fromBranchId: form.fromBranchId, toBranchId: form.toBranchId, note: form.note.trim() || undefined, lines: form.lines.map(l => ({ productId: l.productId, quantity: Number(l.quantity) })) });
      notify.success('Transferencia enviada: la mercancía va en camino');
      setForm(null);
      load();
    } catch (err) {
      setFormError(err.message || 'No se pudo crear la transferencia');
    } finally {
      setSaving(false);
    }
  };

  const act = async (transfer, action) => {
    const text = action === 'receive' ? `¿Confirmas que recibiste ${transfer.code} en ${transfer.toBranch.name}?` : `¿Anular ${transfer.code}? La mercancía regresa a ${transfer.fromBranch.name}.`;
    if (!window.confirm(text)) return;
    try {
      setBusyId(transfer.id);
      await api.transfers[action](transfer.id);
      notify.success(action === 'receive' ? 'Transferencia recibida' : 'Transferencia anulada');
      load();
    } catch (err) {
      notify.error(err.message || 'No se pudo completar la acción');
      load();
    } finally {
      setBusyId('');
    }
  };

  const branchOptions = useMemo(() => branches.map(b => ({ id: b.id, name: b.name })), [branches]);
  const noBranches = branches.length < 2;

  return (
    <div className="space-y-6" id="transfers-view">
      <div className="flex flex-col gap-4 border-b border-slate-100 pb-5 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-sans text-2xl font-bold tracking-tight text-slate-800 dark:text-slate-100">Transferencias entre sucursales</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">La mercancía sale del origen al enviarla y entra al destino al recibirla. Los perecederos conservan su lote y vencimiento.</p>
        </div>
        <button type="button" onClick={openForm} disabled={noBranches} className="flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto">
          <Plus className="h-4 w-4" /> Nueva transferencia
        </button>
      </div>

      {noBranches && <p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-700 dark:bg-amber-950/20">Necesitas al menos dos sucursales activas para transferir. Crea otra en Sucursales (según tu plan).</p>}

      <div className="flex gap-2">
        {[['', 'Todas'], ['ENVIADA', 'En camino'], ['RECIBIDA', 'Recibidas'], ['ANULADA', 'Anuladas']].map(([value, label]) => (
          <button key={value} type="button" onClick={() => setStatus(value)} className={`cursor-pointer rounded-full px-3 py-1 text-xs font-semibold ${status === value ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}>
            {label}
          </button>
        ))}
      </div>

      {error && <p className="text-xs text-rose-500">{error}</p>}
      {loading ? (
        <Loader2 className="h-5 w-5 animate-spin" />
      ) : rows.length === 0 ? (
        <p className="py-8 text-center text-xs text-slate-400">No hay transferencias {status ? 'con ese estado' : 'todavía'}.</p>
      ) : (
        <div className="space-y-3">
          {rows.map(t => (
            <div key={t.id} className="space-y-3 rounded-xl border border-slate-100 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-800 dark:text-slate-100">
                  <Truck className="h-4 w-4 text-indigo-500" />
                  <span className="font-mono">{t.code}</span>
                  <span>{t.fromBranch.name}</span>
                  <ArrowRight className="h-3.5 w-3.5 text-slate-400" />
                  <span>{t.toBranch.name}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${STATUS[t.status].tone}`}>{STATUS[t.status].label}</span>
                </div>
                <div className="flex gap-1.5">
                  {t.status === 'ENVIADA' && (
                    <>
                      <button type="button" disabled={busyId === t.id} onClick={() => act(t, 'receive')} className="flex cursor-pointer items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
                        <PackageCheck className="h-3.5 w-3.5" /> Recibir
                      </button>
                      <button type="button" disabled={busyId === t.id} onClick={() => act(t, 'void')} className="flex cursor-pointer items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold text-rose-500 hover:bg-rose-50 disabled:opacity-50 dark:hover:bg-rose-950/30">
                        <Ban className="h-3.5 w-3.5" /> Anular
                      </button>
                    </>
                  )}
                  {t.status === 'RECIBIDA' && <span className="flex items-center gap-1 text-[11px] text-emerald-600"><CheckCircle2 className="h-3.5 w-3.5" /> {t.receivedByName}, {day(t.receivedAt)}</span>}
                </div>
              </div>
              <ul className="grid gap-1 text-xs text-slate-600 dark:text-slate-300 sm:grid-cols-2">
                {t.lines.map(l => (
                  <li key={l.id} className="flex justify-between gap-2 border-b border-slate-50 py-1 dark:border-slate-800">
                    <span>{l.productName}{l.lots?.length ? <span className="text-slate-400"> · lote {l.lots.map(x => x.batchNumber).join(', ')}</span> : null}</span>
                    <span className="font-mono">{l.quantity}</span>
                  </li>
                ))}
              </ul>
              <p className="text-[11px] text-slate-400">Creada por {t.createdByName}, {day(t.createdAt)}{t.note ? ` · ${t.note}` : ''}</p>
            </div>
          ))}
        </div>
      )}

      <Modal isOpen={!!form} onClose={() => !saving && setForm(null)} title="Nueva transferencia" maxWidth="2xl">
        {form && (
          <form onSubmit={save} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label htmlFor="tr-from" className={labelClass}>Sale de *</label>
                <SmartSelect id="tr-from" value={form.fromBranchId} onChange={e => changeFrom(e.target.value)} className={inputClass}>
                  {branchOptions.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </SmartSelect>
              </div>
              <div className="space-y-1.5">
                <label htmlFor="tr-to" className={labelClass}>Llega a *</label>
                <SmartSelect id="tr-to" value={form.toBranchId} onChange={e => setForm(f => ({ ...f, toBranchId: e.target.value }))} className={inputClass}>
                  {branchOptions.filter(b => b.id !== form.fromBranchId).map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </SmartSelect>
              </div>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="tr-search" className={labelClass}>Agregar producto (stock de la sucursal de origen)</label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
                <input id="tr-search" autoComplete="off" placeholder="Nombre o código (mínimo 2 letras)" value={search} onChange={e => setSearch(e.target.value)} className={`${inputClass} pl-9`} />
              </div>
              {found.length > 0 && (
                <ul className="max-h-48 overflow-y-auto rounded-lg border border-slate-200 text-xs dark:border-slate-700">
                  {found.map(p => (
                    <li key={p.id}>
                      <button type="button" onClick={() => addLine(p)} className="flex w-full cursor-pointer items-center justify-between px-3 py-2 text-left hover:bg-slate-50 dark:hover:bg-slate-800">
                        <span>{p.name} <span className="text-slate-400">({p.code})</span></span>
                        <span className="font-mono text-slate-500">{p.stock} {p.unit}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {form.lines.length > 0 && (
              <table className="w-full text-left text-xs">
                <thead className="uppercase text-slate-400">
                  <tr><th className="py-1">Producto</th><th className="py-1 text-right">Disponible</th><th className="py-1 text-right">Cantidad</th><th /></tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {form.lines.map(l => (
                    <tr key={l.productId}>
                      <td className="py-1.5">{l.name}</td>
                      <td className="py-1.5 text-right font-mono text-slate-500">{l.stock}</td>
                      <td className="py-1.5 text-right">
                        <input type="number" min={l.unit === 'UND' ? '1' : '0.01'} step={l.unit === 'UND' ? '1' : '0.01'} max={l.stock} value={l.quantity} onChange={e => setQty(l.productId, e.target.value)} aria-label={`Cantidad de ${l.name}`} className="w-24 rounded-lg border border-slate-200 bg-transparent px-2 py-1 text-right text-xs outline-none dark:border-slate-700" />
                      </td>
                      <td className="py-1.5 text-right">
                        <button type="button" onClick={() => removeLine(l.productId)} aria-label={`Quitar ${l.name}`} className="cursor-pointer p-1 text-slate-400 hover:text-rose-500"><X className="h-4 w-4" /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            <div className="space-y-1.5">
              <label htmlFor="tr-note" className={labelClass}>Nota</label>
              <input id="tr-note" maxLength={300} placeholder="Opcional: quién la lleva, motivo..." value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} className={inputClass} />
            </div>
            {formError && <p className="text-xs text-rose-500">{formError}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setForm(null)} className="cursor-pointer rounded-lg border border-slate-200 px-3 py-1.5 text-xs dark:border-slate-700">Cancelar</button>
              <button type="submit" disabled={saving || !form.lines.length} className="cursor-pointer rounded-lg bg-indigo-600 px-4 py-1.5 text-xs text-white disabled:opacity-50">{saving ? 'Enviando...' : 'Enviar mercancía'}</button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
