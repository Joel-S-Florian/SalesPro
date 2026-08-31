import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import { Loader2, Plus, Search, Edit2, Shield, UserCheck, UserX, Key } from 'lucide-react';
import Modal from '../components/Modal';

export default function Users() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Search filter
  const [search, setSearch] = useState('');

  // Form states
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [role, setRole] = useState('Vendedor');
  const [password, setPassword] = useState('');
  const [active, setActive] = useState(true);
  const [saving, setSaving] = useState(false);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await api.auth.getUsers();
      setUsers(Array.isArray(data) ? data : (data?.data || []));
    } catch (err) {
      setError(err.message || 'Error al cargar usuarios');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const openCreateModal = () => {
    setEditingId(null);
    setFullName('');
    setUsername('');
    setRole('VENDEDOR');
    setPassword('');
    setActive(true);
    setIsFormOpen(true);
  };

  const openEditModal = (u) => {
    setEditingId(u.id);
    setFullName(u.fullName || '');
    setUsername(u.username || '');
    setRole(u.role || 'VENDEDOR');
    setPassword('');
    setActive(u.active !== false);
    setIsFormOpen(true);
  };

  const handleSaveUser = async (e) => {
    e.preventDefault();
    if (!fullName.trim() || !username.trim()) return;

    try {
      setSaving(true);
      const payload = { fullName, username, role, password, active };
      if (editingId) {
        // Edit
        await api.auth.updateUser(editingId, { fullName, role, active, password });
      } else {
        // Create
        if (!password) {
          alert('La contraseña es obligatoria para nuevos usuarios');
          return;
        }
        await api.auth.createUser(payload);
      }
      setIsFormOpen(false);
      loadData();
    } catch (err) {
      alert(err.message || 'Error al guardar usuario');
    } finally {
      setSaving(false);
    }
  };

  const safeUsers = Array.isArray(users) ? users : [];
  const filteredUsers = safeUsers.filter(u =>
    (u.fullName || '').toLowerCase().includes((search || '').toLowerCase()) ||
    (u.username || '').toLowerCase().includes((search || '').toLowerCase())
  );

  if (loading && safeUsers.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-96 space-y-4">
        <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
        <p className="text-slate-500 text-sm font-mono">Cargando personal administrativo...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6" id="users-view">
      {/* Header and Add Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-5">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100 tracking-tight font-sans">
            Gestión de Usuarios & Personal
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Administra credenciales de acceso, asigna roles de seguridad e inactiva usuarios del sistema.
          </p>
        </div>
        <button
          onClick={openCreateModal}
          className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 rounded-lg text-sm font-semibold shadow-sm hover:shadow transition-all w-full sm:w-auto justify-center cursor-pointer"
        >
          <Plus className="w-4 h-4" /> Registrar Usuario
        </button>
      </div>

      {/* Filter toolbar */}
      <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-xl p-4 shadow-sm">
        <div className="relative">
          <Search className="absolute left-3 top-3 w-4.5 h-4.5 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar usuarios por nombre real o usuario de acceso..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-800 dark:text-slate-100 bg-transparent text-sm focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
          />
        </div>
      </div>

      {/* Table grid */}
      <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-600 dark:text-slate-400">
            <thead className="bg-slate-50 dark:bg-slate-800/40 text-slate-400 uppercase font-mono tracking-wider">
              <tr>
                <th className="px-6 py-4">Usuario</th>
                <th className="px-6 py-4">Nombre Completo</th>
                <th className="px-6 py-4">Rol</th>
                <th className="px-6 py-4">Fecha Registro</th>
                <th className="px-6 py-4 text-center">Estado de Acceso</th>
                <th className="px-6 py-4 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredUsers.map((u) => (
                <tr key={u.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/25 transition-colors">
                  <td className="px-6 py-4 font-mono font-bold text-slate-900 dark:text-slate-100">
                    @{u.username}
                  </td>
                  <td className="px-6 py-4 font-semibold text-slate-800 dark:text-slate-200">{u.fullName}</td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold inline-flex items-center gap-1 ${
                      u.role === 'Administrador' ? 'bg-indigo-50 dark:bg-indigo-950/20 text-indigo-600' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
                    }`}>
                      <Shield className="w-3 h-3" />
                      {u.role}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-slate-400 font-mono">
                    {new Date(u.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 text-center">
                    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold inline-flex items-center gap-1 ${
                      u.active ? 'bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600' : 'bg-rose-50 dark:bg-rose-950/20 text-rose-600'
                    }`}>
                      {u.active ? <UserCheck className="w-3.5 h-3.5" /> : <UserX className="w-3.5 h-3.5" />}
                      {u.active ? 'Permitido' : 'Suspendido'}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center justify-center gap-1.5">
                      <button
                        onClick={() => openEditModal(u)}
                        disabled={u.username === 'admin'}
                        className="text-slate-400 hover:text-indigo-600 disabled:opacity-30 p-1.5 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                        title="Modificar Credenciales"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredUsers.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center py-10 text-slate-400 font-mono">
                    Ningún usuario encontrado en el sistema.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Form modal */}
      <Modal
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        title={editingId ? 'Actualizar Cuenta de Usuario' : 'Registrar Nuevo Operador'}
        maxWidth="sm"
      >
        <form onSubmit={handleSaveUser} className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="usr-fullname" className="block text-xs font-semibold text-slate-600 dark:text-slate-400">
              Nombre Completo del Personal *
            </label>
            <input
              id="usr-fullname"
              type="text"
              required
              placeholder="Ej. José Daniel Flores"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full px-3.5 py-2 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-800 dark:text-slate-100 bg-transparent focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-xs"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="usr-username" className="block text-xs font-semibold text-slate-600 dark:text-slate-400">
              Usuario de Acceso *
            </label>
            <input
              id="usr-username"
              type="text"
              required
              disabled={editingId !== null}
              placeholder="Ej. jflores"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-3.5 py-2 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-800 dark:text-slate-100 bg-transparent focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-xs font-mono disabled:bg-slate-50 dark:disabled:bg-slate-800/40"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label htmlFor="usr-role" className="block text-xs font-semibold text-slate-600 dark:text-slate-400">
                Rol Funcional *
              </label>
              <select
                id="usr-role"
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="w-full px-3.5 py-2 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-800 dark:text-slate-100 bg-transparent focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-xs"
              >
                <option value="Vendedor" className="dark:bg-slate-950">Vendedor POS</option>
                <option value="Administrador" className="dark:bg-slate-950">Administrador</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="usr-active" className="block text-xs font-semibold text-slate-600 dark:text-slate-400">
                Acceso Habilitado *
              </label>
              <select
                id="usr-active"
                value={active ? 'true' : 'false'}
                onChange={(e) => setActive(e.target.value === 'true')}
                className="w-full px-3.5 py-2 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-800 dark:text-slate-100 bg-transparent focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-xs"
              >
                <option value="true" className="dark:bg-slate-950">Permitido (Activo)</option>
                <option value="false" className="dark:bg-slate-950">Suspendido (Bloqueado)</option>
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="usr-pass" className="block text-xs font-semibold text-slate-600 dark:text-slate-400 flex items-center gap-1">
              <Key className="w-3.5 h-3.5" />
              {editingId ? 'Nueva Contraseña (Dejar vacío para no cambiar)' : 'Contraseña de Acceso *'}
            </label>
            <input
              id="usr-pass"
              type="password"
              required={!editingId}
              placeholder="Min. 4 caracteres"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3.5 py-2 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-800 dark:text-slate-100 bg-transparent focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-xs font-mono"
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
              disabled={saving}
              className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white text-xs font-medium px-4 py-2 rounded-lg shadow-sm transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              {saving ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> Guardando...
                </>
              ) : (
                'Guardar Usuario'
              )}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
