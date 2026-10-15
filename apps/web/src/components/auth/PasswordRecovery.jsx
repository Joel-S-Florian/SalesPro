import React, { useState } from 'react';
import { motion } from 'motion/react';
import { ArrowLeft, CheckCircle2, Loader2, MailCheck } from 'lucide-react';
import { api } from '../../services/api';
import PasswordField from '../ui/PasswordField';

const inputClass = 'w-full px-4 py-2.5 rounded-xl text-slate-800 dark:text-slate-100 glass-input outline-none text-xs font-mono';
const labelClass = 'block text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider';
const primaryButton =
  'w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white font-bold text-xs py-3 rounded-xl flex items-center justify-center gap-1.5 uppercase tracking-wider cursor-pointer';

/**
 * Recuperación de contraseña, antes de iniciar sesión.
 * - mode="forgot": pide usuario o correo y envía el enlace (la respuesta es siempre la misma).
 * - mode="reset": llega desde el enlace del correo (?reset=…) y fija la contraseña nueva.
 */
export default function PasswordRecovery({ mode, token, onBack }) {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const submitForgot = async event => {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      await api.auth.forgotPassword(identifier.trim());
      setDone(true);
    } catch (err) {
      setError(err.message || 'No se pudo enviar la solicitud');
    } finally {
      setBusy(false);
    }
  };

  const submitReset = async event => {
    event.preventDefault();
    setError('');
    if (password !== confirm) return setError('Las contraseñas no coinciden');
    setBusy(true);
    try {
      await api.auth.resetPassword(token, password);
      setDone(true);
    } catch (err) {
      setError(err.message || 'No se pudo cambiar la contraseña');
    } finally {
      setBusy(false);
    }
  };

  const isReset = mode === 'reset';

  return (
    <div className="min-h-screen relative flex flex-col justify-center items-center p-4 overflow-hidden" id="recovery-screen">
      <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden bg-[#f4f6fa] dark:bg-[#090d16]">
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full bg-indigo-200/40 dark:bg-indigo-950/20 blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[60%] h-[60%] rounded-full bg-purple-200/30 dark:bg-purple-950/15 blur-[120px]" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
        className="relative z-10 w-full max-w-md glass-card rounded-2xl p-8 space-y-6"
      >
        {done ? (
          <div className="space-y-4 text-center" role="status">
            {isReset ? <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-500" /> : <MailCheck className="mx-auto h-12 w-12 text-indigo-500" />}
            <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100 font-display">{isReset ? 'Contraseña actualizada' : 'Revisa tu correo'}</h2>
            <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">
              {isReset
                ? 'Ya puedes iniciar sesión con tu contraseña nueva.'
                : 'Si la cuenta tiene un correo registrado, te enviamos un enlace para restablecer la contraseña. Vale 30 minutos. Si no llega, revisa la carpeta de correo no deseado.'}
            </p>
            <button type="button" onClick={onBack} className={primaryButton}>
              Ir a iniciar sesión
            </button>
          </div>
        ) : (
          <>
            <div className="space-y-1.5 text-center">
              <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100 tracking-tight font-display">{isReset ? 'Nueva contraseña' : '¿Olvidaste tu contraseña?'}</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {isReset ? 'Elige una contraseña de al menos 8 caracteres, con letras y números.' : 'Escribe tu usuario o tu correo y te enviamos un enlace para crear una nueva.'}
              </p>
            </div>

            {error && (
              <div role="alert" className="p-3.5 bg-rose-50/80 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/50 rounded-xl text-rose-600 dark:text-rose-400 text-xs font-semibold text-center">
                {error}
              </div>
            )}

            {isReset ? (
              <form onSubmit={submitReset} className="space-y-4">
                <div className="space-y-1.5">
                  <label htmlFor="reset-password" className={labelClass}>Contraseña nueva</label>
                  <PasswordField id="reset-password" value={password} onChange={setPassword} className={inputClass} />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="reset-confirm" className={labelClass}>Repite la contraseña</label>
                  <input id="reset-confirm" type="password" autoComplete="new-password" required value={confirm} onChange={e => setConfirm(e.target.value)} className={inputClass} />
                </div>
                <button type="submit" disabled={busy} className={primaryButton}>
                  {busy ? <><Loader2 className="w-4 h-4 animate-spin" /> Guardando...</> : 'Guardar contraseña'}
                </button>
              </form>
            ) : (
              <form onSubmit={submitForgot} className="space-y-4">
                <div className="space-y-1.5">
                  <label htmlFor="forgot-identifier" className={labelClass}>Usuario o correo</label>
                  <input id="forgot-identifier" type="text" autoComplete="username" spellCheck={false} required value={identifier} onChange={e => setIdentifier(e.target.value)} className={inputClass} />
                </div>
                <button type="submit" disabled={busy || !identifier.trim()} className={primaryButton}>
                  {busy ? <><Loader2 className="w-4 h-4 animate-spin" /> Enviando...</> : 'Enviar enlace'}
                </button>
                <p className="text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
                  ¿Tu usuario no tiene correo registrado? Pídele a tu administrador que te asigne una clave temporal; la cambiarás al entrar.
                </p>
              </form>
            )}

            <button type="button" onClick={onBack} className="mx-auto flex items-center gap-1.5 text-xs font-semibold text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 cursor-pointer">
              <ArrowLeft className="h-3.5 w-3.5" /> Volver a iniciar sesión
            </button>
          </>
        )}
      </motion.div>
    </div>
  );
}
