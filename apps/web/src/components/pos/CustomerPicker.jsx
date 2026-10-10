import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ChevronDown, Search, UserPlus } from 'lucide-react';
import { api } from '../../services/api';

/**
 * Selector de cliente con búsqueda en el servidor (no depende de tener todos los clientes cargados).
 * El menú se despliega desde su botón (origen del escalado = botón) y se cierra con Escape o clic fuera.
 */
export default function CustomerPicker({ customer, onSelect, onCreate }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const rootRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = event => {
      if (rootRef.current && !rootRef.current.contains(event.target)) setOpen(false);
    };
    const onKeyDown = event => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        setLoading(true);
        const list = await api.customers.list({ q: query.trim() || undefined, limit: 8 });
        if (!cancelled) setResults(list);
      } catch {
        if (!cancelled) setResults([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, query ? 200 : 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [open, query]);

  const toggle = () => {
    setOpen(prev => !prev);
    setQuery('');
    setTimeout(() => inputRef.current?.focus(), 30);
  };

  const initial = (customer?.name || '?').trim().charAt(0).toUpperCase();

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={toggle}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex w-full items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-left hover:border-slate-300 dark:border-slate-700 dark:bg-slate-900 [@media(pointer:coarse)]:py-2.5 cursor-pointer"
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-sm font-semibold text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
          {initial}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-slate-800 dark:text-slate-100">
            {customer?.name || 'Seleccionar cliente'}
          </span>
          {customer?.documentId && (
            <span className="block truncate font-mono text-[11px] text-slate-500 dark:text-slate-400">{customer.documentId}</span>
          )}
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.97, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, transition: { duration: 0.12 } }}
            transition={{ duration: 0.16, ease: [0.23, 1, 0.32, 1] }}
            style={{ transformOrigin: 'top left' }}
            className="absolute inset-x-0 top-full z-20 mt-1.5 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_12px_32px_-8px_rgba(15,23,42,0.25)] dark:border-slate-700 dark:bg-slate-900"
          >
            <div className="relative border-b border-slate-100 dark:border-slate-800">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                ref={inputRef}
                type="search"
                name="customer-search"
                autoComplete="off"
                placeholder="Buscar por nombre, cédula o RNC…"
                aria-label="Buscar cliente"
                value={query}
                onChange={e => setQuery(e.target.value)}
                className="h-11 w-full bg-transparent pl-9 pr-3 text-sm text-slate-800 outline-none placeholder:text-slate-400 dark:text-slate-100 [&::-webkit-search-cancel-button]:hidden"
              />
            </div>

            <ul role="listbox" aria-label="Clientes" className="max-h-60 overflow-y-auto overscroll-contain py-1">
              {results.map(c => (
                <li key={c.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={c.id === customer?.id}
                    onClick={() => {
                      onSelect(c);
                      setOpen(false);
                    }}
                    className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer ${
                      c.id === customer?.id ? 'bg-indigo-50/60 dark:bg-indigo-950/30' : ''
                    }`}
                  >
                    <span className="truncate text-sm text-slate-800 dark:text-slate-100">{c.name}</span>
                    <span className="shrink-0 font-mono text-[11px] text-slate-500 dark:text-slate-400">{c.documentId}</span>
                  </button>
                </li>
              ))}
              {!loading && results.length === 0 && (
                <li className="px-3 py-4 text-center text-sm text-slate-500 dark:text-slate-400">No hay clientes con ese dato.</li>
              )}
            </ul>

            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onCreate();
              }}
              className="flex w-full items-center gap-2 border-t border-slate-100 px-3 py-2.5 text-sm font-medium text-indigo-600 hover:bg-indigo-50/60 dark:border-slate-800 dark:text-indigo-400 dark:hover:bg-indigo-950/30 cursor-pointer"
            >
              <UserPlus className="h-4 w-4" /> Registrar cliente nuevo
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
