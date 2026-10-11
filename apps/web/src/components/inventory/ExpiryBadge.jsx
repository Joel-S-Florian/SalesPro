import React from 'react';
import { AlertTriangle, CalendarClock, CheckCircle2, Skull } from 'lucide-react';

const STYLES = {
  OK: { box: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/25 dark:text-emerald-400', icon: CheckCircle2, anim: '' },
  YELLOW: { box: 'bg-amber-50 text-amber-700 dark:bg-amber-950/25 dark:text-amber-400', icon: CalendarClock, anim: 'expiry-warn' },
  RED: { box: 'bg-rose-50 text-rose-700 dark:bg-rose-950/25 dark:text-rose-400', icon: AlertTriangle, anim: 'expiry-critical' },
  EXPIRED: { box: 'bg-rose-600 text-white', icon: Skull, anim: 'expiry-critical' },
};

/** Texto corto del tiempo que falta: "Vencido", "Vence hoy", "Vence en 3 d". */
export function expiryLabel(status, daysLeft) {
  if (status === 'EXPIRED') return daysLeft !== null && daysLeft < -1 ? `Vencido hace ${Math.abs(daysLeft)} d` : 'Vencido';
  if (daysLeft === 0) return 'Vence hoy';
  if (daysLeft === 1) return 'Vence mañana';
  if (status === 'OK') return `${daysLeft} d`;
  return `Vence en ${daysLeft} d`;
}

/**
 * Insignia de vencimiento: verde normal, ámbar con pulso suave (próximo a vencer),
 * rojo con énfasis (crítico) y rojo sólido (vencido). Sin fecha de vencimiento no muestra nada.
 */
export default function ExpiryBadge({ status, daysLeft, className = '' }) {
  if (!status || status === 'NO_EXPIRY') return null;
  const style = STYLES[status] || STYLES.OK;
  const Icon = style.icon;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${style.box} ${style.anim} ${className}`}
      title={status === 'EXPIRED' ? 'Lote vencido: retirar de la venta' : status === 'RED' ? 'Crítico: retiro o liquidación urgente' : status === 'YELLOW' ? 'Próximo a vencer' : 'Vigente'}
    >
      <Icon className="h-3 w-3" aria-hidden="true" />
      {expiryLabel(status, daysLeft)}
    </span>
  );
}
