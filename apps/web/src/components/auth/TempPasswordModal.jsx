import React, { useState } from 'react';
import { Check, Copy, ShieldAlert } from 'lucide-react';
import Modal from '../Modal';

/**
 * Muestra UNA sola vez la clave temporal que generó el servidor. Al cerrar no hay forma de volver a verla
 * (para otra, se restablece la contraseña). Caduca a las 48 horas y la persona debe cambiarla al entrar.
 */
export default function TempPasswordModal({ data, onClose, title = 'Clave temporal' }) {
  const [copied, setCopied] = useState(false);
  if (!data) return null;
  const expires = data.expiresAt ? new Date(data.expiresAt).toLocaleString('es-DO', { dateStyle: 'medium', timeStyle: 'short' }) : null;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(data.password);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // sin portapapeles: la clave está a la vista para copiarla a mano
    }
  };

  return (
    <Modal isOpen onClose={onClose} title={title} maxWidth="sm">
      <div className="space-y-4">
        <p className="text-xs text-slate-500">
          Entrégale esta clave a <strong>{data.username}</strong>. <strong>Se muestra una sola vez</strong>: cuando cierres esta ventana ya no se podrá ver.
        </p>
        <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-800/50">
          <code className="flex-1 select-all text-lg font-semibold tracking-wider text-slate-900 dark:text-white" data-testid="temp-password">
            {data.password}
          </code>
          <button type="button" onClick={copy} className="flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-600 cursor-pointer dark:border-slate-700 dark:text-slate-300">
            {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />} {copied ? 'Copiada' : 'Copiar'}
          </button>
        </div>
        <p className="flex gap-2 rounded-lg bg-amber-50 p-3 text-xs leading-relaxed text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Es una clave temporal: {expires ? `caduca el ${expires} (48 horas) y ` : ''}la persona deberá cambiarla por una propia al iniciar sesión. Compártela por un medio privado.
          </span>
        </p>
        <button type="button" onClick={onClose} className="w-full rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white cursor-pointer">
          Ya la copié
        </button>
      </div>
    </Modal>
  );
}
