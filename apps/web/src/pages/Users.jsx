import React, { useState } from 'react';
import { api } from '../services/api';
import { Loader2, Plus, Search, Edit2, Shield, UserCheck, UserX, KeyRound } from 'lucide-react';
import Modal from '../components/Modal';
import Pagination from '../components/Pagination';
import { TableSkeleton } from '../components/Skeleton';
import { usePagedList } from '../hooks/usePagedList';
import { useBranches } from '../hooks/queries';
import { notify } from '../utils/notify';
import SmartSelect from '../components/ui/SmartSelect';
import TempPasswordModal from '../components/auth/TempPasswordModal';
import { DocumentType, formatDocument, validateDocument } from '../utils/documents';

export default function Users() {
  // Search filter
  const [search, setSearch] = useState('');

  const { rows: users, total, loading, error, page, pageSize, setPage, setPageSize, reload } = usePagedList(
    api.auth.getUsersPage,
    { q: search.trim() || undefined }
  );

  // Form states
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [documentId, setDocumentId] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState('VENDEDOR');
  const [branchId, setBranchId] = useState('');
  const { data: branches = [] } = useBranches();
  const [tempPassword, setTempPassword] = useState(null); // clave temporal recién generada (se muestra una sola vez)
  const [active, setActive] = useState(true);
  const [saving, setSaving] = useState(false);

  const openCreateModal = () => {
    setEditingId(null);
    setFullName('');
    setUsername('');
    setEmail('');
    setDocumentId('');
    setPhone('');
    setRole('VENDEDOR');
    setBranchId('');
    setActive(true);
    setIsFormOpen(true);
  };

  const openEditModal = (u) => {
    setEditingId(u.id);
    setFullName(u.fullName || '');
    setUsername(u.username || '');
    setEmail(u.email || '');
    setDocumentId(u.documentId ? formatDocument(DocumentType.CEDULA, u.documentId) : '');
    setPhone(u.phone || '');
    setRole(u.role || 'VENDEDOR');
    setBranchId(u.branchId || '');
    setActive(u.active !== false);
    setIsFormOpen(true);
  };

  const resetPassword = async user => {
    if (!window.confirm(`¿Generar una clave temporal nueva para ${user.username}? La clave actual dejará de servir y se cerrará su sesión.`)) return;
    try {
      const result = await api.auth.resetUserPassword(user.id);
      setTempPassword({ username: result.username, password: result.temporaryPassword, expiresAt: result.temporaryPasswordExpiresAt });
      reload();
    } catch (err) {
      notify.error(err.message || 'No se pudo restablecer la contraseña');
    }
  };

  const handleSaveUser = async (e) => {
    e.preventDefault();
    if (!fullName.trim() || !username.trim()) return;
    if (documentId.trim() && !validateDocument(DocumentType.CEDULA, formatDocument(DocumentType.CEDULA, documentId))) {
      notify.warning('La cédula no es válida: escribe los 11 dígitos');
      return;
    }

    try {
      setSaving(true);
      const payload = {
        fullName,
        username,
        role,
        active,
        ...(role === 'VENDEDOR' && branchId ? { branchId } : {}),
        ...(email.trim() ? { email: email.trim() } : {}),
        ...(documentId.trim() ? { documentId: documentId.trim() } : {}),
        ...(phone.trim() ? { phone: phone.trim() } : {}),
      };
      if (editingId) {
        // Edit
        await api.auth.updateUser(editingId, { fullName, role, active, branchId: role === 'VENDEDOR' ? branchId || null : null, email: email.trim() || null, documentId: documentId.trim() || null, phone: phone.trim() || null });
        notify.success('Usuario actualizado');
      } else {
        // Create: la clave temporal la genera el servidor y se muestra una sola vez
        const created = await api.auth.createUser(payload);
        notify.success('Usuario creado');
        if (created.temporaryPassword) setTempPassword({ username: created.username, password: created.temporaryPassword, expiresAt: created.temporaryPasswordExpiresAt });
      }
      setIsFormOpen(false);
      reload();
    } catch (err) {
      notify.error(err.message || 'Error al guardar usuario');
    } finally {
      setSaving(false);
    }
  };

  const filteredUsers = users;

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
          className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 rounded-lg text-sm font-semibold shadow-sm hover:shadow transition w-full sm:w-auto justify-center cursor-pointer"
        >
          <Plus className="w-4 h-4" /> Registrar Usuario
        </button>
      </div>

      {/* Filter toolbar */}
      <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-xl p-4 shadow-sm">
        <div className="relative">
          <Search className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
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
              {loading && filteredUsers.length === 0 && <TableSkeleton rows={pageSize} columns={6} />}
              {filteredUsers.map((u) => (
                <tr key={u.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/25 transition-colors">
                  <td className="px-6 py-4 font-mono font-bold text-slate-900 dark:text-slate-100">
                    @{u.username}
                  </td>
                  <td className="px-6 py-4 font-semibold text-slate-800 dark:text-slate-200">
                    {u.fullName}
                    {(u.documentId || u.phone) && (
                      <span className="block text-[11px] font-normal text-slate-400 font-mono">
                        {[u.documentId && formatDocument(DocumentType.CEDULA, u.documentId), u.phone].filter(Boolean).join(' · ')}
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold inline-flex items-center gap-1 ${
                      u.role === 'ADMINISTRADOR' ? 'bg-indigo-50 dark:bg-indigo-950/20 text-indigo-600' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
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
                      <button aria-label="Modificar Credenciales"
                        onClick={() => openEditModal(u)}
                        disabled={u.username === 'admin'}
                        className="text-slate-400 hover:text-indigo-600 disabled:opacity-30 p-1.5 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                        title="Modificar Credenciales"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button aria-label={`Restablecer contraseña de ${u.username}`}
                        onClick={() => resetPassword(u)}
                        disabled={u.username === 'admin'}
                        className="text-slate-400 hover:text-indigo-600 disabled:opacity-30 p-1.5 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                        title="Restablecer contraseña (genera una clave temporal)"
                      >
                        <KeyRound className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!loading && filteredUsers.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center py-10 text-slate-400 font-mono">
                    {error || 'Ningún usuario encontrado en el sistema.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <Pagination page={page} pageSize={pageSize} total={total} onPageChange={setPage} onPageSizeChange={setPageSize} noun="usuarios" />
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

          <div className="space-y-1.5">
            <label htmlFor="usr-email" className="block text-xs font-semibold text-slate-600 dark:text-slate-400">
              Correo (para recuperar la contraseña)
            </label>
            <input
              id="usr-email"
              type="email"
              autoComplete="off"
              placeholder="Opcional. Ej. nombre@correo.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3.5 py-2 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-800 dark:text-slate-100 bg-transparent focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-xs"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label htmlFor="usr-doc" className="block text-xs font-semibold text-slate-600 dark:text-slate-400">Cédula</label>
              <input
                id="usr-doc"
                type="text"
                inputMode="numeric"
                autoComplete="off"
                placeholder="000-0000000-0"
                value={documentId}
                onChange={(e) => setDocumentId(formatDocument(DocumentType.CEDULA, e.target.value))}
                className="w-full px-3.5 py-2 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-800 dark:text-slate-100 bg-transparent focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-xs font-mono"
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="usr-phone" className="block text-xs font-semibold text-slate-600 dark:text-slate-400">Teléfono</label>
              <input
                id="usr-phone"
                type="tel"
                autoComplete="off"
                placeholder="809-000-0000"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full px-3.5 py-2 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-800 dark:text-slate-100 bg-transparent focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-xs"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label htmlFor="usr-role" className="block text-xs font-semibold text-slate-600 dark:text-slate-400">
                Rol Funcional *
              </label>
              <SmartSelect
                id="usr-role"
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="w-full px-3.5 py-2 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-800 dark:text-slate-100 bg-transparent focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-xs"
              >
                <option value="VENDEDOR" className="dark:bg-slate-950">Vendedor POS</option>
                <option value="ADMINISTRADOR" className="dark:bg-slate-950">Administrador</option>
              </SmartSelect>
            </div>

            {role === 'VENDEDOR' && branches.length > 1 && (
              <div className="col-span-2 space-y-1.5">
                <label htmlFor="usr-branch" className="block text-xs font-semibold text-slate-600 dark:text-slate-400">Sucursal asignada</label>
                <SmartSelect
                  id="usr-branch"
                  value={branchId}
                  onChange={(e) => setBranchId(e.target.value)}
                  className="w-full px-3.5 py-2 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-800 dark:text-slate-100 bg-transparent focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-xs"
                >
                  <option value="" className="dark:bg-slate-950">Todas las sucursales</option>
                  {branches.map(b => (
                    <option key={b.id} value={b.id} className="dark:bg-slate-950">{b.name}</option>
                  ))}
                </SmartSelect>
                <p className="text-[11px] text-slate-400">Un vendedor con sucursal solo usa las cajas de esa sucursal.</p>
              </div>
            )}

            <div className="space-y-1.5">
              <label htmlFor="usr-active" className="block text-xs font-semibold text-slate-600 dark:text-slate-400">
                Acceso Habilitado *
              </label>
              <SmartSelect
                id="usr-active"
                value={active ? 'true' : 'false'}
                onChange={(e) => setActive(e.target.value === 'true')}
                className="w-full px-3.5 py-2 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-800 dark:text-slate-100 bg-transparent focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-xs"
              >
                <option value="true" className="dark:bg-slate-950">Permitido (Activo)</option>
                <option value="false" className="dark:bg-slate-950">Suspendido (Bloqueado)</option>
              </SmartSelect>
            </div>
          </div>

          {!editingId && (
            <p className="flex items-start gap-2 rounded-lg bg-indigo-50 p-3 text-[11px] leading-relaxed text-indigo-800 dark:bg-indigo-950/30 dark:text-indigo-200">
              <KeyRound className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              La contraseña la genera el sistema: al guardar verás una clave temporal (una sola vez) para entregársela. Caduca a las 48 horas y la persona deberá cambiarla al entrar.
            </p>
          )}
          {editingId && (
            <p className="text-[11px] text-slate-400">Para dar una clave nueva usa el botón de la llave en la lista de usuarios: genera una temporal y cierra la sesión de la persona.</p>
          )}

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
      <TempPasswordModal data={tempPassword} onClose={() => setTempPassword(null)} title="Clave temporal" />
    </div>
  );
}
