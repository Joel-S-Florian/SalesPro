import React, { Children, isValidElement, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, Loader2, Search } from 'lucide-react';

/** Cuántas opciones se muestran al abrir y cuántas más se cargan al llegar al final de la lista. */
const PAGE_SIZE = 8;
/** La barra de búsqueda aparece cuando hay más opciones que esto (o si la búsqueda es del servidor). */
const SEARCH_THRESHOLD = 7;
const MENU_MAX_HEIGHT = 320;

const normalize = text =>
  String(text ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

function textOf(node) {
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join('');
  if (isValidElement(node)) return textOf(node.props.children);
  return '';
}

/** Convierte <option>/<optgroup> hijos en una lista de opciones (así se reemplaza un <select> cambiando solo la etiqueta). */
function collectOptions(children) {
  const out = [];
  Children.forEach(children, child => {
    if (!isValidElement(child)) return;
    if (child.type === 'option') {
      const label = textOf(child.props.children);
      out.push({
        value: child.props.value !== undefined ? String(child.props.value) : label,
        label,
        hint: child.props.title || '',
        disabled: Boolean(child.props.disabled),
      });
    } else if (child.type === 'optgroup' || child.type === React.Fragment) {
      out.push(...collectOptions(child.props.children));
    }
  });
  return out;
}

/**
 * Selector con búsqueda que reemplaza al <select> nativo.
 * - Se ve como un select (borde, flecha) y abre un menú propio con barra de búsqueda (si hay más de 7 opciones).
 * - Muestra solo las primeras 8 opciones; el resto aparece al desplazarse hasta el final o al buscar.
 * - Se cierra al elegir, con Escape o al hacer clic fuera. Teclado: flechas, Enter, Inicio/Fin.
 * - Es un reemplazo directo: acepta <option> como hijos y llama `onChange({ target: { value, name, id } })`.
 *   Para listas largas del servidor: pase `onSearch(texto)` (con debounce), `loading` y las `options` resultantes.
 */
export default function SmartSelect({
  id,
  name,
  value = '',
  onChange,
  children,
  options: optionsProp,
  placeholder = 'Seleccionar…',
  searchPlaceholder = 'Buscar…',
  selectedLabel,
  onSearch,
  loading = false,
  disabled = false,
  required = false,
  className = '',
  menuClassName = '',
  'aria-label': ariaLabel,
  ...rest
}) {
  const autoId = useId();
  const baseId = id || autoId;
  const options = useMemo(() => optionsProp || collectOptions(children), [optionsProp, children]);
  const stringValue = value === null || value === undefined ? '' : String(value);
  const selected = options.find(option => option.value === stringValue);
  const serverSearch = typeof onSearch === 'function';
  const searchable = serverSearch || options.length > SEARCH_THRESHOLD;
  const searchableRef = useRef(searchable);
  searchableRef.current = searchable;

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [active, setActive] = useState(0);
  const [position, setPosition] = useState(null);
  const triggerRef = useRef(null);
  const menuRef = useRef(null);
  const listRef = useRef(null);
  const searchRef = useRef(null);

  const filtered = useMemo(() => {
    if (serverSearch || !query.trim()) return options;
    const needle = normalize(query.trim());
    return options.filter(option => normalize(option.label).includes(needle) || normalize(option.hint).includes(needle));
  }, [options, query, serverSearch]);
  const visible = filtered.slice(0, limit);

  const close = useCallback((restoreFocus = true) => {
    setOpen(false);
    setQuery('');
    setLimit(PAGE_SIZE);
    if (restoreFocus) triggerRef.current?.focus();
  }, []);

  const place = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const minWidth = searchableRef.current ? 240 : 140; // con búsqueda necesita espacio para leer nombres largos
    const below = window.innerHeight - rect.bottom - 8;
    const above = rect.top - 8;
    const openUp = below < 220 && above > below;
    const maxHeight = Math.max(160, Math.min(MENU_MAX_HEIGHT, openUp ? above : below));
    setPosition({
      left: Math.max(8, Math.min(rect.left, window.innerWidth - Math.max(rect.width, minWidth) - 8)),
      width: Math.max(rect.width, minWidth),
      maxHeight,
      ...(openUp ? { bottom: window.innerHeight - rect.top + 4 } : { top: rect.bottom + 4 }),
    });
  }, []);

  useLayoutEffect(() => {
    if (open) place();
  }, [open, place]);

  // Reposiciona si cambia el tamaño o se desplaza algo detrás; cierra con un clic fuera
  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = event => {
      if (menuRef.current?.contains(event.target) || triggerRef.current?.contains(event.target)) return;
      close(false);
    };
    const onScroll = event => {
      if (menuRef.current?.contains(event.target)) return;
      place();
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [open, close, place]);

  // Al abrir: foco en la búsqueda (o en la lista) y la opción elegida como activa
  useEffect(() => {
    if (!open) return;
    const index = Math.max(0, options.findIndex(option => option.value === stringValue));
    setActive(index < PAGE_SIZE ? index : 0);
    const timer = setTimeout(() => (searchRef.current || listRef.current)?.focus(), 0);
    return () => clearTimeout(timer);
    // solo al abrir
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Búsqueda del servidor con espera de 250 ms
  useEffect(() => {
    if (!open || !serverSearch) return undefined;
    const timer = setTimeout(() => onSearch(query.trim()), query ? 250 : 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, open, serverSearch]);

  useEffect(() => {
    setLimit(PAGE_SIZE);
    setActive(0);
  }, [query]);

  // Mantiene visible la opción activa
  useEffect(() => {
    if (!open) return;
    listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active, open, limit]);

  const choose = option => {
    if (!option || option.disabled) return;
    onChange?.({ target: { value: option.value, name, id: baseId } });
    close();
  };

  const onListScroll = event => {
    const el = event.currentTarget;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 24 && limit < filtered.length) setLimit(current => current + PAGE_SIZE);
  };

  const onMenuKeyDown = event => {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        setActive(current => {
          const next = Math.min(current + 1, filtered.length - 1);
          if (next >= limit) setLimit(next + 1);
          return Math.max(0, next);
        });
        break;
      case 'ArrowUp':
        event.preventDefault();
        setActive(current => Math.max(current - 1, 0));
        break;
      case 'Home':
        if (!searchable) {
          event.preventDefault();
          setActive(0);
        }
        break;
      case 'End':
        if (!searchable) {
          event.preventDefault();
          setLimit(filtered.length);
          setActive(Math.max(0, filtered.length - 1));
        }
        break;
      case 'Enter':
        event.preventDefault();
        choose(filtered[active]);
        break;
      case 'Escape':
        event.preventDefault();
        event.stopPropagation(); // no cierra además el modal que lo contiene
        close();
        break;
      case 'Tab':
        close(false);
        break;
      default:
    }
  };

  const onTriggerKeyDown = event => {
    if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) {
      event.preventDefault();
      if (!disabled) setOpen(true);
    }
  };

  const label = selected ? selected.label : selectedLabel || '';
  const isPlaceholder = !selected ? !selectedLabel : stringValue === '';
  const listId = `${baseId}-list`;

  return (
    <>
      <button
        {...rest}
        ref={triggerRef}
        id={baseId}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={ariaLabel}
        aria-required={required || undefined}
        disabled={disabled}
        onClick={() => !disabled && (open ? close() : setOpen(true))}
        onKeyDown={onTriggerKeyDown}
        className={`${className} flex items-center justify-between gap-2 text-left disabled:cursor-not-allowed disabled:opacity-60`}
      >
        <span className={`min-w-0 flex-1 truncate ${isPlaceholder ? 'text-slate-400 dark:text-slate-500' : ''}`}>{label || placeholder}</span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition-transform duration-150 ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>
      {/* Mantiene la validación nativa de «obligatorio» del formulario */}
      {required && (
        <input tabIndex={-1} aria-hidden="true" required value={stringValue} onChange={() => {}} className="pointer-events-none absolute h-0 w-0 opacity-0" />
      )}

      {open &&
        position &&
        createPortal(
          <div
            ref={menuRef}
            style={{ position: 'fixed', zIndex: 80, ...position }}
            className={`flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900 ${menuClassName}`}
            onKeyDown={onMenuKeyDown}
          >
            {searchable && (
              <div className="relative border-b border-slate-100 p-2 dark:border-slate-800">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                <input
                  ref={searchRef}
                  type="text"
                  role="searchbox"
                  autoComplete="off"
                  spellCheck={false}
                  aria-label="Buscar en la lista"
                  aria-controls={listId}
                  placeholder={searchPlaceholder}
                  value={query}
                  onChange={event => setQuery(event.target.value)}
                  className="h-8 w-full rounded-lg border border-slate-200 bg-transparent pl-8 pr-8 text-xs text-slate-800 outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 dark:border-slate-700 dark:text-slate-100"
                />
                {loading && <Loader2 className="absolute right-4 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-slate-400" aria-hidden="true" />}
              </div>
            )}
            <ul
              ref={listRef}
              id={listId}
              role="listbox"
              tabIndex={-1}
              aria-label={ariaLabel}
              onScroll={onListScroll}
              className="min-h-0 flex-1 overflow-y-auto overscroll-contain py-1 outline-none"
            >
              {visible.map((option, index) => {
                const isSelected = option.value === stringValue;
                return (
                  <li
                    key={`${option.value}-${index}`}
                    role="option"
                    data-index={index}
                    aria-selected={isSelected}
                    aria-disabled={option.disabled || undefined}
                    onPointerDown={event => event.preventDefault()}
                    onClick={() => choose(option)}
                    onMouseMove={() => active !== index && setActive(index)}
                    className={`flex cursor-pointer items-center gap-2 px-3 py-2 text-xs ${
                      index === active ? 'bg-indigo-50 dark:bg-indigo-950/40' : ''
                    } ${option.disabled ? 'cursor-not-allowed opacity-50' : ''} ${isSelected ? 'font-semibold text-indigo-700 dark:text-indigo-300' : 'text-slate-700 dark:text-slate-200'}`}
                  >
                    <span className="min-w-0 flex-1 truncate">{option.label || <span className="text-slate-400">—</span>}</span>
                    {isSelected && <Check className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
                  </li>
                );
              })}
              {filtered.length === 0 && (
                <li className="px-3 py-4 text-center text-xs text-slate-400" role="presentation">
                  {loading ? 'Buscando…' : 'Sin resultados'}
                </li>
              )}
              {filtered.length > visible.length && (
                <li className="px-3 py-2 text-center text-[11px] text-slate-400" role="presentation">
                  Mostrando {visible.length} de {filtered.length}. Desplázate o escribe para buscar.
                </li>
              )}
            </ul>
          </div>,
          document.body
        )}
    </>
  );
}
