import React, { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';

const TABS = [
  {
    id: 'cobrar',
    title: 'Cobra en segundos',
    text: 'Escanea el código, toca el producto o búscalo por nombre. El ticket se arma solo, con ITBIS y método de pago, y cobras con F9.',
    kind: 'desktop',
    crop: true,
    images: [['/img/pos-desktop.jpg', 'Pantalla de venta de FACTOS con el catálogo de productos y el ticket de la venta a la derecha']],
  },
  {
    id: 'cliente',
    title: 'Pantalla para tu cliente',
    text: 'Abre una segunda pantalla de cara al cliente: ve cada artículo y el total en grande a medida que lo registras. Al cobrar, le agradece por su compra.',
    kind: 'desktop',
    images: [['/img/customer-display.jpg', 'Pantalla del cliente mostrando la lista de artículos y el total a pagar en grande']],
  },
  {
    id: 'movil',
    title: 'También en el celular y la tablet',
    text: 'El sistema se adapta a pantallas táctiles: el ticket sube desde abajo, los botones son grandes y la cámara del celular puede hacer de lector.',
    kind: 'phones',
    images: [
      ['/img/pos-mobile-catalog.jpg', 'Catálogo de productos en un celular'],
      ['/img/pos-mobile-ticket.jpg', 'Ticket de la venta abierto desde la parte inferior del celular'],
    ],
  },
  {
    id: 'control',
    title: 'Tus números, sin cuadrar a mano',
    text: 'Ventas del día, productos que se están acabando y rentabilidad en un solo lugar. Cada turno de caja cierra con su reporte y su diferencia.',
    kind: 'desktop',
    crop: true,
    images: [['/img/dashboard.jpg', 'Panel de control con ventas, existencias bajas y resumen del negocio']],
  },
];

// `crop` recorta el menú lateral de la captura para que el contenido se lea más grande
function BrowserFrame({ src, alt, crop }) {
  return (
    <div className="overflow-hidden rounded-xl bg-white shadow-frame">
      <div className="flex h-8 items-center gap-1.5 border-b border-ink/10 bg-paper-deep px-3" aria-hidden="true">
        <span className="h-2.5 w-2.5 rounded-full bg-ink/15" />
        <span className="h-2.5 w-2.5 rounded-full bg-ink/15" />
        <span className="h-2.5 w-2.5 rounded-full bg-ink/15" />
      </div>
      <div className="overflow-hidden">
        <img
          src={src}
          alt={alt}
          width="1440"
          height="900"
          loading="lazy"
          className={crop ? 'block w-[121.6%] max-w-none -ml-[21.6%]' : 'block w-full'}
        />
      </div>
    </div>
  );
}

function PhoneFrame({ src, alt }) {
  return (
    <div className="w-[46%] max-w-[15rem] overflow-hidden rounded-[1.6rem] border-[6px] border-ink bg-ink shadow-frame">
      <img src={src} alt={alt} width="390" height="844" loading="lazy" className="block w-full rounded-[1.1rem]" />
    </div>
  );
}

export default function Tour() {
  const [active, setActive] = useState(TABS[0].id);
  const tab = TABS.find(t => t.id === active);

  return (
    <section id="producto" className="bg-paper py-20 sm:py-28">
      <div className="container-x">
        <div className="max-w-2xl">
          <p className="eyebrow">El sistema por dentro</p>
          <h2 className="mt-3 text-4xl font-semibold leading-tight sm:text-5xl">Así se ve vender con FACTOS</h2>
          <p className="mt-4 text-lg text-ink/65">Capturas reales del sistema, con datos de demostración.</p>
        </div>

        <div className="mt-12 grid gap-10 lg:grid-cols-[22rem_1fr] lg:gap-14">
          <div role="tablist" aria-label="Partes del sistema" className="flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible">
            {TABS.map(item => {
              const selected = item.id === active;
              return (
                <button
                  key={item.id}
                  role="tab"
                  type="button"
                  aria-selected={selected}
                  aria-controls="tour-panel"
                  id={`tour-tab-${item.id}`}
                  onClick={() => setActive(item.id)}
                  className={`relative shrink-0 rounded-xl px-4 py-3.5 text-left cursor-pointer lg:shrink ${
                    selected ? 'bg-white shadow-[0_1px_0_rgba(11,18,32,0.06),0_8px_24px_-12px_rgba(11,18,32,0.25)]' : 'hover:bg-white/60'
                  }`}
                >
                  {selected && <motion.span layoutId="tour-bar" className="absolute inset-y-3 left-0 w-[3px] rounded-full bg-brand" />}
                  <span className={`block text-[15px] font-semibold ${selected ? 'text-ink' : 'text-ink/65'}`}>{item.title}</span>
                  <span className={`mt-1 hidden text-sm leading-relaxed text-ink/60 lg:block ${selected ? '' : 'lg:hidden'}`}>{item.text}</span>
                </button>
              );
            })}
          </div>

          <div id="tour-panel" role="tabpanel" aria-labelledby={`tour-tab-${active}`} className="min-w-0">
            <p className="mb-5 text-[15px] leading-relaxed text-ink/70 lg:hidden">{tab.text}</p>
            <AnimatePresence mode="wait">
              <motion.div
                key={tab.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, transition: { duration: 0.1 } }}
                transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                className={tab.kind === 'phones' ? 'flex justify-center gap-5 rounded-2xl bg-paper-deep px-4 py-10 sm:gap-8' : ''}
              >
                {tab.kind === 'phones'
                  ? tab.images.map(([src, alt]) => <PhoneFrame key={src} src={src} alt={alt} />)
                  : tab.images.map(([src, alt]) => <BrowserFrame key={src} src={src} alt={alt} crop={tab.crop} />)}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>
    </section>
  );
}
