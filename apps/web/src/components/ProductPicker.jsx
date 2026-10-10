import React, { useEffect, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { api } from '../services/api';

const inputClass =
  'w-full px-3.5 py-2 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-800 dark:text-slate-100 bg-transparent focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-xs';

/**
 * Selector de producto con búsqueda en el servidor (no depende de tener todo el catálogo cargado).
 * `onChange(id, product)` entrega el id y el producto elegido; si no hay selección, toma el primer resultado.
 */
export default function ProductPicker({ id, value, onChange, label = 'Producto' }) {
  const [query, setQuery] = useState('');
  const [options, setOptions] = useState([]);
  const [loading, setLoading] = useState(false);
  const valueRef = useRef(value);
  valueRef.current = value;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        setLoading(true);
        const result = await api.products.page({ q: query.trim() || undefined, active: true, limit: 25 });
        if (cancelled) return;
        const list = result?.data || [];
        setOptions(list);
        // Sin selección previa (o la selección ya no está en la lista y no se está buscando): usa el primero
        if (!valueRef.current && list.length > 0) onChangeRef.current(list[0].id, list[0]);
      } catch {
        if (!cancelled) setOptions([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, query ? 250 : 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
        <input
          type="search"
          autoComplete="off"
          aria-label={`Buscar ${label.toLowerCase()}`}
          placeholder="Buscar por nombre o código…"
          value={query}
          onChange={e => setQuery(e.target.value)}
          className={`${inputClass} pl-9 [&::-webkit-search-cancel-button]:hidden`}
        />
      </div>
      <select
        id={id}
        value={value}
        onChange={e => onChange(e.target.value, options.find(o => o.id === e.target.value))}
        className={inputClass}
        aria-busy={loading}
      >
        {options.length === 0 && <option value="">{loading ? 'Buscando…' : 'Sin resultados'}</option>}
        {options.map(p => (
          <option key={p.id} value={p.id} className="dark:bg-slate-950">
            {p.name} (Stock: {p.stock})
          </option>
        ))}
      </select>
    </div>
  );
}
