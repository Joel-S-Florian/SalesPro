import React from 'react';

/** Marca de FACTOS (la misma «F» de la página de promoción). `Logo` agrega el nombre al lado. */
export function LogoMark({ className = 'h-8 w-8' }) {
  return (
    <svg viewBox="0 0 64 64" className={`${className} shrink-0`} role="img" aria-label="FACTOS">
      <rect width="64" height="64" rx="14" fill="#4f46e5" />
      <path d="M20 18h26v7H29v6h14v7H29v10h-9z" fill="#fff" />
    </svg>
  );
}

export default function Logo({ size = 'h-8 w-8', textClass = 'text-lg', showName = true }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <LogoMark className={size} />
      {showName && <span className={`${textClass} font-extrabold tracking-wider text-slate-900 dark:text-white font-display`}>FACTOS</span>}
    </span>
  );
}
