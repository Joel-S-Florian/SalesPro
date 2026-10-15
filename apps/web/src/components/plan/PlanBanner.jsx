import React from 'react';
import { AlertTriangle, Info } from 'lucide-react';
import { RESOURCES, planName } from '@factos/shared/plans.js';
import { useContact } from '../../hooks/queries';

/**
 * Aviso del plan en todo el sistema: prueba por terminar (3 días o menos), gracia con cuenta regresiva, plan rebajado por vencimiento,
 * excesos sobre el tope y ventas del mes al 80 % / 100 %. Nunca habla de bloquear ventas: no se bloquean.
 */
export default function PlanBanner({ usage, onViewPlans }) {
  const { data: contact } = useContact();
  if (!usage) return null;
  const messages = [];
  let tone = 'info';

  if (usage.status === 'PAID' && usage.daysLeft <= 5) {
    tone = 'warn';
    messages.push(`Tu suscripción del plan ${usage.planName} vence ${usage.daysLeft <= 1 ? 'en menos de un día' : `en ${usage.daysLeft} días`}. Después tendrás 7 días de gracia con los mismos límites. Escríbenos para renovarla.`);
  } else if (usage.status === 'TRIAL' && usage.daysLeft <= 3) {
    tone = 'warn';
    messages.push(`Tu prueba del plan ${usage.planName} termina ${usage.daysLeft <= 1 ? 'en menos de un día' : `en ${usage.daysLeft} días`}. Después tendrás 7 días de gracia con los mismos límites.`);
  } else if (usage.status === 'GRACE') {
    tone = 'warn';
    messages.push(`${usage.paid ? 'Tu suscripción venció' : 'Tu prueba terminó'}. Te quedan ${usage.graceDaysLeft === 1 ? '1 día' : `${usage.graceDaysLeft} días`} de gracia con tu plan ${usage.planName}; luego pasarás a los límites del plan Gratis. No se borra ningún dato.`);
  } else if (usage.status === 'EXPIRED' && usage.downgraded) {
    tone = 'warn';
    messages.push(`${usage.paid ? 'Tu suscripción y la gracia terminaron' : 'Tu prueba y la gracia terminaron'}: tu cuenta usa los límites del plan Gratis. No se borró nada y puedes exportar tus datos cuando quieras.`);
  }

  const exceeded = Object.entries(usage.usage).filter(([resource, u]) => resource !== 'salesPerMonth' && u.exceeded);
  if (exceeded.length) {
    tone = 'warn';
    const list = exceeded.map(([resource, u]) => `${u.current.toLocaleString('es-DO')} ${u.current === 1 ? RESOURCES[resource].singular : RESOURCES[resource].plural} (límite ${u.limit.toLocaleString('es-DO')})`).join(', ');
    messages.push(`Estás por encima de lo que incluye el plan ${planName(usage.effectivePlan)}: ${list}. No se desactivó nada, pero no podrás agregar más hasta liberar espacio o cambiar de plan.`);
  }

  const sales = usage.usage.salesPerMonth;
  if (sales.level) messages.push(`Llevas ${sales.current.toLocaleString('es-DO')} de ${sales.limit.toLocaleString('es-DO')} ventas incluidas este mes. Sigues vendiendo con normalidad: este aviso es solo informativo.`);

  if (messages.length === 0) return null;
  const Icon = tone === 'warn' ? AlertTriangle : Info;
  const palette =
    tone === 'warn'
      ? 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200'
      : 'border-indigo-100 bg-indigo-50 text-indigo-800 dark:border-indigo-900/50 dark:bg-indigo-950/30 dark:text-indigo-200';

  return (
    <div role="status" className={`mx-auto mb-5 flex max-w-7xl items-start gap-3 rounded-xl border px-4 py-2.5 text-[13px] ${palette}`}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="flex-1 space-y-1">
        {messages.map(message => (
          <p key={message}>{message}</p>
        ))}
      </div>
      {contact?.link && messages.some(m => /renovarla|gracia|venció|terminaron/.test(m)) && (
        <a href={contact.link} target="_blank" rel="noreferrer" className="shrink-0 rounded-lg border border-current/30 px-3 py-1 text-xs font-semibold">
          WhatsApp
        </a>
      )}
      {onViewPlans && (
        <button type="button" onClick={onViewPlans} className="shrink-0 rounded-lg border border-current/30 px-3 py-1 text-xs font-semibold cursor-pointer">
          Ver planes
        </button>
      )}
    </div>
  );
}
