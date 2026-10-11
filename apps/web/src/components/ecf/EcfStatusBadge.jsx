import React from 'react';
import { BadgeCheck, CircleAlert, Clock3, RefreshCw, ShieldAlert } from 'lucide-react';

/** Estados del comprobante electrónico frente a la DGII, con su texto, color e ícono. */
export const ECF_STATUS = {
  PENDING: { label: 'Por enviar', tone: 'slate', icon: Clock3 },
  SENT: { label: 'En la DGII', tone: 'sky', icon: RefreshCw },
  ACCEPTED: { label: 'Aceptado', tone: 'emerald', icon: BadgeCheck },
  CONDITIONAL: { label: 'Aceptado condicional', tone: 'emerald', icon: BadgeCheck },
  REJECTED: { label: 'Rechazado', tone: 'rose', icon: ShieldAlert },
  ERROR: { label: 'Reintentando', tone: 'amber', icon: CircleAlert },
  CONTINGENCY: { label: 'Contingencia', tone: 'amber', icon: CircleAlert },
};

const TONES = {
  slate: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  sky: 'bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300',
  emerald: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
  rose: 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300',
  amber: 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300',
};

/** Insignia del estado de un comprobante electrónico. No muestra nada si la venta no es electrónica. */
export default function EcfStatusBadge({ status, className = '' }) {
  const info = ECF_STATUS[status];
  if (!info) return null;
  const Icon = info.icon;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${TONES[info.tone]} ${className}`}>
      <Icon className={`h-3 w-3 ${status === 'SENT' ? 'motion-safe:animate-spin' : ''}`} aria-hidden="true" />
      {info.label}
    </span>
  );
}
