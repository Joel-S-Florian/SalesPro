import React, { useState } from 'react';
import { Loader2, ShieldAlert } from 'lucide-react';
import Modal from '../Modal';
import { api } from '../../services/api';
import { useAuthStore } from '../../stores/authStore';
import { notify } from '../../utils/notify';
import PasswordField from '../ui/PasswordField';
import { passwordProblem } from '../../utils/passwordPolicy';

const inputClass =
  'w-full px-3.5 py-2 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-800 dark:text-slate-100 bg-transparent focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-xs font-mono';

/**
 * Cambio de contraseña con la actual. `forced` (clave temporal asignada por un administrador): no se puede cerrar
 * ni cancelar; solo cerrar sesión.
 */
export default function ChangePasswordModal({ isOpen, forced = false, onClose, onLogout }) {
  const user = useAuthStore(state => state.user);
  const setUser = useAuthStore(state => state.setUser);
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async event => {
    event.preventDefault();
    const problem = passwordProblem(newPassword, user);
    if (problem) return notify.warning(`La contraseña nueva no sirve: ${problem.toLowerCase()}`);
    if (newPassword !== confirm) return notify.warning('Las contraseñas nuevas no coinciden');
    if (newPassword === oldPassword) return notify.warning('La contraseña nueva debe ser distinta de la actual');
    setBusy(true);
    try {
      await api.auth.changePassword(oldPassword, newPassword);
      setUser({ ...user, mustChangePassword: false });
      setOldPassword('');
      setNewPassword('');
      setConfirm('');
      notify.success('Contraseña actualizada');
      onClose?.();
    } catch (err) {
      notify.error(err.message || 'No se pudo cambiar la contraseña');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={forced ? undefined : onClose} title={forced ? 'Crea tu contraseña personal' : 'Cambiar mi contraseña'} maxWidth="sm">
      <form onSubmit={submit} className="space-y-4">
        {forced && (
          <p className="flex gap-2 rounded-lg bg-amber-50 p-3 text-xs leading-relaxed text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
            Entraste con una clave temporal. Por seguridad, cámbiala ahora por una que solo tú conozcas.
          </p>
        )}
        <div className="space-y-1.5">
          <label htmlFor="cp-old" className="block text-xs font-semibold text-slate-600 dark:text-slate-400">{forced ? 'Clave temporal' : 'Contraseña actual'}</label>
          <input id="cp-old" type="password" autoComplete="current-password" required value={oldPassword} onChange={e => setOldPassword(e.target.value)} className={inputClass} />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="cp-new" className="block text-xs font-semibold text-slate-600 dark:text-slate-400">Contraseña nueva</label>
          <PasswordField id="cp-new" value={newPassword} onChange={setNewPassword} context={user} className={inputClass} />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="cp-confirm" className="block text-xs font-semibold text-slate-600 dark:text-slate-400">Repite la contraseña nueva</label>
          <input id="cp-confirm" type="password" autoComplete="new-password" required value={confirm} onChange={e => setConfirm(e.target.value)} className={inputClass} />
        </div>
        <div className="flex gap-3 pt-1">
          {forced ? (
            <button type="button" onClick={onLogout} className="w-full px-4 py-2 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 text-sm font-medium rounded-lg cursor-pointer">Cerrar sesión</button>
          ) : (
            <button type="button" onClick={onClose} className="w-full px-4 py-2 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 text-sm font-medium rounded-lg cursor-pointer">Cancelar</button>
          )}
          <button type="submit" disabled={busy} className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white text-sm font-medium py-2 rounded-lg flex items-center justify-center gap-1.5 cursor-pointer">
            {busy ? <><Loader2 className="w-4 h-4 animate-spin" /> Guardando...</> : 'Guardar'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
