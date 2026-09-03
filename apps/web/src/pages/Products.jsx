import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import { Loader2, Plus, Search, Edit2, Trash2, Filter, AlertTriangle } from 'lucide-react';
import Modal from '../components/Modal';

export default function Products() {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Search & Filters
  const [search, setSearch] = useState('');
  const [selectedCatId, setSelectedCatId] = useState('ALL');
  const [selectedStockStatus, setSelectedStockStatus] = useState('ALL');

  // Form states
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [costPrice, setCostPrice] = useState(0);
  const [salePrice, setSalePrice] = useState(0);
  const [stock, setStock] = useState(0);
  const [minStock, setMinStock] = useState(5);
  const [active, setActive] = useState(true);

  const [saving, setSaving] = useState(false);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const [pList, cList] = await Promise.all([
        api.products.list(),
        api.categories.list()
      ]);
      console.log('Productos recibidos:', pList); // DEBUG
      console.log('Categorías recibidas:', cList); // DEBUG
      setProducts(Array.isArray(pList) ? pList : []);
      setCategories(Array.isArray(cList) ? cList : []);
    } catch (err) {
      console.error('Error cargando datos:', err); // DEBUG
      setError(err.message || 'Error al cargar productos');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const openCreateModal = () => {
    setEditingId(null);
    setCode(`PROD-${Math.floor(100 + Math.random() * 900)}`);
    setName('');
    setDescription('');
    setCategoryId(categories[0]?.id || '');
    setCostPrice(0);
    setSalePrice(0);
    setStock(0);
    setMinStock(5);
    setActive(true);
    setIsFormOpen(true);
  };

  const openEditModal = (p) => {
    setEditingId(p.id);
    setCode(p.code || '');
    setName(p.name || '');
    setDescription(p.description || '');
    setCategoryId(p.categoryId || categories[0]?.id || '');
    setCostPrice(Number(p.costPrice || 0));
    setSalePrice(Number(p.salePrice || 0));
    setStock(Number(p.stock || 0));
    setMinStock(Number(p.minStock || 5));
    setActive(p.active !== false);
    setIsFormOpen(true);
  };

  const categoryChanged = editingId && categories.length > 0
    ? (() => {
        const current = products.find(p => p.id === editingId);
        return current && current.categoryId !== categoryId;
      })()
    : false;

  const handleSaveProduct = async (e) => {
    e.preventDefault();
    if (!name || !categoryId || costPrice < 0 || salePrice < 0 || (!editingId && stock < 0)) {
      alert('Por favor llene todos los campos obligatorios correctamente');
      return;
    }
    if (!editingId && !code) {
      alert('El código del producto es obligatorio');
      return;
    }

    try {
      setSaving(true);
      const payload = editingId
        ? {
            name,
            description,
            categoryId,
            costPrice: Number(costPrice),
            salePrice: Number(salePrice),
            minStock: Number(minStock),
            active,
          }
        : {
            code,
            name,
            description,
            categoryId,
            costPrice: Number(costPrice),
            salePrice: Number(salePrice),
            stock: Number(stock),
            minStock: Number(minStock),
            active,
          };

      if (editingId) {
        await api.products.update(editingId, payload);
      } else {
        await api.products.create(payload);
      }

      setIsFormOpen(false);
      loadData();
    } catch (err) {
      alert(err.message || 'Error al guardar producto');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteProduct = async (id) => {
    if (!confirm('¿Está seguro de eliminar o desactivar este producto?')) return;

    try {
      await api.products.delete(id);
      loadData();
    } catch (err) {
      alert(err.message || 'Error al eliminar producto');
    }
  };

  const getCategoryName = (id) => {
    const cats = Array.isArray(categories) ? categories : [];
    return cats.find(c => c.id === id)?.name || 'Sin Categoría';
  };

  const safeProducts = Array.isArray(products) ? products : [];
  // Perform client side search and filters
  const filteredProducts = safeProducts.filter(p => {
    const pName = p.name || '';
    const pCode = p.code || '';
    const pDesc = p.description || '';
    const searchLower = (search || '').toLowerCase();
    const matchesSearch = pName.toLowerCase().includes(searchLower) ||
      pCode.toLowerCase().includes(searchLower) ||
      pDesc.toLowerCase().includes(searchLower);
    const matchesCategory = selectedCatId === 'ALL' || p.categoryId === selectedCatId;
    
    let matchesStock = true;
    const stockVal = Number(p.stock || 0);
    const minStockVal = Number(p.minStock || 0);
    if (selectedStockStatus === 'LOW') {
      matchesStock = stockVal <= minStockVal && stockVal > 0;
    } else if (selectedStockStatus === 'OUT') {
      matchesStock = stockVal === 0;
    } else if (selectedStockStatus === 'OK') {
      matchesStock = stockVal > minStockVal;
    }

    return matchesSearch && matchesCategory && matchesStock;
  });

  if (loading && safeProducts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-96 space-y-4">
        <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
        <p className="text-slate-500 text-sm font-mono">Cargando inventario de productos...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6" id="products-view">
      {/* Header and Add Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-5">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100 tracking-tight font-sans">
            Catálogo de Productos
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Crea, edita, desactiva y supervisa existencias críticas del catálogo comercial.
          </p>
        </div>
        <button
          onClick={openCreateModal}
          className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 rounded-lg text-sm font-semibold shadow-sm hover:shadow transition-all w-full sm:w-auto justify-center cursor-pointer"
        >
          <Plus className="w-4 h-4" /> Agregar Producto
        </button>
      </div>

      {/* Filters Toolbar */}
      <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-xl p-4 shadow-sm flex flex-col md:flex-row gap-4 items-stretch md:items-center justify-between">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-3 w-4.5 h-4.5 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar por código, nombre..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-800 dark:text-slate-100 bg-transparent text-sm focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Category Filter */}
          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <Filter className="w-3.5 h-3.5" />
            <span>Categoría:</span>
            <select
              value={selectedCatId}
              onChange={(e) => setSelectedCatId(e.target.value)}
              className="border border-slate-200 dark:border-slate-800 bg-transparent px-2.5 py-1.5 rounded-lg text-slate-700 dark:text-slate-300 outline-none text-xs"
            >
              <option value="ALL">Todas las Categorías</option>
              {categories.map(c => (
                <option key={c.id} value={c.id} className="dark:bg-slate-950">{c.name}</option>
              ))}
            </select>
          </div>

          {/* Stock Filter */}
          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <span>Stock:</span>
            <select
              value={selectedStockStatus}
              onChange={(e) => setSelectedStockStatus(e.target.value)}
              className="border border-slate-200 dark:border-slate-800 bg-transparent px-2.5 py-1.5 rounded-lg text-slate-700 dark:text-slate-300 outline-none text-xs"
            >
              <option value="ALL">Todo</option>
              <option value="OK">Suficiente</option>
              <option value="LOW">Stock Mínimo</option>
              <option value="OUT">Agotado</option>
            </select>
          </div>
        </div>
      </div>

      {/* Products list Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-600 dark:text-slate-400">
            <thead className="bg-slate-50 dark:bg-slate-800/40 text-slate-400 uppercase font-mono tracking-wider">
              <tr>
                <th className="px-6 py-4">Código</th>
                <th className="px-6 py-4">Producto</th>
                <th className="px-6 py-4">Categoría</th>
                <th className="px-6 py-4 text-right">P. Compra</th>
                <th className="px-6 py-4 text-right">P. Venta</th>
                <th className="px-6 py-4 text-center">Stock</th>
                <th className="px-6 py-4 text-center">Estado</th>
                <th className="px-6 py-4 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredProducts.map((p) => {
                const isLow = p.stock <= p.minStock && p.stock > 0;
                const isOut = p.stock === 0;

                return (
                  <tr key={p.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/25 transition-colors">
                    <td className="px-6 py-4 font-mono font-medium text-slate-900 dark:text-slate-100">
                      {p.code}
                    </td>
                    <td className="px-6 py-4">
                      <div className="space-y-0.5">
                        <div className="font-semibold text-slate-900 dark:text-slate-100">{p.name}</div>
                        <div className="text-[10px] text-slate-400 line-clamp-1">{p.description}</div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-slate-500">{getCategoryName(p.categoryId)}</td>
                    <td className="px-6 py-4 text-right font-mono">${Number(p.costPrice || 0).toFixed(2)}</td>
                    <td className="px-6 py-4 text-right font-semibold font-mono text-slate-900 dark:text-slate-100">
                      ${Number(p.salePrice || 0).toFixed(2)}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <div className="flex flex-col items-center gap-0.5">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          isOut ? 'bg-rose-50 dark:bg-rose-950/20 text-rose-600 dark:text-rose-400' :
                          isLow ? 'bg-amber-50 dark:bg-amber-950/20 text-amber-600 dark:text-amber-400' :
                          'bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 dark:text-emerald-400'
                        }`}>
                          {p.stock} uds.
                        </span>
                        {isLow && (
                          <span className="text-[9px] text-amber-500 font-mono font-bold flex items-center gap-0.5">
                            <AlertTriangle className="w-2.5 h-2.5" /> Mín. {p.minStock}
                          </span>
                        )}
                        {isOut && (
                          <span className="text-[9px] text-rose-500 font-mono font-bold uppercase">Agotado</span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        p.active ? 'bg-emerald-50 dark:bg-emerald-950/25 text-emerald-600' : 'bg-slate-100 dark:bg-slate-800 text-slate-400'
                      }`}>
                        {p.active ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          onClick={() => openEditModal(p)}
                          className="text-slate-400 hover:text-indigo-600 p-1.5 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                          title="Editar"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDeleteProduct(p.id)}
                          className="text-slate-400 hover:text-rose-500 p-1.5 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                          title="Eliminar / Desactivar"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filteredProducts.length === 0 && (
                <tr>
                  <td colSpan={8} className="text-center py-10 text-slate-400 font-mono">
                    Ningún producto coincide con los filtros aplicados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Form Dialog for Create / Edit */}
      <Modal
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        title={editingId ? 'Editar Producto' : 'Crear Nuevo Producto'}
        maxWidth="lg"
      >
        <form onSubmit={handleSaveProduct} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label htmlFor="prod-code" className="block text-xs font-semibold text-slate-600 dark:text-slate-400">
                Código de Barra / Identificador *
              </label>
              <input
                id="prod-code"
                type="text"
                required={!editingId}
                disabled={!!editingId}
                placeholder="Ej. PROD-001"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="w-full px-3.5 py-2 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-800 dark:text-slate-100 bg-transparent focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-xs font-mono disabled:bg-slate-100 dark:disabled:bg-slate-800/40 disabled:cursor-not-allowed"
              />
              {editingId && (
                <p className="text-[10px] text-slate-400">El código no se puede modificar después de la creación.</p>
              )}
            </div>

            <div className="space-y-1.5">
              <label htmlFor="prod-name" className="block text-xs font-semibold text-slate-600 dark:text-slate-400">
                Nombre del Producto *
              </label>
              <input
                id="prod-name"
                type="text"
                required
                placeholder="Ej. Laptop Asus Zenbook"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3.5 py-2 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-800 dark:text-slate-100 bg-transparent focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-xs"
              />
            </div>

            <div className="col-span-1 md:col-span-2 space-y-1.5">
              <label htmlFor="prod-desc" className="block text-xs font-semibold text-slate-600 dark:text-slate-400">
                Descripción Detallada
              </label>
              <textarea
                id="prod-desc"
                rows={2}
                placeholder="Ingresar características, color, dimensiones..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full px-3.5 py-2 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-800 dark:text-slate-100 bg-transparent focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-xs resize-none"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="prod-cat" className="block text-xs font-semibold text-slate-600 dark:text-slate-400">
                Categoría *
              </label>
              <select
                id="prod-cat"
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="w-full px-3.5 py-2 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-800 dark:text-slate-100 bg-transparent focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-xs"
              >
                {categories.map(c => (
                  <option key={c.id} value={c.id} className="dark:bg-slate-950">{c.name}</option>
                ))}
              </select>
              {categoryChanged && (
                <p className="text-[10px] text-amber-600 dark:text-amber-400">Cambiar la categoría afectará reportes históricos.</p>
              )}
            </div>

            <div className="space-y-1.5">
              <label htmlFor="prod-active" className="block text-xs font-semibold text-slate-600 dark:text-slate-400">
                Estado Comercial
              </label>
              <select
                id="prod-active"
                value={active ? 'true' : 'false'}
                onChange={(e) => setActive(e.target.value === 'true')}
                className="w-full px-3.5 py-2 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-800 dark:text-slate-100 bg-transparent focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-xs"
              >
                <option value="true" className="dark:bg-slate-950">Activo (Habilitado en POS)</option>
                <option value="false" className="dark:bg-slate-950">Inactivo (Oculto en POS)</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="prod-cost" className="block text-xs font-semibold text-slate-600 dark:text-slate-400">
                Precio de Compra (Costo $) *
              </label>
              <input
                id="prod-cost"
                type="number"
                step="0.01"
                min="0"
                required
                value={costPrice}
                onChange={(e) => setCostPrice(Math.max(0, parseFloat(e.target.value) || 0))}
                className="w-full px-3.5 py-2 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-800 dark:text-slate-100 bg-transparent focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-xs font-mono"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="prod-sale" className="block text-xs font-semibold text-slate-600 dark:text-slate-400">
                Precio de Venta ($) *
              </label>
              <input
                id="prod-sale"
                type="number"
                step="0.01"
                min="0"
                required
                value={salePrice}
                onChange={(e) => setSalePrice(Math.max(0, parseFloat(e.target.value) || 0))}
                className="w-full px-3.5 py-2 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-800 dark:text-slate-100 bg-transparent focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-xs font-mono"
              />
            </div>

            {!editingId && (
              <div className="space-y-1.5">
                <label htmlFor="prod-stock" className="block text-xs font-semibold text-slate-600 dark:text-slate-400">
                  Stock Inicial *
                </label>
                <input
                  id="prod-stock"
                  type="number"
                  min="0"
                  required
                  value={stock}
                  onChange={(e) => setStock(Math.max(0, parseInt(e.target.value) || 0))}
                  className="w-full px-3.5 py-2 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-800 dark:text-slate-100 bg-transparent focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-xs font-mono"
                />
              </div>
            )}
            {editingId && (
              <p className="text-[10px] text-slate-400 md:col-span-2">Para modificar el stock utiliza el panel de Ajustes de Inventario.</p>
            )}

            <div className="space-y-1.5">
              <label htmlFor="prod-min" className="block text-xs font-semibold text-slate-600 dark:text-slate-400">
                Stock Mínimo (Alerta de Reabastecimiento) *
              </label>
              <input
                id="prod-min"
                type="number"
                min="0"
                required
                value={minStock}
                onChange={(e) => setMinStock(Math.max(0, parseInt(e.target.value) || 0))}
                className="w-full px-3.5 py-2 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-800 dark:text-slate-100 bg-transparent focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-xs font-mono"
              />
            </div>
          </div>

          <div className="flex gap-3 pt-3 justify-end">
            <button
              type="button"
              onClick={() => setIsFormOpen(false)}
              className="px-4 py-2 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs font-medium rounded-lg transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white text-xs font-medium px-4 py-2 rounded-lg shadow-sm transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              {saving ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> Guardando...
                </>
              ) : (
                'Guardar Producto'
              )}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
