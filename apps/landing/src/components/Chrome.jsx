import { LEGAL_PAGES } from '@factos/shared/legal.js';
import React, { useEffect, useState } from 'react';
import { Menu, X } from 'lucide-react';
import { APP_URL, SIGNUP_URL } from '../config';

const LINKS = [
  ['#producto', 'Producto'],
  ['#funciones', 'Funciones'],
  ['#planes', 'Planes'],
  ['#preguntas', 'Preguntas'],
];

export function Logo({ dark = false }) {
  return (
    <a href="#inicio" className="flex items-center gap-2.5" aria-label="FACTOS, inicio">
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand text-[17px] font-bold text-white">F</span>
      <span className={`text-[17px] font-semibold tracking-[0.12em] ${dark ? 'text-white' : 'text-ink'}`}>FACTOS</span>
    </a>
  );
}

export function Nav() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  // Sobre el fondo oscuro del inicio la barra es transparente y usa texto claro
  const onDark = !scrolled && !open;
  const linkClass = onDark ? 'text-white/75 hover:text-white' : 'text-ink/70 hover:text-ink';

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header
      className={`fixed inset-x-0 top-0 z-40 transition-[background-color,box-shadow,backdrop-filter] duration-200 ${
        scrolled || open ? 'bg-paper/90 shadow-[0_1px_0_rgba(11,18,32,0.08)] backdrop-blur-md' : ''
      }`}
    >
      <div className="container-x flex h-16 items-center justify-between">
        <Logo dark={onDark} />
        <nav aria-label="Principal" className="hidden items-center gap-8 md:flex">
          {LINKS.map(([href, label]) => (
            <a key={href} href={href} className={`text-[15px] font-medium ${linkClass}`}>
              {label}
            </a>
          ))}
        </nav>
        <div className="hidden items-center gap-3 md:flex">
          <a href={APP_URL} className={`text-[15px] font-medium ${linkClass}`}>
            Entrar
          </a>
          <a href={SIGNUP_URL} className="btn btn-primary press !h-10 !px-4 !text-sm">
            Empezar gratis
          </a>
        </div>
        <button
          type="button"
          className={`flex h-11 w-11 items-center justify-center rounded-lg md:hidden cursor-pointer ${onDark ? 'text-white' : 'text-ink'}`}
          onClick={() => setOpen(v => !v)}
          aria-expanded={open}
          aria-label={open ? 'Cerrar menú' : 'Abrir menú'}
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {open && (
        <nav aria-label="Principal" className="container-x space-y-1 pb-5 md:hidden">
          {LINKS.map(([href, label]) => (
            <a key={href} href={href} onClick={() => setOpen(false)} className="block rounded-lg px-2 py-3 text-base font-medium">
              {label}
            </a>
          ))}
          <a href={APP_URL} className="block rounded-lg px-2 py-3 text-base font-medium">
            Entrar
          </a>
          <a href={SIGNUP_URL} className="btn btn-primary press mt-2 w-full">
            Empezar gratis
          </a>
        </nav>
      )}
    </header>
  );
}

export function Footer() {
  return (
    <footer className="bg-ink text-white/70">
      <div className="container-x flex flex-col gap-8 py-12 md:flex-row md:items-start md:justify-between">
        <div className="max-w-xs space-y-3">
          <Logo dark />
          <p className="text-sm leading-relaxed">Punto de venta, inventario y cajas en la nube para negocios de República Dominicana.</p>
        </div>
        <nav aria-label="Legal" className="space-y-2 text-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-white/45">Legal</p>
          {LEGAL_PAGES.map(page => (
            <a key={page.id} href={page.path} className="block hover:text-white">
              {page.title}
            </a>
          ))}
        </nav>
        <nav aria-label="Pie de página" className="grid grid-cols-2 gap-x-12 gap-y-2 text-sm">
          {LINKS.map(([href, label]) => (
            <a key={href} href={href} className="hover:text-white">
              {label}
            </a>
          ))}
          <a href={SIGNUP_URL} className="hover:text-white">
            Crear cuenta gratis
          </a>
          <a href="#acceso" className="hover:text-white">
            Contacto
          </a>
          <a href={APP_URL} className="hover:text-white">
            Entrar al sistema
          </a>
        </nav>
      </div>
      <div className="border-t border-white/10">
        <p className="container-x py-5 text-xs text-white/45">
          © {new Date().getFullYear()} FACTOS. Todos los derechos reservados. Las imágenes del sistema usan datos de demostración.
        </p>
      </div>
    </footer>
  );
}
