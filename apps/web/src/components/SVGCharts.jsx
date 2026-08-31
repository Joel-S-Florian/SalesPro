import React, { useState } from 'react';
import { motion } from 'motion/react';

export function SalesTrendChart({ data }) {
  const [hoveredIndex, setHoveredIndex] = useState(null);

  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 bg-slate-50 dark:bg-slate-900 rounded-lg text-slate-400">
        Sin datos de ventas para mostrar
      </div>
    );
  }

  // Calculate coordinates for SVG area/line chart
  const height = 180;
  const width = 500;
  const paddingLeft = 50;
  const paddingRight = 20;
  const paddingTop = 20;
  const paddingBottom = 30;

  const chartWidth = width - paddingLeft - paddingRight;
  const chartHeight = height - paddingTop - paddingBottom;

  const maxAmount = Math.max(...data.map(d => d.amount), 500);

  // Map to points
  const points = data.map((d, index) => {
    const x = paddingLeft + (index / (data.length - 1)) * chartWidth;
    const y = paddingTop + chartHeight - (d.amount / maxAmount) * chartHeight;
    return { x, y, data: d };
  });

  // SVG Path generator
  let linePath = '';
  let areaPath = '';

  if (points.length > 0) {
    linePath = `M ${points[0].x} ${points[0].y} ` + points.slice(1).map(p => `L ${p.x} ${p.y}`).join(' ');
    areaPath = `${linePath} L ${points[points.length - 1].x} ${paddingTop + chartHeight} L ${points[0].x} ${paddingTop + chartHeight} Z`;
  }

  // Draw 4 horizontal gridlines
  const gridLines = [0, 0.33, 0.66, 1].map(ratio => {
    const val = maxAmount * ratio;
    const y = paddingTop + chartHeight - ratio * chartHeight;
    return { val, y };
  });

  return (
    <div className="w-full bg-white dark:bg-slate-900 rounded-xl p-5 border border-slate-100 dark:border-slate-800 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h4 className="font-semibold text-slate-800 dark:text-slate-200 text-sm tracking-tight font-sans">
          Tendencia de Ventas (Últimos 7 Días)
        </h4>
        <span className="text-xs font-mono text-slate-400 bg-slate-50 dark:bg-slate-800 px-2.5 py-1 rounded-full">
          Total Hoy: ${data[data.length - 1]?.amount.toFixed(2) || '0.00'}
        </span>
      </div>

      <div className="relative w-full">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto overflow-visible select-none">
          {/* Horizontal Grid lines */}
          {gridLines.map((line, idx) => (
            <g key={idx}>
              <line
                x1={paddingLeft}
                y1={line.y}
                x2={width - paddingRight}
                y2={line.y}
                className="stroke-slate-100 dark:stroke-slate-800 stroke-1 stroke-dasharray-[4,4]"
                strokeDasharray="4 4"
              />
              <text
                x={paddingLeft - 10}
                y={line.y + 4}
                textAnchor="end"
                className="fill-slate-400 text-[9px] font-mono"
              >
                ${Math.round(line.val)}
              </text>
            </g>
          ))}

          {/* Fill Area with gradient */}
          <defs>
            <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#6366f1" stopOpacity="0.25" />
              <stop offset="100%" stopColor="#6366f1" stopOpacity="0.00" />
            </linearGradient>
          </defs>

          {points.length > 0 && (
            <>
              {/* Area */}
              <motion.path
                initial={{ pathLength: 0, opacity: 0 }}
                animate={{ pathLength: 1, opacity: 1 }}
                transition={{ duration: 0.8, ease: 'easeOut' }}
                d={areaPath}
                fill="url(#areaGrad)"
              />

              {/* Line */}
              <motion.path
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 0.8, ease: 'easeOut' }}
                d={linePath}
                fill="none"
                className="stroke-indigo-500 dark:stroke-indigo-400"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </>
          )}

          {/* Data Points / Circles */}
          {points.map((pt, idx) => (
            <g key={idx}>
              <circle
                cx={pt.x}
                cy={pt.y}
                r={hoveredIndex === idx ? 6 : 4}
                className={`fill-white dark:fill-slate-900 stroke-indigo-500 dark:stroke-indigo-400 stroke-[2.5px] cursor-pointer transition-all duration-150`}
                onMouseEnter={() => setHoveredIndex(idx)}
                onMouseLeave={() => setHoveredIndex(null)}
              />
              {/* X Axis labels */}
              <text
                x={pt.x}
                y={paddingTop + chartHeight + 18}
                textAnchor="middle"
                className="fill-slate-400 dark:fill-slate-500 text-[10px] font-mono font-medium"
              >
                {pt.data.day}
              </text>
            </g>
          ))}
        </svg>

        {/* Dynamic Tooltip */}
        {hoveredIndex !== null && (
          <div
            className="absolute z-10 bg-slate-900/95 dark:bg-slate-950 text-white p-2.5 rounded-lg text-xs shadow-xl border border-slate-800 backdrop-blur-sm pointer-events-none transition-all duration-150 font-mono"
            style={{
              left: `${(points[hoveredIndex].x / width) * 100}%`,
              top: `${Math.max(0, (points[hoveredIndex].y / height) * 100 - 32)}%`,
              transform: 'translateX(-50%)',
            }}
          >
            <p className="font-semibold text-slate-200">Fecha: {data[hoveredIndex].day}</p>
            <p className="text-indigo-400">Total: ${data[hoveredIndex].amount.toFixed(2)}</p>
            <p className="text-slate-400">Ventas: {data[hoveredIndex].count} trans.</p>
          </div>
        )}
      </div>
    </div>
  );
}

export function TopProductsChart({ data }) {
  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 bg-slate-50 dark:bg-slate-900 rounded-lg text-slate-400">
        Sin datos de productos para mostrar
      </div>
    );
  }

  const maxQty = Math.max(...data.map(d => d.quantity), 1);

  return (
    <div className="w-full bg-white dark:bg-slate-900 rounded-xl p-5 border border-slate-100 dark:border-slate-800 shadow-sm">
      <h4 className="font-semibold text-slate-800 dark:text-slate-200 text-sm tracking-tight mb-5 font-sans">
        Productos Más Vendidos (Volumen)
      </h4>

      <div className="space-y-4">
        {data.map((item, idx) => {
          const pct = (item.quantity / maxQty) * 100;
          return (
            <div key={idx} className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-slate-700 dark:text-slate-300 truncate max-w-[70%]">
                  {item.name}
                </span>
                <span className="font-mono text-slate-500 dark:text-slate-400 text-right">
                  {item.quantity} uds. <span className="text-slate-300 dark:text-slate-600">|</span> ${item.revenue.toFixed(2)}
                </span>
              </div>
              <div className="h-2.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${pct}%` }}
                  transition={{ duration: 0.6, delay: idx * 0.1, ease: 'easeOut' }}
                  className="h-full bg-indigo-500 dark:bg-indigo-600 rounded-full"
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
