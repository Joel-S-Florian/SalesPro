import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import { Loader2, Plus, Search, Edit2, Trash2, Tag } from 'lucide-react';
import Modal from '../components/Modal';

export default function Categories() {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Search filter
  const [search, setSearch] = useState('');

  // Form states
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await api.categories.list();
      setCategories(Array.isArray(data) ? data : (data?.data || []));
    } catch (err) {
      setError(err.message || 'Error al cargar categorías');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const openCreateModal = () => {
    setEditingId(null);
    setName('');
    setDescription('');
    setIsFormOpen(true);
  };

  const openEditModal = (c) => {
    setEditingId(c.id);
    setName(c.name || '');
    setDescription(c.description || '');
    setIsFormOpen(true);
  };

  const handleSaveCategory = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;

    try {
      setSaving(true);
      if (editingId) {
        await api.categories.update(editingId, name, description);
      } else {
        await api.categories.create(name, description);
      }
      setIsFormOpen(false);
      loadData();
    } catch (err) {
      alert(err.message || 'Error al guardar categoría');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteCategory = async (id) => {
    if (!confirm('¿Está seguro de eliminar esta categoría?')) return;

    try {
      await api.categories.delete(id);
      loadData();
    } catch (err) {
      alert(err.message || 'Error al eliminar categoría');
    }
  };

  const safeCategories = Array.isArray(categories) ? categories : [];
  const filteredCategories = safeCategories.filter(c =>
    (c.name || '').toLowerCase().includes((search || '').toLowerCase()) ||
    (c.description || '').toLowerCase().includes((search || '').toLowerCase())
  );

  if (loading && safeCategories.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-96 space-y-4">
        <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
        <p className="text-slate-500 text-sm font-mono">Cargando categorías...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6" id="categories-view">
      {/* Header and Add Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-5">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100 tracking-tight font-sans">
            Categorías de Productos
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Organiza tus productos comerciales asignándolos a familias estructuradas.
          </p>
        </div>
        <button
          onClick={openCreateModal}
          className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 rounded-lg text-sm font-semibold shadow-sm hover:shadow transition-all w-full sm:w-auto justify-center cursor-pointer"
        >
          <Plus className="w-4 h-4" /> Nueva Categoría
        </button>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-xl p-4 shadow-sm">
        <div className="relative">
          <Search className="absolute left-3 top-3 w-4.5 h-4.5 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar por nombre o descripción de categoría..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-800 dark:text-slate-100 bg-transparent text-sm focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
          />
        </div>
      </div>

      {/* Table listing */}
      <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-600 dark:text-slate-400">
            <thead className="bg-slate-50 dark:bg-slate-800/40 text-slate-400 uppercase font-mono tracking-wider">
              <tr>
                <th className="px-6 py-4 w-12"></th>
                <th className="px-6 py-4">Nombre de Categoría</th>
                <th className="px-6 py-4">Descripción</th>
                <th className="px-6 py-4">Fecha de Creación</th>
                <th className="px-6 py-4 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredCategories.map((c) => (
                <tr key={c.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/25 transition-colors">
                  <td className="px-6 py-4 text-indigo-500">
                    <Tag className="w-4 h-4" />
                  </td>
                  <td className="px-6 py-4 font-semibold text-slate-900 dark:text-slate-100">
                    {c.name}
                  </td>
                  <td className="px-6 py-4 text-slate-500 max-w-xs truncate">{c.description || '-'}</td>
                  <td className="px-6 py-4 text-slate-400 font-mono">
                    {new Date(c.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center justify-center gap-1.5">
                      <button
                        onClick={() => openEditModal(c)}
                        className="text-slate-400 hover:text-indigo-600 p-1.5 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                        title="Editar"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDeleteCategory(c.id)}
                        className="text-slate-400 hover:text-rose-500 p-1.5 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                        title="Eliminar"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredCategories.length === 0 && (
                <tr>
                  <td colSpan={5} className="text-center py-10 text-slate-400 font-mono">
                    No se encontraron categorías comerciales.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create / Edit Form modal */}
      <Modal
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        title={editingId ? 'Editar Categoría' : 'Nueva Categoría de Productos'}
        maxWidth="sm"
      >
        <form onSubmit={handleSaveCategory} className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="cat-name" className="block text-xs font-semibold text-slate-600 dark:text-slate-400">
              Nombre de la Categoría *
            </label>
            <input
              id="cat-name"
              type="text"
              required
              placeholder="Ej. Electrónica, Alimentos"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3.5 py-2 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-800 dark:text-slate-100 bg-transparent focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-xs"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="cat-desc" className="block text-xs font-semibold text-slate-600 dark:text-slate-400">
              Descripción Corta
            </label>
            <textarea
              id="cat-desc"
              rows={3}
              placeholder="Ej. Dispositivos tecnológicos, accesorios..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3.5 py-2 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-800 dark:text-slate-100 bg-transparent focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-xs resize-none"
            />
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
              disabled={saving || !name.trim()}
              className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white text-xs font-medium px-4 py-2 rounded-lg shadow-sm transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              {saving ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> Guardando...
                </>
              ) : (
                'Guardar Categoría'
              )}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
