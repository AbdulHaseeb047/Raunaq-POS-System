import { useId, useMemo, useState } from 'react';

export type BarPoint = {
  label: string;
  value: number;
};

type BarChartProps = {
  title: string;
  subtitle?: string;
  data: BarPoint[];
  color?: string;
  formatValue?: (n: number) => string;
  height?: number;
};

export function BarChart({
  title,
  subtitle,
  data,
  color = '#059669',
  formatValue = (n) => n.toLocaleString('en-PK', { maximumFractionDigits: 0 }),
  height = 220,
}: BarChartProps) {
  const gradId = useId().replace(/:/g, '');
  const [hover, setHover] = useState<number | null>(null);

  const width = 640;
  const padX = 16;
  const padTop = 16;
  const padBottom = 28;
  const gap = 6;

  const max = Math.max(...data.map((d) => d.value), 1);
  const avg = data.length ? data.reduce((s, d) => s + d.value, 0) / data.length : 0;
  const total = data.reduce((s, d) => s + d.value, 0);

  const bars = useMemo(() => {
    const innerW = width - padX * 2;
    const barW = data.length > 0 ? (innerW - gap * (data.length - 1)) / data.length : 0;
    const plotH = height - padTop - padBottom;
    return data.map((d, i) => {
      const h = (d.value / max) * plotH;
      const x = padX + i * (barW + gap);
      const y = padTop + plotH - h;
      return { ...d, x, y, w: barW, h, i };
    });
  }, [data, max, height]);

  const avgY = padTop + (height - padTop - padBottom) - (avg / max) * (height - padTop - padBottom);
  const active = hover != null ? bars[hover] : null;
  const empty = data.length === 0 || data.every((d) => d.value === 0);

  return (
    <div className="rounded-2xl border border-border bg-surface p-4 shadow-[var(--shadow-card)]">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-text">{title}</p>
          {subtitle ? <p className="mt-0.5 text-xs text-text-muted">{subtitle}</p> : null}
        </div>
        <div className="text-right">
          <p className="text-lg font-bold tabular-nums text-text">
            {formatValue(active ? active.value : total)}
          </p>
          <p className="text-[11px] text-text-muted">
            {active ? active.label : `Total · avg ${formatValue(avg)}`}
          </p>
        </div>
      </div>

      {empty ? (
        <div className="flex h-[220px] items-center justify-center text-sm text-text-muted">
          No sales in this period yet
        </div>
      ) : (
        <div className="relative">
          <svg
            viewBox={`0 0 ${width} ${height}`}
            className="h-[220px] w-full overflow-visible"
            role="img"
            aria-label={title}
            onMouseLeave={() => setHover(null)}
          >
            <defs>
              <linearGradient id={`bar-${gradId}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity="1" />
                <stop offset="100%" stopColor={color} stopOpacity="0.55" />
              </linearGradient>
            </defs>
            {[0.25, 0.5, 0.75].map((t) => (
              <line
                key={t}
                x1={padX}
                x2={width - padX}
                y1={padTop + (height - padTop - padBottom) * t}
                y2={padTop + (height - padTop - padBottom) * t}
                stroke="#e2e8f0"
                strokeWidth="1"
              />
            ))}
            {avg > 0 ? (
              <line
                x1={padX}
                x2={width - padX}
                y1={avgY}
                y2={avgY}
                stroke="#94a3b8"
                strokeWidth="1.5"
                strokeDasharray="5 4"
              />
            ) : null}
            {bars.map((b) => {
              const on = hover === b.i;
              return (
                <g key={`${b.label}-${b.i}`}>
                  <rect
                    x={b.x}
                    y={b.y}
                    width={b.w}
                    height={Math.max(b.h, 2)}
                    rx={Math.min(6, b.w / 2)}
                    fill={on ? color : `url(#bar-${gradId})`}
                    opacity={hover == null || on ? 1 : 0.35}
                    className="transition-opacity"
                    onMouseEnter={() => setHover(b.i)}
                  />
                  {/* Wider hit area */}
                  <rect
                    x={b.x - gap / 2}
                    y={padTop}
                    width={b.w + gap}
                    height={height - padTop - padBottom}
                    fill="transparent"
                    onMouseEnter={() => setHover(b.i)}
                  />
                  {(data.length <= 10 || b.i % 2 === 0 || b.i === data.length - 1) && (
                    <text
                      x={b.x + b.w / 2}
                      y={height - 8}
                      textAnchor="middle"
                      fill="#64748b"
                      fontSize="10"
                    >
                      {b.label}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
          {active ? (
            <div className="pointer-events-none absolute left-1/2 top-2 -translate-x-1/2 rounded-lg border border-border bg-white px-2.5 py-1 text-xs shadow-sm">
              <span className="font-medium text-text">{active.label}</span>
              <span className="ml-2 font-bold text-brand-700">{formatValue(active.value)}</span>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
