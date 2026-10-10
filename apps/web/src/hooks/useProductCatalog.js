import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../services/api';

const PAGE_SIZE = 48;

function useDebounced(value, delay) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

/**
 * Catálogo del POS con búsqueda y filtro por categoría en el servidor, paginado.
 * (El API devuelve como máximo 100 por página: no se carga todo el inventario en el navegador.)
 */
export function useProductCatalog() {
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [products, setProducts] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, hasNext: false, total: 0 });
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');

  const debouncedSearch = useDebounced(search.trim(), 250);
  const requestId = useRef(0);

  const fetchPage = useCallback(
    async (page, { replace, silent = false }) => {
      const id = ++requestId.current;
      try {
        if (!silent) (replace ? setLoading : setLoadingMore)(true);
        setError('');
        const result = await api.products.page({
          q: debouncedSearch || undefined,
          categoryId: categoryId || undefined,
          active: true,
          page,
          limit: PAGE_SIZE,
        });
        if (id !== requestId.current) return; // llegó una respuesta más nueva
        const list = result?.data || [];
        setProducts(prev => (replace ? list : [...prev, ...list]));
        setPagination({
          page,
          hasNext: !!result?.pagination?.hasNext,
          total: result?.pagination?.total ?? list.length,
        });
      } catch (err) {
        if (id === requestId.current) setError(err.message || 'No se pudieron cargar los productos');
      } finally {
        if (id === requestId.current) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [debouncedSearch, categoryId]
  );

  useEffect(() => {
    fetchPage(1, { replace: true });
  }, [fetchPage]);

  const loadMore = () => {
    if (pagination.hasNext && !loadingMore) fetchPage(pagination.page + 1, { replace: false });
  };

  /** Refresca la primera página sin mostrar el estado de carga (por ejemplo, tras una venta). */
  const refresh = () => fetchPage(1, { replace: true, silent: true });

  /** Descuenta localmente lo vendido para que las existencias se vean al instante. */
  const applySale = soldItems => {
    const sold = Object.fromEntries(soldItems.map(item => [item.product.id, item.quantity]));
    setProducts(prev => prev.map(p => (sold[p.id] ? { ...p, stock: Math.max(0, p.stock - sold[p.id]) } : p)));
  };

  /** Busca un producto por código exacto: primero en lo cargado, luego en el servidor. */
  const findByCode = async rawCode => {
    const code = rawCode.trim().toLowerCase();
    if (!code) return null;
    const local = products.find(p => (p.code || '').toLowerCase() === code);
    if (local) return local;
    try {
      const result = await api.products.page({ q: rawCode.trim(), active: true, limit: 10 });
      return (result?.data || []).find(p => (p.code || '').toLowerCase() === code) || null;
    } catch {
      return null;
    }
  };

  return {
    search,
    setSearch,
    categoryId,
    setCategoryId,
    products,
    total: pagination.total,
    hasNext: pagination.hasNext,
    loading,
    loadingMore,
    error,
    loadMore,
    refresh,
    applySale,
    findByCode,
    isFiltering: !!(debouncedSearch || categoryId),
  };
}
