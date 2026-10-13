# Sistema de diseño de FACTOS (interfaz)

Criterios que se aplican en toda la app. Basados en los principios de movimiento y detalle de Emil Kowalski y en las guías de
interfaz web de Vercel.

## Base
- **Tipografía:** IBM Plex Sans (texto y encabezados) e IBM Plex Mono (códigos). Cifras con ancho fijo (`tabular-nums`) en
  importes, tablas y totales. Fuentes por `<link>` con `preconnect` (no por `@import`).
- **Color:** neutros `slate` + un solo acento `indigo` reservado para la acción principal y la selección. Verde, ámbar y rojo
  solo para estado (éxito, atención, error o agotado).
- **Forma:** radios `lg` en controles y `xl`/`2xl` en tarjetas y paneles; sombras suaves y poco frecuentes. Campos de 40 px
  (44 px en pantallas táctiles: variante `[@media(pointer:coarse)]`).
- **Foco:** anillo visible solo con teclado (`:focus-visible`). `color-scheme` y `theme-color` por tema.

## Movimiento
- Curvas en `index.css`: `--ease-out: cubic-bezier(0.22, 1, 0.36, 1)`, `--ease-in-out: cubic-bezier(0.77, 0, 0.175, 1)`.
- Duraciones: pulsación 140 ms, paneles y menús 160–240 ms; nada de interfaz supera 300 ms.
- Todo botón se hunde al pulsar (`scale(0.97)`). Los menús se despliegan desde su botón; los modales, desde el centro.
- No se anima lo que se repite decenas de veces al día (cambiar de pestaña solo desvanece, 120 ms) ni las acciones de teclado.
- Las salidas son más rápidas que las entradas. Los avisos entran y salen por el mismo lado.
- **`prefers-reduced-motion`:** se quitan desplazamientos y brillos, pero se conservan los cambios de color y opacidad que
  explican qué cambió. Framer Motion está envuelto en `MotionConfig reducedMotion="user"`.
- Los `hover:` solo actúan en dispositivos con puntero (`hoverOnlyWhenSupported`).

## Componentes
| Componente | Uso |
|---|---|
| `utils/notify.js` + `ToastHost` | Avisos (`notify.success/error/warning/info`). **No usar `alert()`**. Los errores llevan `role="alert"` |
| `Skeleton` / `TableSkeleton` | Carga de listas: mantiene la estructura de la tabla |
| `Modal` | Cierra con Escape, `role="dialog"`, `overscroll-contain` |
| `Pagination` | Pie común de todos los listados |
| `ui/form.jsx` | `Field`, `inputClass` y botones primario y secundario del POS |
| `pos/AnimatedMoney` | Importe que cuenta hasta su nuevo valor |

## Accesibilidad
- Botones solo-ícono con `aria-label`; casillas y filas clicables con control real y etiqueta.
- Enlace "Saltar al contenido", `lang="es"`, autocompletado correcto en el login.
- Las pantallas se cargan con `React.lazy` + `Suspense` y un esqueleto de página.

## Desarrollo
`vite.config.js` pre-empaqueta las dependencias de las pantallas diferidas (`optimizeDeps`) para evitar el error
"Failed to fetch dynamically imported module" tras instalar dependencias nuevas. Si aparece, detenga `npm run dev` y borre
`apps/web/node_modules/.vite`.

## Smart Select (reemplazo del `<select>` nativo)

`apps/web/src/components/ui/SmartSelect.jsx`. Se ve como un select (borde redondeado, flecha) y abre un menú propio:

- **Barra de búsqueda** arriba (aparece con más de 7 opciones, o siempre si la búsqueda es del servidor); filtra en vivo sin distinguir mayúsculas ni acentos.
- **Carga visual de 8 en 8:** al abrir solo se dibujan las primeras 8 opciones (el orden lo da quien lo usa: lo más reciente primero); el resto aparece al llegar al final
  de la lista (scroll infinito) o al buscar. Un pie indica «Mostrando 8 de N».
- **Cierre automático:** al elegir, con Escape (sin cerrar el modal que lo contiene) o al hacer clic fuera. Teclado: flechas, Enter, Inicio/Fin.
- El menú va en un portal (no lo recortan modales ni tablas) y se abre hacia arriba si abajo no hay espacio. Roles ARIA `combobox`/`listbox`.
- **Reemplazo directo:** acepta `<option>` como hijos y llama `onChange({ target: { value, name, id } })`; `required` conserva la validación del formulario.
- **Listas largas del servidor:** `onSearch(texto)` (con espera de 250 ms), `loading` y `options`; ver `components/ProductPicker.jsx`.
- Regla del proyecto: no usar `<select>` nativo (todos los de la aplicación ya fueron reemplazados, 45 en 22 archivos).
