import React, { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../services/api';
import { formatQty } from '../utils/units';
import SmartSelect from './ui/SmartSelect';

const inputClass =
  'w-full px-3.5 py-2 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-800 dark:text-slate-100 bg-transparent focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-xs';

/**
 * Selector de producto con búsqueda en el servidor (no depende de tener todo el catálogo cargado): un solo
 * desplegable con barra de búsqueda y los 25 resultados más recientes.
 * `onChange(id, product)` entrega el id y el producto elegido; si no hay selección previa, toma el primer resultado.
 * `pinned`: producto preseleccionado desde fuera, que aparece aunque no esté en los resultados.
 */
export default function ProductPicker({ id, value, onChange, label = 'Producto', pinned = null }) {
  const [options, setOptions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [chosen, setChosen] = useState(null); // lo elegido se conserva aunque una búsqueda posterior no lo incluya
  const valueRef = useRef(value);
  valueRef.current = value;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const requestRef = useRef(0);

  const search = useCallback(async query => {
    const request = ++requestRef.current;
    try {
      setLoading(true);
      const result = await api.products.page({ q: query || undefined, active: true, limit: 25 });
      if (request !== requestRef.current) return;
      const list = result?.data || [];
      setOptions(list);
      // Sin selección previa: usa el primero
      if (!valueRef.current && !query && list.length > 0) {
        setChosen(list[0]);
        onChangeRef.current(list[0].id, list[0]);
      }
    } catch {
      if (request === requestRef.current) setOptions([]);
    } finally {
      if (request === requestRef.current) setLoading(false);
    }
  }, []);

  // Carga inicial (también deja un producto elegido si el formulario lo necesita)
  useEffect(() => {
    search('');
  }, [search]);

  const extras = [pinned, chosen].filter((p, i, all) => p && all.findIndex(q => q?.id === p.id) === i && !options.some(o => o.id === p.id));
  const shown = [...extras, ...options];
  const selectOptions = shown.map(p => ({ value: p.id, label: `${p.name} (Stock: ${formatQty(p.stock, p.unit)})`, hint: p.code }));
  const known = shown.find(p => p.id === value);

  return (
    <SmartSelect
      id={id}
      value={value}
      options={selectOptions}
      selectedLabel={known ? `${known.name} (Stock: ${formatQty(known.stock, known.unit)})` : undefined}
      onSearch={search}
      loading={loading}
      placeholder={loading ? 'Buscando…' : 'Seleccione un producto…'}
      searchPlaceholder="Buscar por nombre o código…"
      aria-label={label}
      onChange={e => {
        const product = shown.find(p => p.id === e.target.value);
        setChosen(product || null);
        onChange(e.target.value, product);
      }}
      className={inputClass}
    />
  );
}
