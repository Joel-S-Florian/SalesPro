import React, { useState } from 'react';
import { ArrowRight, CheckCircle2, Loader2, MessageCircle } from 'lucide-react';
import { API_URL, BUSINESS_TYPES, CONTACT_EMAIL, WHATSAPP, whatsappHref } from '../config';

const field =
  'h-12 w-full rounded-xl border border-white/15 bg-white/5 px-4 text-[15px] text-white placeholder:text-white/40 outline-none focus:border-brand focus:bg-white/10';

/**
 * Solicitud de acceso: se envía al API de FACTOS (`POST /public/leads`) y queda en la bandeja del equipo.
 * Si el API no responde, el formulario cae a un correo preparado con los mismos datos para no perder al interesado.
 */
export default function Contact() {
  const [form, setForm] = useState({ name: '', business: '', type: BUSINESS_TYPES[0], contact: '', note: '' });
  const [status, setStatus] = useState('idle'); // idle | sending | sent | fallback
  const [error, setError] = useState('');
  const set = key => e => setForm(prev => ({ ...prev, [key]: e.target.value }));

  const message = () =>
    [
      'Hola, quiero más información sobre FACTOS.',
      '',
      `Nombre: ${form.name}`,
      `Negocio: ${form.business} (${form.type})`,
      `Contacto: ${form.contact}`,
      form.note ? `Comentario: ${form.note}` : '',
    ]
      .filter(Boolean)
      .join('\n');

  const openMail = () => {
    const subject = encodeURIComponent(`Consulta sobre FACTOS: ${form.business}`);
    window.location.href = `mailto:${CONTACT_EMAIL}?subject=${subject}&body=${encodeURIComponent(message())}`;
  };

  const submit = async event => {
    event.preventDefault();
    setError('');
    setStatus('sending');
    try {
      const response = await fetch(`${API_URL}/public/leads`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          business: form.business,
          businessType: form.type,
          contact: form.contact,
          note: form.note,
          website: form.website || '',
        }),
      });
      if (response.status === 429) throw new Error('Ya recibimos varias solicitudes desde tu conexión. Intenta de nuevo más tarde.');
      if (!response.ok) throw new Error('validation');
      setStatus('sent');
    } catch (err) {
      if (err instanceof TypeError) {
        // Sin conexión con el servidor: se ofrece el correo como alternativa
        setStatus('fallback');
        openMail();
        return;
      }
      setStatus('idle');
      setError(err.message === 'validation' ? 'Revisa los datos: el nombre, el negocio y el contacto son obligatorios.' : err.message);
    }
  };

  return (
    <section id="acceso" className="relative overflow-hidden bg-ink py-20 text-white sm:py-28">
      <div className="pointer-events-none absolute -left-32 bottom-0 h-96 w-96 rounded-full bg-brand/25 blur-[110px]" aria-hidden="true" />
      <div className="container-x relative grid gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
        <div>
          <p className="eyebrow !text-mint">Contacto</p>
          <h2 className="mt-3 text-4xl font-semibold leading-tight sm:text-5xl">¿Tienes dudas o necesitas algo a tu medida?</h2>
          <p className="mt-5 max-w-md text-lg leading-relaxed text-white/70">
            Si manejas varias sucursales, quieres que te avisemos cuando abran los planes de pago o prefieres que te acompañemos en la puesta en marcha, cuéntanos y te escribimos.
          </p>
          {WHATSAPP && (
            <a
              href={whatsappHref()}
              className="btn btn-ghost-dark press mt-8"
              target="_blank"
              rel="noreferrer"
            >
              <MessageCircle className="h-4 w-4" /> Escribir por WhatsApp
            </a>
          )}
        </div>

        {status === 'sent' ? (
          <div className="rounded-2xl border border-white/12 bg-white/[0.04] p-8 text-center sm:p-10" role="status">
            <CheckCircle2 className="mx-auto h-12 w-12 text-mint" strokeWidth={1.75} />
            <h3 className="mt-5 text-2xl font-semibold">¡Solicitud recibida!</h3>
            <p className="mx-auto mt-3 max-w-sm leading-relaxed text-white/70">
              Gracias, {form.name.split(' ')[0]}. Recibimos tu mensaje y te escribiremos a <strong className="text-white">{form.contact}</strong> muy pronto.
            </p>
            {WHATSAPP && (
              <a href={whatsappHref()} className="btn btn-ghost-dark press mt-6" target="_blank" rel="noreferrer">
                <MessageCircle className="h-4 w-4" /> ¿Prefieres hablarlo ya? Escríbenos por WhatsApp
              </a>
            )}
          </div>
        ) : (
        <form onSubmit={submit} className="space-y-4 rounded-2xl border border-white/12 bg-white/[0.04] p-6 sm:p-8" aria-label="Contacto">
          {/* Campo trampa para bots: oculto a las personas */}
          <div className="absolute -left-[9999px] h-0 w-0 overflow-hidden" aria-hidden="true">
            <label htmlFor="lead-website">Sitio web</label>
            <input id="lead-website" tabIndex={-1} autoComplete="off" value={form.website || ''} onChange={set('website')} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label htmlFor="lead-name" className="text-sm font-medium text-white/80">Tu nombre</label>
              <input id="lead-name" required autoComplete="name" value={form.name} onChange={set('name')} className={field} />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="lead-business" className="text-sm font-medium text-white/80">Nombre del negocio</label>
              <input id="lead-business" required autoComplete="organization" value={form.business} onChange={set('business')} className={field} />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="lead-type" className="text-sm font-medium text-white/80">Tipo de negocio</label>
              <select id="lead-type" value={form.type} onChange={set('type')} className={`${field} [&>option]:text-ink`}>
                {BUSINESS_TYPES.map(type => (
                  <option key={type}>{type}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="lead-contact" className="text-sm font-medium text-white/80">WhatsApp o correo</label>
              <input id="lead-contact" required autoComplete="email" value={form.contact} onChange={set('contact')} className={field} />
            </div>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="lead-note" className="text-sm font-medium text-white/80">¿Algo que debamos saber? (opcional)</label>
            <textarea id="lead-note" rows={3} value={form.note} onChange={set('note')} className={`${field} h-auto py-3`} placeholder="Cuántas cajas tienes, cuántos productos manejas…" />
          </div>
          <button type="submit" disabled={status === 'sending'} className="btn btn-primary press w-full disabled:opacity-60 sm:w-auto">
            {status === 'sending' ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Enviando…
              </>
            ) : (
              <>
                Enviar mensaje <ArrowRight className="h-4 w-4" />
              </>
            )}
          </button>
          <p className={`text-sm ${error ? 'text-rose-300' : 'text-white/55'}`} role={error ? 'alert' : 'status'}>
            {error ||
              (status === 'fallback'
                ? 'No pudimos conectar con el servidor, así que abrimos tu correo con los datos listos. Solo falta enviarlo.'
                : 'Te respondemos por el medio de contacto que nos dejes. No compartimos tus datos.')}
          </p>
        </form>
        )}
      </div>
    </section>
  );
}
