import React from 'react';

/** Bloque con brillo animado para estados de carga (respeta prefers-reduced-motion vía CSS). */
export function Skeleton({ className = '' }) {
  return <div aria-hidden="true" className={`skeleton rounded-md ${className}`} />;
}

/** Filas de tabla en carga: mantiene la estructura de la tabla mientras llegan los datos. */
export function TableSkeleton({ rows = 5, columns = 5 }) {
  return Array.from({ length: rows }, (_, row) => (
    <tr key={row} aria-hidden="true">
      {Array.from({ length: columns }, (_, col) => (
        <td key={col} className="px-4 py-3.5">
          <Skeleton className={`h-3.5 ${col === 0 ? 'w-40' : 'w-16'}`} />
        </td>
      ))}
    </tr>
  ));
}
