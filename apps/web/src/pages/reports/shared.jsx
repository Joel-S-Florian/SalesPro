import React, { useEffect, useRef, useState } from 'react';
import { ArrowDownRight, ArrowUpRight, FileSpreadsheet, FileText, FileDown, Minus, TriangleAlert } from 'lucide-react';
import Pagination from '../../components/Pagination';
import { Skeleton } from '../../components/Skeleton';
import { useClientPage } from '../../hooks/usePagedList';
import { exportToCSV, exportToPDF, exportToXLSX, generateFilename } from '../../utils/export';
import { money } from '../../utils/format';
import { notify } from '../../utils/notify';

/* ---------------------------------------------------------------- */
/* Fechas y formato                                                  */
/* ---------------------------------------------------------------- */

/** YYYY-MM-DD con la fecha local del navegador (no UTC: evita el corrimiento de un día por la noche). */
export function localISO(date) {
  const pad = n => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export const PRESETS = [
  { id: 'today', label: 'Hoy' },
  { id: 'yesterday', label: 'Ayer' },
  { id: '7d', label: 'Últimos 7 días' },
  { id: '30d', label: 'Últimos 30 días' },
  { id: 'month', label: 'Este mes' },
  { id: 'lastMonth', label: 'Mes pasado' },
  { id: 'quarter', label: 'Este trimestre' },
  { id: 'year', label: 'Este año' },
  { id: 'custom', label: 'Personalizado' },
];

export function presetRange(id) {
  const now = new Date();
  const day = offset => {
    const d = new Date(now);
    d.setDate(d.getDate() + offset);
    return d;
  };
  switch (id) {
    case 'today':
      return { from: localISO(now), to: localISO(now) };
    case 'yesterday':
      return { from: localISO(day(-1)), to: localISO(day(-1)) };
    case '7d':
      return { from: localISO(day(-6)), to: localISO(now) };
    case '30d':
      return { from: localISO(day(-29)), to: localISO(now) };
    case 'month':
      return { from: localISO(new Date(now.getFullYear(), now.getMonth(), 1)), to: localISO(now) };
    case 'lastMonth':
      return {
        from: localISO(new Date(now.getFullYear(), now.getMonth() - 1, 1)),
        to: localISO(new Date(now.getFullYear(), now.getMonth(), 0)),
      };
    case 'quarter':
      return { from: localISO(new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1)), to: localISO(now) };
    case 'year':
      return { from: localISO(new Date(now.getFullYear(), 0, 1)), to: localISO(now) };
    default:
      return null;
  }
}

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** "2026-10-05" -> "05/10"; "2026-10" -> "oct 26". */
export function periodLabel(period) {
  if (!period) return '';
  if (period.length === 7) return `${MONTHS[Number(period.slice(5)) - 1]} ${period.slice(2, 4)}`;
  return `${period.slice(8, 10)}/${period.slice(5, 7)}`;
}

export const WEEKDAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
export const num = value => Number(value || 0).toLocaleString('es-DO');
export const pctText = value => `${Number(value || 0).toLocaleString('es-DO', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
export const shortDate = value => (value ? new Date(value).toLocaleDateString('es-DO', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—');
export const PAYMENT_LABELS = { EFECTIVO: 'Efectivo', TARJETA: 'Tarjeta' };

export function periodText(range) {
  return range.from === range.to ? range.from : `${range.from} a ${range.to}`;
}

/* ---------------------------------------------------------------- */
/* Carga de datos                                                    */
/* ---------------------------------------------------------------- */

/** Carga un reporte. Conserva los datos anteriores mientras llegan los nuevos (sin pantalla de carga completa). */
export function useReport(fetcher, params) {
  const [state, setState] = useState({ data: null, loading: true, error: '' });
  const key = JSON.stringify(params);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const requestId = useRef(0);

  useEffect(() => {
    const id = ++requestId.current;
    setState(prev => ({ ...prev, loading: true, error: '' }));
    fetcherRef
      .current(JSON.parse(key))
      .then(data => id === requestId.current && setState({ data, loading: false, error: '' }))
      .catch(err => id === requestId.current && setState(prev => ({ ...prev, loading: false, error: err.message || 'No se pudo cargar el reporte' })));
  }, [key]);

  return state;
}

/** Contenedor común: error, primera carga con esqueleto y atenuado mientras se actualiza. */
export function ReportState({ report, children, skeleton = 'cards' }) {
  if (report.error && !report.data) {
    return <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-center text-sm text-red-600 dark:border-red-900/50 dark:bg-red-950/20 dark:text-red-400">{report.error}</div>;
  }
  if (!report.data) {
    return (
      <div className="space-y-4" aria-busy="true">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
        <Skeleton className={skeleton === 'cards' ? 'h-64 rounded-xl' : 'h-96 rounded-xl'} />
      </div>
    );
  }
  return (
    <div className={`space-y-5 transition-opacity duration-200 ${report.loading ? 'opacity-60' : ''}`} aria-busy={report.loading}>
      {report.error && (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600 dark:border-red-900/50 dark:bg-red-950/20">
          {report.error}
        </div>
      )}
      {children(report.data)}
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* Piezas visuales                                                   */
/* ---------------------------------------------------------------- */

const TONES = {
  indigo: 'bg-indigo-50 text-indigo-600 dark:bg-indigo-950/30 dark:text-indigo-400',
  emerald: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-400',
  amber: 'bg-amber-50 text-amber-600 dark:bg-amber-950/30 dark:text-amber-400',
  rose: 'bg-rose-50 text-rose-600 dark:bg-rose-950/30 dark:text-rose-400',
  blue: 'bg-blue-50 text-blue-600 dark:bg-blue-950/30 dark:text-blue-400',
};

/** Variación frente al período anterior. `invert` = que baje sea bueno (p. ej. descuentos). */
export function Change({ value, invert = false }) {
  if (value === null || value === undefined) {
    return <span className="inline-flex items-center gap-0.5 text-[11px] text-slate-400"><Minus className="h-3 w-3" /> sin comparar</span>;
  }
  const up = value > 0;
  const good = invert ? !up : up;
  const Icon = up ? ArrowUpRight : value < 0 ? ArrowDownRight : Minus;
  const tone = value === 0 ? 'text-slate-400' : good ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400';
  return (
    <span className={`inline-flex items-center gap-0.5 text-[11px] font-semibold ${tone}`}>
      <Icon className="h-3 w-3" />
      {Math.abs(value).toLocaleString('es-DO', { maximumFractionDigits: 1 })}% <span className="font-normal text-slate-400">vs. anterior</span>
    </span>
  );
}

export function Kpi({ label, value, icon: Icon, tone = 'indigo', change, invert, hint }) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-xl border border-slate-100 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="min-w-0 space-y-1">
        <span className="block text-[10px] font-mono uppercase tracking-wider text-slate-400">{label}</span>
        <p className="break-words text-xl font-bold leading-tight tabular-nums text-slate-900 dark:text-slate-50">{value}</p>
        {change !== undefined ? <Change value={change} invert={invert} /> : hint && <p className="text-[11px] text-slate-400">{hint}</p>}
      </div>
      {Icon && (
        <div className={`shrink-0 rounded-xl p-2.5 ${TONES[tone]}`}>
          <Icon className="h-5 w-5" />
        </div>
      )}
    </div>
  );
}

export function Panel({ title, subtitle, actions, children, className = '' }) {
  return (
    <section className={`rounded-xl border border-slate-100 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 ${className}`}>
      {(title || actions) && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-slate-50 pb-3 dark:border-slate-800">
          <div>
            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">{title}</h3>
            {subtitle && <p className="text-xs text-slate-400">{subtitle}</p>}
          </div>
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

export function Callout({ children }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-300">
      <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <div>{children}</div>
    </div>
  );
}

/** Barras horizontales con etiqueta y valor. */
export function BarList({ items, format = money, empty = 'Sin datos' }) {
  if (!items.length) return <p className="py-6 text-center text-sm text-slate-400">{empty}</p>;
  const max = Math.max(...items.map(i => Math.abs(i.value)), 1);
  return (
    <ul className="space-y-3">
      {items.map(item => (
        <li key={item.label} className="space-y-1">
          <div className="flex items-baseline justify-between gap-3 text-xs">
            <span className="truncate font-medium text-slate-700 dark:text-slate-300">{item.label}</span>
            <span className="shrink-0 font-mono text-slate-500 dark:text-slate-400">
              {format(item.value)}
              {item.sub && <span className="ml-2 text-slate-400">{item.sub}</span>}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
            <div
              className={`h-full rounded-full transition-[width] duration-500 ${item.value < 0 ? 'bg-rose-500' : 'bg-indigo-500'}`}
              style={{ width: `${(Math.abs(item.value) / max) * 100}%`, transitionTimingFunction: 'cubic-bezier(0.22,1,0.36,1)' }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

/**
 * Gráfico de barras en SVG. `data`: [{ label, value, prev? }]. Con `prev` dibuja la línea del período anterior.
 */
export function TrendChart({ data, format = money, height = 200, ariaLabel = 'Gráfico de tendencia' }) {
  const [hover, setHover] = useState(null);
  if (!data.length || data.every(d => !d.value && !d.prev)) {
    return <div className="flex h-40 items-center justify-center rounded-lg bg-slate-50 text-sm text-slate-400 dark:bg-slate-800/40">Sin movimientos en este período</div>;
  }
  const W = 640;
  const pad = { l: 48, r: 8, t: 10, b: 24 };
  const iw = W - pad.l - pad.r;
  const ih = height - pad.t - pad.b;
  const max = Math.max(...data.map(d => Math.max(d.value, d.prev || 0)), 1);
  const slot = iw / data.length;
  const bar = Math.max(2, Math.min(28, slot * 0.7));
  const y = v => pad.t + ih - (Math.max(v, 0) / max) * ih;
  const every = Math.ceil(data.length / 8);
  const hasPrev = data.some(d => d.prev !== undefined);
  const prevPath = hasPrev
    ? data.map((d, i) => `${i === 0 ? 'M' : 'L'} ${pad.l + slot * i + slot / 2} ${y(d.prev || 0)}`).join(' ')
    : '';

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${height}`} role="img" aria-label={ariaLabel} className="h-auto w-full select-none overflow-visible">
        {[0, 0.5, 1].map(r => (
          <g key={r}>
            <line x1={pad.l} x2={W - pad.r} y1={y(max * r)} y2={y(max * r)} className="stroke-slate-100 dark:stroke-slate-800" strokeDasharray="4 4" />
            <text x={pad.l - 6} y={y(max * r) + 3} textAnchor="end" className="fill-slate-400 font-mono text-[9px]">
              {max * r >= 1000 ? `${Math.round((max * r) / 1000)}k` : Math.round(max * r)}
            </text>
          </g>
        ))}
        {data.map((d, i) => {
          const x = pad.l + slot * i + (slot - bar) / 2;
          const top = y(d.value);
          return (
            <g key={d.label + i} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <rect x={pad.l + slot * i} y={pad.t} width={slot} height={ih} fill="transparent" />
              <rect
                x={x}
                y={top}
                width={bar}
                height={Math.max(0, pad.t + ih - top)}
                rx={Math.min(4, bar / 2)}
                className={hover === i ? 'fill-indigo-600' : 'fill-indigo-500/85 dark:fill-indigo-500'}
              />
              {i % every === 0 && (
                <text x={x + bar / 2} y={height - 6} textAnchor="middle" className="fill-slate-400 font-mono text-[9px]">
                  {d.label}
                </text>
              )}
            </g>
          );
        })}
        {hasPrev && <path d={prevPath} fill="none" strokeWidth="1.5" strokeDasharray="4 3" className="stroke-slate-400" />}
      </svg>
      {hover !== null && (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 rounded-lg bg-slate-900/95 px-2.5 py-1.5 font-mono text-[11px] text-white shadow-xl"
          style={{ left: `${((pad.l + slot * hover + slot / 2) / W) * 100}%`, top: 0 }}
        >
          <p className="text-slate-300">{data[hover].label}</p>
          <p className="font-semibold text-indigo-300">{format(data[hover].value)}</p>
          {data[hover].prev !== undefined && <p className="text-slate-400">Anterior: {format(data[hover].prev)}</p>}
        </div>
      )}
      {hasPrev && (
        <p className="mt-1 flex items-center gap-3 text-[11px] text-slate-400">
          <span className="inline-flex items-center gap-1"><i className="h-2 w-2 rounded-sm bg-indigo-500" /> Período actual</span>
          <span className="inline-flex items-center gap-1"><i className="h-0 w-4 border-t border-dashed border-slate-400" /> Período anterior</span>
        </p>
      )}
    </div>
  );
}

/** Mapa de calor día de la semana × hora. `grid[7][24]` con conteos. */
export function Heatmap({ grid, peak }) {
  const max = Math.max(...grid.flat(), 1);
  const hours = Array.from({ length: 24 }, (_, h) => h);
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[560px]">
        <div className="mb-1 grid pl-9" style={{ gridTemplateColumns: 'repeat(24, minmax(0, 1fr))' }}>
          {hours.map(h => (
            <span key={h} className="text-center font-mono text-[9px] text-slate-400">{h % 3 === 0 ? h : ''}</span>
          ))}
        </div>
        {grid.map((row, d) => (
          <div key={d} className="mb-0.5 flex items-center gap-1">
            <span className="w-8 shrink-0 text-[10px] text-slate-400">{WEEKDAYS[d]}</span>
            <div className="grid flex-1 gap-0.5" style={{ gridTemplateColumns: 'repeat(24, minmax(0, 1fr))' }}>
              {row.map((count, h) => (
                <div
                  key={h}
                  title={`${WEEKDAYS[d]} ${String(h).padStart(2, '0')}:00 — ${count} ${count === 1 ? 'venta' : 'ventas'}`}
                  className={`h-5 rounded-[3px] ${count === 0 ? 'bg-slate-100 dark:bg-slate-800/60' : 'bg-indigo-500'} ${peak && peak.weekday === d && peak.hour === h ? 'ring-2 ring-amber-400' : ''}`}
                  style={count ? { opacity: 0.2 + (count / max) * 0.8 } : undefined}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* Tablas y exportación                                              */
/* ---------------------------------------------------------------- */

function formatCell(column, row) {
  const value = row[column.key];
  if (column.render) return column.render(row);
  if (value === null || value === undefined || value === '') return '—';
  switch (column.type) {
    case 'money':
      return money(value);
    case 'number':
      return num(value);
    case 'percent':
      return pctText(value);
    default:
      return value;
  }
}

/** Valor como texto plano para PDF. */
function plainCell(column, row) {
  const value = row[column.key];
  if (column.text) return column.text(row);
  if (value === null || value === undefined) return '';
  if (column.type === 'money') return money(value);
  if (column.type === 'percent') return pctText(value);
  return String(value);
}

export function ExportBar({ title, columns, rows, range, name, disabled }) {
  const [busy, setBusy] = useState(false);
  const btn =
    'inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800';
  const filename = generateFilename(name || title, range || {});

  const run = async kind => {
    try {
      setBusy(true);
      if (kind === 'xlsx') {
        await exportToXLSX({ title, subtitle: range ? `Período: ${periodText(range)}` : undefined, columns, rows, filename });
      } else if (kind === 'csv') {
        exportToCSV(rows, filename, columns);
      } else {
        exportToPDF(range ? `${title} · ${periodText(range)}` : title, columns, rows.map(r => Object.fromEntries(columns.map(c => [c.key, plainCell(c, r)]))), filename);
      }
    } catch (err) {
      notify.error(err.message || 'No se pudo exportar el reporte');
    } finally {
      setBusy(false);
    }
  };

  const off = disabled || busy || rows.length === 0;
  return (
    <div className="flex flex-wrap gap-1.5">
      <button type="button" className={btn} disabled={off} onClick={() => run('xlsx')} aria-label={`Exportar ${title} a Excel`}>
        <FileSpreadsheet className="h-3.5 w-3.5" /> Excel
      </button>
      <button type="button" className={btn} disabled={off} onClick={() => run('pdf')} aria-label={`Exportar ${title} a PDF`}>
        <FileText className="h-3.5 w-3.5" /> PDF
      </button>
      <button type="button" className={btn} disabled={off} onClick={() => run('csv')} aria-label={`Exportar ${title} a CSV`}>
        <FileDown className="h-3.5 w-3.5" /> CSV
      </button>
    </div>
  );
}

/**
 * Tabla de reporte con paginación en el navegador y barra de exportación opcional.
 * columns: [{ key, label, type?: 'text'|'money'|'number'|'percent', align?, bold?, mono?, render?, text? }]
 */
export function ReportTable({ title, columns, rows, range, name, empty = 'Sin datos en este período', exportable = true, subtitle, rowKey }) {
  const pager = useClientPage(rows);
  const alignOf = c => (c.align || (c.type && c.type !== 'text' ? 'right' : 'left'));
  const cls = { left: 'text-left', right: 'text-right', center: 'text-center' };

  const table = (
    <>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-slate-100 font-mono text-slate-400 dark:border-slate-800">
              {columns.map(c => (
                <th key={c.key} scope="col" className={`whitespace-nowrap pb-2 pr-3 font-normal ${cls[alignOf(c)]}`}>{c.label}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
            {pager.rows.map((row, i) => (
              <tr key={rowKey ? rowKey(row) : row.id || row.key || i} className="text-slate-600 hover:bg-slate-50/60 dark:text-slate-400 dark:hover:bg-slate-800/30">
                {columns.map(c => (
                  <td
                    key={c.key}
                    className={`py-2.5 pr-3 ${cls[alignOf(c)]} ${c.bold ? 'font-semibold text-slate-800 dark:text-slate-200' : ''} ${c.mono || (c.type && c.type !== 'text') ? 'font-mono tabular-nums' : ''}`}
                  >
                    {formatCell(c, row)}
                  </td>
                ))}
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="py-8 text-center text-slate-400">{empty}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <Pagination page={pager.page} pageSize={pager.pageSize} total={pager.total} onPageChange={pager.setPage} onPageSizeChange={pager.setPageSize} noun="filas" />
    </>
  );

  if (!title) return table;
  return (
    <Panel
      title={title}
      subtitle={subtitle}
      actions={exportable ? <ExportBar title={title} columns={columns} rows={rows} range={range} name={name} /> : null}
    >
      {table}
    </Panel>
  );
}
