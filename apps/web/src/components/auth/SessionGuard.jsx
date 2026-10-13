import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Clock } from 'lucide-react';
import Modal from '../Modal';
import ChangePasswordModal from './ChangePasswordModal';
import { useAuthStore } from '../../stores/authStore';
import { useConfigStore } from '../../stores/configStore';

const ACTIVITY_KEY = 'factos-last-activity';
const WARNING_SECONDS = 60;
const TICK_MS = 5000;
const ACTIVITY_EVENTS = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart', 'scroll'];

const readLastActivity = () => {
  try {
    return Number(localStorage.getItem(ACTIVITY_KEY)) || 0;
  } catch {
    return 0;
  }
};

const writeLastActivity = value => {
  try {
    localStorage.setItem(ACTIVITY_KEY, String(value));
  } catch {
    // almacenamiento no disponible: se sigue con la marca en memoria
  }
};

/**
 * Cierra la sesión cuando el sistema no se está usando.
 * - La actividad es tocar, mover el ratón, escribir (el lector de códigos cuenta) o desplazarse; se comparte entre pestañas.
 * - Un minuto antes avisa con una cuenta regresiva y permite seguir conectado.
 * - Si el equipo estuvo dormido o la pestaña cerrada más del límite, al volver cierra de inmediato.
 * - El límite (minutos; 0 = nunca) se configura en Configuración → Seguridad. El servidor también rechaza renovar sesiones abandonadas.
 * También exige cambiar la clave temporal asignada por un administrador.
 */
export default function SessionGuard({ onIdleLogout, onLogout }) {
  const user = useAuthStore(state => state.user);
  const minutes = useConfigStore(state => state.config.security?.idleTimeoutMinutes ?? 30);
  const [secondsLeft, setSecondsLeft] = useState(null);
  const lastWrite = useRef(0);
  const memoryActivity = useRef(Date.now());
  const limitMs = minutes * 60000;

  const touch = useCallback(() => {
    const now = Date.now();
    memoryActivity.current = now;
    // se escribe como mucho cada 3 s para no castigar el almacenamiento con cada movimiento
    if (now - lastWrite.current > 3000) {
      lastWrite.current = now;
      writeLastActivity(now);
    }
    setSecondsLeft(null);
  }, []);

  useEffect(() => {
    if (!limitMs) return undefined;
    writeLastActivity(Date.now());
    ACTIVITY_EVENTS.forEach(name => window.addEventListener(name, touch, { passive: true, capture: true }));

    const check = () => {
      const last = Math.max(readLastActivity(), memoryActivity.current);
      const idle = Date.now() - last;
      if (idle >= limitMs) {
        onIdleLogout();
        return;
      }
      const remaining = Math.ceil((limitMs - idle) / 1000);
      setSecondsLeft(remaining <= WARNING_SECONDS ? remaining : null);
    };
    const timer = setInterval(check, TICK_MS);
    const onVisible = () => document.visibilityState === 'visible' && check();
    document.addEventListener('visibilitychange', onVisible);
    check();

    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      ACTIVITY_EVENTS.forEach(name => window.removeEventListener(name, touch, { capture: true }));
    };
  }, [limitMs, touch, onIdleLogout]);

  // La cuenta regresiva del aviso se actualiza cada segundo (el chequeo general va cada 5 s)
  useEffect(() => {
    if (secondsLeft === null) return undefined;
    const timer = setInterval(() => setSecondsLeft(value => (value === null ? null : Math.max(0, value - 1))), 1000);
    return () => clearInterval(timer);
  }, [secondsLeft === null]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <Modal isOpen={secondsLeft !== null} onClose={touch} title="¿Sigues ahí?" maxWidth="sm">
        <div className="space-y-4 text-center" role="alertdialog" aria-live="assertive">
          <Clock className="mx-auto h-10 w-10 text-amber-500" />
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Por seguridad, la sesión se cerrará por inactividad en <strong className="tabular-nums">{secondsLeft}</strong> s.
            Lo que no hayas cobrado en el carrito se perderá.
          </p>
          <button type="button" onClick={touch} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium py-2 rounded-lg cursor-pointer">
            Seguir conectado
          </button>
        </div>
      </Modal>
      <ChangePasswordModal isOpen={Boolean(user?.mustChangePassword)} forced onLogout={onLogout} />
    </>
  );
}
