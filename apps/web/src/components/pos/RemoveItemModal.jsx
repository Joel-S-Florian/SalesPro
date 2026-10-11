import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import Modal from '../Modal';
import { Field, inputClass, primaryButtonClass, secondaryButtonClass } from '../ui/form';

/**
 * Confirma quitar un artículo del ticket. Un vendedor necesita las credenciales de un administrador;
 * un administrador solo confirma. La eliminación queda registrada en la auditoría (lo hace el servidor).
 */
export default function RemoveItemModal({ item, requiresAdmin, onConfirm, onClose }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setUsername('');
    setPassword('');
    setError('');
  }, [item]);

  const submit = async event => {
    event.preventDefault();
    try {
      setBusy(true);
      setError('');
      await onConfirm(requiresAdmin ? { adminUsername: username.trim(), adminPassword: password } : {});
    } catch (err) {
      setError(err.message || 'No se pudo autorizar la eliminación');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal isOpen={!!item} onClose={() => !busy && onClose()} title="Quitar del ticket" maxWidth="sm">
      <form onSubmit={submit} className="space-y-4">
        <p className="text-sm text-slate-600 dark:text-slate-300">
          ¿Quitar <strong className="font-semibold text-slate-900 dark:text-white">{item?.product.name}</strong>
          {item ? ` (${item.presentation ? `${item.quantity} × ${item.presentation.name}` : `${item.quantity} ${item.product.unit && item.product.unit !== 'UND' ? item.product.unit.toLowerCase() : item.quantity === 1 ? 'unidad' : 'unidades'}`})` : ''} del ticket?
        </p>

        {requiresAdmin && (
          <div className="space-y-3 rounded-xl bg-slate-50 p-3.5 dark:bg-slate-800/50">
            <p className="text-sm text-slate-600 dark:text-slate-300">Un administrador debe autorizar este cambio.</p>
            <Field id="remove-admin-user" label="Usuario administrador">
              <input
                id="remove-admin-user"
                type="text"
                name="admin-username"
                autoComplete="off"
                required
                autoFocus
                value={username}
                onChange={e => setUsername(e.target.value)}
                className={inputClass}
              />
            </Field>
            <Field id="remove-admin-pass" label="Contraseña">
              <input
                id="remove-admin-pass"
                type="password"
                name="admin-password"
                autoComplete="new-password"
                required
                value={password}
                onChange={e => setPassword(e.target.value)}
                className={inputClass}
              />
            </Field>
          </div>
        )}

        {error && (
          <p role="alert" className="text-sm text-rose-600 dark:text-rose-400">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} disabled={busy} className={secondaryButtonClass}>
            Cancelar
          </button>
          <button type="submit" disabled={busy} className={`${primaryButtonClass} !bg-rose-600 hover:!bg-rose-700 inline-flex items-center gap-2`}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {busy ? 'Autorizando…' : 'Quitar'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
