import React, { forwardRef } from 'react';
import { Camera, FileUp, Loader2, PackagePlus, Plug, Search, SearchX, X } from 'lucide-react';
import ProductCard from './ProductCard';
import { Skeleton } from '../Skeleton';

const GRID = 'grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(10.5rem,1fr))]';

const iconButton =
  'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:text-indigo-600 dark:border-slate-700 dark:bg-slate-900 [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11 cursor-pointer';

/**
 * Columna del catálogo: búsqueda (con lectura de códigos), filtro por categoría y cuadrícula de productos.
 */
const ProductCatalog = forwardRef(function ProductCatalog(
  { catalog, categories, quantities, shakeId, onAdd, onSubmitSearch, onOpenCamera, serialScanner, large, onNavigate },
  searchRef
) {
  const { search, setSearch, categoryId, setCategoryId, products, loading, loadingMore, hasNext, error, total } = catalog;

  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col gap-3" aria-label="Catálogo de productos">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            ref={searchRef}
            type="search"
            name="product-search"
            autoComplete="off"
            spellCheck={false}
            data-scan-target
            placeholder="Buscar o escanear…"
            aria-label="Buscar producto por nombre o código"
            value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                e.preventDefault();
                onSubmitSearch(search);
              } else if (e.key === 'Escape' && search) {
                setSearch('');
              }
            }}
            className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-16 text-sm text-slate-800 outline-none placeholder:text-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 [@media(pointer:coarse)]:h-11 [&::-webkit-search-cancel-button]:hidden"
          />
          {search ? (
            <button
              type="button"
              onClick={() => {
                setSearch('');
                searchRef?.current?.focus();
              }}
              aria-label="Limpiar búsqueda"
              className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          ) : (
            <kbd className="pointer-events-none absolute right-2.5 top-1/2 hidden -translate-y-1/2 rounded border border-slate-200 px-1.5 py-0.5 font-sans text-[11px] text-slate-500 dark:border-slate-700 dark:text-slate-400 lg:block">
              /
            </kbd>
          )}
        </div>

        <button type="button" onClick={onOpenCamera} aria-label="Escanear con la cámara" title="Escanear con la cámara" className={iconButton}>
          <Camera className="h-4 w-4" />
        </button>
        {serialScanner.supported && (
          <button
            type="button"
            onClick={serialScanner.connected ? serialScanner.disconnect : serialScanner.connect}
            aria-pressed={serialScanner.connected}
            aria-label={serialScanner.connected ? 'Desconectar lector serial' : 'Conectar lector por puerto serie (COM)'}
            title={serialScanner.connected ? 'Lector serial conectado' : serialScanner.error || 'Conectar lector por puerto serie'}
            className={`${iconButton} ${serialScanner.connected ? '!border-emerald-500 !text-emerald-600' : ''}`}
          >
            <Plug className="h-4 w-4" />
          </button>
        )}
      </div>

      {categories.length > 0 && (
        <div
          className="-mx-1 flex snap-x gap-2 overflow-x-auto px-1 pb-1 [mask-image:linear-gradient(to_right,black_calc(100%-2rem),transparent)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          role="group"
          aria-label="Filtrar por categoría"
        >
          {[{ id: '', name: 'Todos' }, ...categories].map(category => {
            const active = categoryId === category.id;
            return (
              <button
                key={category.id || 'all'}
                type="button"
                onClick={() => setCategoryId(category.id)}
                aria-pressed={active}
                className={`h-8 shrink-0 snap-start rounded-full border px-3.5 text-[13px] font-medium cursor-pointer [@media(pointer:coarse)]:h-10 ${
                  active
                    ? 'border-indigo-600 bg-indigo-600 text-white'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300'
                }`}
              >
                {category.name}
              </button>
            );
          })}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-1 pb-24 pt-2 lg:pb-2">
        {error && (
          <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300">
            {error}
          </p>
        )}

        {loading ? (
          <div className={GRID} aria-hidden="true">
            {Array.from({ length: 12 }, (_, i) => (
              <Skeleton key={i} className="h-[7.5rem] rounded-xl" />
            ))}
          </div>
        ) : products.length === 0 && !error && !catalog.isFiltering && onNavigate ? (
          <div className="flex h-full min-h-64 flex-col items-center justify-center gap-4 text-center">
            <PackagePlus className="h-10 w-10 text-indigo-300 dark:text-indigo-700" strokeWidth={1.5} />
            <div>
              <p className="text-base font-semibold text-slate-800 dark:text-slate-100">Aún no tienes productos</p>
              <p className="mx-auto mt-1 max-w-xs text-sm text-slate-500 dark:text-slate-400">
                Agrega tu primer producto o importa tu lista completa para empezar a vender.
              </p>
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              <button
                type="button"
                onClick={() => onNavigate('PRODUCTS')}
                className="inline-flex h-10 items-center gap-2 rounded-lg bg-indigo-600 px-4 text-sm font-semibold text-white hover:bg-indigo-700 cursor-pointer"
              >
                <PackagePlus className="h-4 w-4" /> Crear producto
              </button>
              <button
                type="button"
                onClick={() => onNavigate('IMPORT_INVENTORY')}
                className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 cursor-pointer"
              >
                <FileUp className="h-4 w-4" /> Importar inventario
              </button>
            </div>
          </div>
        ) : products.length === 0 && !error ? (
          <div className="flex h-full min-h-48 flex-col items-center justify-center gap-2 text-center">
            <SearchX className="h-9 w-9 text-slate-300 dark:text-slate-600" strokeWidth={1.5} />
            <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
              {search ? `Nada coincide con “${search}”` : 'No hay productos en esta categoría'}
            </p>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {search ? 'Pruebe con otro nombre o escanee el código de barras.' : 'Elija otra categoría o agregue productos al inventario.'}
            </p>
          </div>
        ) : (
          <>
            <div className={GRID}>
              {products.map(product => (
                <ProductCard
                  key={product.id}
                  product={product}
                  inCart={quantities[product.id] || 0}
                  shake={shakeId === product.id}
                  onAdd={onAdd}
                  large={large}
                />
              ))}
            </div>
            <div className="flex items-center justify-center gap-3 py-4 text-sm text-slate-500 dark:text-slate-400">
              <span>
                {products.length} de {total} productos
              </span>
              {hasNext && (
                <button
                  type="button"
                  onClick={catalog.loadMore}
                  disabled={loadingMore}
                  className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 cursor-pointer"
                >
                  {loadingMore && <Loader2 className="h-4 w-4 animate-spin" />}
                  Cargar más
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </section>
  );
});

export default ProductCatalog;
