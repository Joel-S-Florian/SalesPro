import React from 'react';
import { motion } from 'motion/react';
import { SIGNUP_URL } from '../config';
import { PLANS as SHARED_PLANS, PLAN_IDS, planFeatureLines } from '@factos/shared/plans.js';
import { BarChart3, Building2, Calculator, Check, ChevronDown, FileUp, Printer, ScanLine, Truck } from 'lucide-react';

const reveal = {
  initial: { opacity: 0, y: 16 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: '-80px' },
  transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] },
};

function Heading({ eyebrow, title, children, dark = false }) {
  return (
    <div className="max-w-2xl">
      <p className={`eyebrow ${dark ? '!text-mint' : ''}`}>{eyebrow}</p>
      <h2 className={`mt-3 text-4xl font-semibold leading-tight sm:text-5xl ${dark ? 'text-white' : ''}`}>{title}</h2>
      {children && <p className={`mt-4 text-lg leading-relaxed ${dark ? 'text-white/65' : 'text-ink/65'}`}>{children}</p>}
    </div>
  );
}

/* ---------- Para quién ---------- */
const AUDIENCE = ['Colmados y minimarkets', 'Ferreterías', 'Tiendas de ropa y calzado', 'Farmacias y perfumerías', 'Supermercados', 'Tiendas de electrodomésticos'];

export function Audience() {
  return (
    <section aria-label="Tipos de negocio" className="border-b border-ink/10 bg-paper">
      <div className="container-x flex flex-col gap-4 py-8 lg:flex-row lg:items-center lg:gap-10">
        <p className="shrink-0 text-sm font-medium text-ink/55">Hecho para negocios que venden todos los días</p>
        <ul className="flex flex-wrap gap-2">
          {AUDIENCE.map(item => (
            <li key={item} className="rounded-full border border-ink/12 bg-white px-3.5 py-1.5 text-sm font-medium text-ink/75">
              {item}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/* ---------- Funciones ---------- */
const FEATURES = [
  { icon: ScanLine, title: 'Escanea y cobra', span: 'lg:col-span-4', text: 'Con lector USB, con la cámara del celular o por puerto serie. Si el producto no existe te lo dice; si el lector repite una lectura por error, la ignora. Buscas por nombre o código y cobras con una tecla.' },
  { icon: Calculator, title: 'Cajas y cierre de turno', span: 'lg:col-span-2', text: 'Abres con el efectivo inicial y cierras con el reporte: ventas por método de pago, efectivo esperado y diferencia. Se imprime en formato ticket.' },
  { icon: FileUp, title: 'Importa tu inventario', span: 'lg:col-span-2', text: 'Sube la lista de tu proveedor en CSV, Excel o JSON. Revisas antes de aplicar: las filas con error se omiten y te dicen por qué. Imprime etiquetas con código de barras.' },
  { icon: Printer, title: 'Facturas y tickets', span: 'lg:col-span-2', text: 'Comprobantes en tamaño carta o ticket de 80 mm, con la tasa de ITBIS que configures. Reimprime cualquier venta desde el historial.' },
  { icon: BarChart3, title: 'Reportes que se entienden', span: 'lg:col-span-2', text: 'Ventas por producto, categoría, cliente y vendedor; productos con poco margen o poca existencia; flujo de caja del período.' },
  { icon: Building2, title: 'Tus datos, solo tuyos', span: 'lg:col-span-3', text: 'Cada empresa ve únicamente su información. Defines quién es administrador y quién vendedor, y las acciones sensibles (como quitar un artículo de una venta) piden autorización y quedan registradas.' },
  { icon: Truck, title: 'Proveedores y compras', span: 'lg:col-span-3', text: 'Registra lo que compras a cada proveedor y el costo promedio de tus productos se actualiza solo, para que sepas tu margen real.' },
];

export function Features() {
  return (
    <section id="funciones" className="bg-paper-deep py-20 sm:py-28">
      <div className="container-x">
        <Heading eyebrow="Funciones" title="Lo que necesitas para operar, sin lo que no usarías">
          Cada pieza resuelve algo del día a día de un negocio con caja: desde el primer escaneo hasta el cierre.
        </Heading>

        <div className="mt-12 grid gap-4 lg:grid-cols-6">
          {FEATURES.map(({ icon: Icon, title, text, span }, i) => (
            <motion.article
              key={title}
              {...reveal}
              transition={{ ...reveal.transition, delay: (i % 3) * 0.06 }}
              className={`rounded-2xl border border-ink/8 bg-white p-6 sm:p-7 ${span}`}
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-light text-brand">
                <Icon className="h-5 w-5" />
              </span>
              <h3 className="mt-5 text-xl font-semibold">{title}</h3>
              <p className="mt-2 leading-relaxed text-ink/65">{text}</p>
            </motion.article>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------- Cómo empezar (secuencia real) ---------- */
const STEPS = [
  ['Carga tu inventario', 'Importa tu lista de productos o créalos uno a uno. Los precios se calculan con el margen que elijas.'],
  ['Abre tu turno', 'El cajero indica con cuánto efectivo empieza. Cada venta queda ligada a su caja y a su turno.'],
  ['Escanea y cobra', 'Agregas productos, eliges efectivo o tarjeta, cobras e imprimes. El inventario baja en el acto.'],
  ['Cierra y revisa', 'Al terminar, el reporte del turno te dice cuánto debía haber en caja y cuánto hay realmente.'],
];

export function Steps() {
  return (
    <section className="bg-paper py-20 sm:py-28">
      <div className="container-x">
        <Heading eyebrow="Empezar" title="De la caja de producto a la primera venta, en una tarde" />
        <ol className="mt-12 grid gap-px overflow-hidden rounded-2xl border border-ink/10 bg-ink/10 md:grid-cols-2 lg:grid-cols-4">
          {STEPS.map(([title, text], i) => (
            <li key={title} className="bg-white p-6 sm:p-7">
              <span className="font-mono text-sm font-semibold text-brand">0{i + 1}</span>
              <h3 className="mt-4 text-lg font-semibold">{title}</h3>
              <p className="mt-2 text-[15px] leading-relaxed text-ink/65">{text}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

/* ---------- Fiscal ---------- */
export function Fiscal() {
  return (
    <section className="bg-ink py-20 text-white sm:py-24">
      <div className="container-x grid gap-12 lg:grid-cols-[1fr_1fr] lg:items-center">
        <Heading dark eyebrow="Pensado para República Dominicana" title="Tus comprobantes, con las reglas del país">
          Trabajamos con lo que tu negocio usa hoy y estamos construyendo lo que viene.
        </Heading>
        <div className="space-y-4">
          <ul className="space-y-3">
            {['ITBIS configurable (18 % por defecto) y aplicado a cada venta', 'Secuencia de comprobantes propia para cada empresa', 'Cédula y RNC de clientes validados al registrarlos', 'Facturas A4 y tickets de 80 mm'].map(line => (
              <li key={line} className="flex items-start gap-3 text-white/80">
                <Check className="mt-1 h-4 w-4 shrink-0 text-mint" strokeWidth={3} />
                {line}
              </li>
            ))}
          </ul>
          <div className="rounded-2xl border border-white/12 bg-white/5 p-5">
            <p className="flex items-center gap-2 text-sm font-semibold text-mint">
              <span className="h-1.5 w-1.5 rounded-full bg-mint" /> En desarrollo
            </p>
            <p className="mt-2 leading-relaxed text-white/75">
              <strong className="font-semibold text-white">Facturación electrónica (e-CF) con la DGII.</strong> Todavía no está disponible. Las empresas de la beta
              serán las primeras en probarla cuando esté lista.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---------- Planes ---------- */
// Los números salen de la fuente única de planes (packages/shared/plans.js): para cambiarlos se edita solo ese archivo
const PLANS = PLAN_IDS.map(id => ({
  name: SHARED_PLANS[id].name,
  price: `RD$ ${SHARED_PLANS[id].priceMonthlyDop.toLocaleString('es-DO')}`,
  note: SHARED_PLANS[id].priceMonthlyDop === 0 ? 'sin tarjeta de crédito' : 'por mes · precio provisional',
  features: planFeatureLines(id),
  featured: SHARED_PLANS[id].selfService,
}));

export function Pricing() {
  return (
    <section id="planes" className="bg-paper-deep py-20 sm:py-28">
      <div className="container-x">
        <Heading eyebrow="Planes" title="Empieza gratis hoy. Crece cuando lo necesites">
          Eliges tu plan, creas tu cuenta, configuras tu negocio y entras. Los planes de pago se activarán más adelante, sin cobro por usuario.
        </Heading>

        <div className="mt-12 grid gap-4 md:grid-cols-3">
          {PLANS.map(plan => (
            <article
              key={plan.name}
              className={`flex flex-col rounded-2xl p-6 sm:p-7 ${plan.featured ? 'bg-ink text-white shadow-frame' : 'border border-ink/10 bg-white'}`}
            >
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-lg font-semibold">{plan.name}</h3>
                {!plan.featured && <span className="rounded-full bg-paper-deep px-2.5 py-0.5 text-xs font-medium text-ink/55">Próximamente</span>}
              </div>
              <p className="mt-4 text-3xl font-semibold tabular-nums">{plan.price}</p>
              <p className={`text-sm ${plan.featured ? 'text-white/55' : 'text-ink/50'}`}>{plan.note}</p>
              <ul className={`mt-6 flex-1 space-y-3 text-[15px] ${plan.featured ? 'text-white/80' : 'text-ink/75'}`}>
                {plan.features.map(line => (
                  <li key={line} className="flex items-start gap-2.5">
                    <Check className={`mt-1 h-4 w-4 shrink-0 ${plan.featured ? 'text-mint' : 'text-brand'}`} strokeWidth={3} />
                    {line}
                  </li>
                ))}
              </ul>
              {plan.featured ? (
                <a href={SIGNUP_URL} className="btn btn-primary press mt-7">
                  Empezar gratis
                </a>
              ) : (
                <a href="#acceso" className="btn btn-ghost press mt-7">
                  Avísame cuando esté
                </a>
              )}
            </article>
          ))}
        </div>

        <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-ink/10 bg-white p-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-lg font-semibold">¿Necesitas más? Escríbenos</h3>
            <p className="mt-1 text-ink/65">Más cajas, usuarios o sucursales: armamos un plan a tu medida, sin precio de lista.</p>
          </div>
          <a href="#acceso" className="btn btn-ghost press shrink-0">
            Hablar con nosotros
          </a>
        </div>
      </div>
    </section>
  );
}

/* ---------- Preguntas ---------- */
const FAQ = [
  ['¿Necesito internet para vender?', 'Sí, por ahora FACTOS funciona en línea. El modo sin conexión está en nuestro plan de trabajo, pero todavía no está disponible.'],
  ['¿Qué equipo necesito?', 'Una computadora, tablet o celular con un navegador moderno. Un lector de códigos de barras USB es opcional (la cámara del celular también sirve), y para imprimir tickets puedes usar la impresora que ya tengas.'],
  ['¿Puedo pasar mi inventario actual?', 'Sí. Importas tu lista en CSV, Excel o JSON, revisas lo que se va a cargar y recién entonces se aplica. Si una fila viene con un error, se omite y te explicamos el motivo.'],
  ['¿Mis datos se mezclan con los de otras empresas?', 'No. Cada empresa tiene sus productos, clientes, ventas y usuarios separados, y lo verificamos con pruebas automáticas en cada versión.'],
  ['¿Y la factura electrónica (e-CF)?', 'Está en desarrollo y aún no está disponible. Hoy emites comprobantes con ITBIS y secuencia propia; cuando el e-CF esté listo, lo habilitaremos primero a las empresas de la beta.'],
  ['¿Cuánto cuesta?', 'Hoy puedes usar FACTOS gratis, sin tarjeta de crédito. Los planes de pago (precios provisionales, desde RD$ 1,500 al mes por empresa, sin cobro por usuario) se activarán más adelante, y te avisaremos antes de cualquier cambio.'],
];

export function Faq() {
  return (
    <section id="preguntas" className="bg-paper py-20 sm:py-28">
      <div className="container-x grid gap-12 lg:grid-cols-[0.8fr_1.2fr]">
        <Heading eyebrow="Preguntas frecuentes" title="Lo que casi todos preguntan antes de empezar" />
        <div className="divide-y divide-ink/10 border-y border-ink/10">
          {FAQ.map(([q, a]) => (
            <details key={q} className="group py-5">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-6 text-left text-lg font-medium [&::-webkit-details-marker]:hidden">
                {q}
                <ChevronDown className="h-5 w-5 shrink-0 text-ink/45 transition-transform duration-200 group-open:rotate-180" />
              </summary>
              <p className="mt-3 max-w-2xl leading-relaxed text-ink/65">{a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
