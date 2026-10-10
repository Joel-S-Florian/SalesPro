import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const SIZE_KEY = 'factos-page-size';
const DEFAULT_SIZE = 10;

function readSize() {
  try {
    const stored = Number(localStorage.getItem(SIZE_KEY));
    return [10, 20, 50].includes(stored) ? stored : DEFAULT_SIZE;
  } catch {
    return DEFAULT_SIZE;
  }
}

export function useStoredPageSize() {
  const [pageSize, setSize] = useState(readSize);
  const setPageSize = useCallback(size => {
    setSize(size);
    try {
      localStorage.setItem(SIZE_KEY, String(size));
    } catch {
      // almacenamiento no disponible
    }
  }, []);
  return [pageSize, setPageSize];
}

function useDebounced(value, delay) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

/**
 * Lista paginada en el servidor, igual en todos los módulos.
 *
 * @param fetcher  ({ ...filters, page, limit }) => Promise<{ data, pagination: { total } }>
 * @param filters  objeto con filtros y búsqueda (`q`); la búsqueda se retrasa 300 ms y cualquier cambio vuelve a la página 1
 * @returns rows, total, page, pageSize, loading, error, setPage, setPageSize, reload
 */
export function usePagedList(fetcher, filters = {}) {
  const [pageSize, setPageSize] = useStoredPageSize();
  const [page, setPage] = useState(1);
  const [state, setState] = useState({ rows: [], total: 0, loading: true, error: '' });

  // Los filtros se comparan por contenido; el texto de búsqueda se retrasa
  const filtersKey = JSON.stringify(filters);
  const debouncedKey = useDebounced(filtersKey, 300);
  const stableFilters = useMemo(() => JSON.parse(debouncedKey), [debouncedKey]);

  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const requestId = useRef(0);

  // Un filtro o tamaño nuevo regresa a la primera página
  const previousKey = useRef(debouncedKey);
  const previousSize = useRef(pageSize);
  useEffect(() => {
    if (previousKey.current !== debouncedKey || previousSize.current !== pageSize) {
      previousKey.current = debouncedKey;
      previousSize.current = pageSize;
      setPage(1);
    }
  }, [debouncedKey, pageSize]);

  const load = useCallback(
    async ({ silent = false } = {}) => {
      const id = ++requestId.current;
      if (!silent) setState(prev => ({ ...prev, loading: true, error: '' }));
      try {
        const result = await fetcherRef.current({ ...stableFilters, page, limit: pageSize });
        if (id !== requestId.current) return;
        const rows = Array.isArray(result) ? result : result?.data || [];
        const total = result?.pagination?.total ?? rows.length;
        // Se eliminó el último elemento de la última página: retrocede
        if (rows.length === 0 && page > 1 && total > 0) {
          setPage(Math.max(1, Math.ceil(total / pageSize)));
          return;
        }
        setState({ rows, total, loading: false, error: '' });
      } catch (err) {
        if (id === requestId.current) {
          setState(prev => ({ ...prev, loading: false, error: err.message || 'No se pudieron cargar los datos' }));
        }
      }
    },
    [stableFilters, page, pageSize]
  );

  useEffect(() => {
    load();
  }, [load]);

  return {
    rows: state.rows,
    total: state.total,
    loading: state.loading,
    error: state.error,
    page,
    pageSize,
    setPage,
    setPageSize,
    reload: () => load({ silent: true }),
  };
}

/** Paginación en el navegador para listas pequeñas que ya llegan completas. */
export function useClientPage(items) {
  const [pageSize, setPageSize] = useStoredPageSize();
  const [page, setPage] = useState(1);

  const total = items.length;
  const lastPage = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, lastPage);

  const rows = useMemo(
    () => items.slice((safePage - 1) * pageSize, safePage * pageSize),
    [items, safePage, pageSize]
  );

  return {
    rows,
    total,
    page: safePage,
    pageSize,
    setPage,
    setPageSize: size => {
      setPageSize(size);
      setPage(1);
    },
  };
}
