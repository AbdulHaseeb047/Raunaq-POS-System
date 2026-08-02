import { useId, useMemo, useState } from 'react';

export type GrowingPoint = {
  label: string;
  /** Primary series (e.g. money out / sales). */
  value: number;
  /** Optional second series (e.g. money in / payments). */
  secondary?: number;
};

type GrowingChartProps = {
  title: string;
  subtitle?: string;
  data: GrowingPoint[];
  color?: string;
  secondaryColor?: string;
  primaryLabel?: string;
  secondaryLabel?: string;
  formatValue?: (n: number) => string;
  height?: number;
  /** When true, chart plots running totals so the line grows over time. */
  cumulative?: boolean;
};

function toSeries(data: GrowingPoint[], cumulative: boolean) {
  if (!cumulative) {
    return data.map((d) => ({
      label: d.label,
      value: d.value,
      secondary: d.secondary ?? 0,
    }));
  }
  let a = 0;
  let b = 0;
  return data.map((d) => {
    a += d.value;
    b += d.secondary ?? 0;
    return { label: d.label, value: a, secondary: b };
  });
}

function buildCoords(
  values: number[],
  max: number,
  width: number,
  height: number,
  padX: number,
  padY: number,
) {
  const innerW = width - padX * 2;
  const innerH = height - padY * 2;
  const step = values.length > 1 ? innerW / (values.length - 1) : 0;
  return values.map((v, i) => ({
    x: padX + i * step,
    y: padY + innerH - (Math.max(0, v) / max) * innerH,
  }));
}

function pathFromCoords(coords: Array<{ x: number; y: number }>, height: number, padY: number) {
  if (coords.length === 0) return { line: '', area: '' };
  let line = `M ${coords[0].x} ${coords[0].y}`;
  for (let i = 1; i < coords.length; i++) {
    const prev = coords[i - 1];
    const curr = coords[i];
    const cx = (prev.x + curr.x) / 2;
    line += ` C ${cx} ${prev.y}, ${cx} ${curr.y}, ${curr.x} ${curr.y}`;
  }
  const last = coords[coords.length - 1];
  const first = coords[0];
  const baseline = height - padY;
  const area = `${line} L ${last.x} ${baseline} L ${first.x} ${baseline} Z`;
  return { line, area };
}

export function GrowingChart({
  title,
  subtitle,
  data,
  color = '#059669',
  secondaryColor = '#0284c7',
  primaryLabel = 'Out',
  secondaryLabel = 'In',
  formatValue = (n) => n.toLocaleString('en-PK', { maximumFractionDigits: 0 }),
  height = 200,
  cumulative = true,
}: GrowingChartProps) {
  const gradId = useId().replace(/:/g, '');
  const [hover, setHover] = useState<number | null>(null);
  const width = 560;
  const padX = 10;
  const padY = 14;

  const series = useMemo(() => toSeries(data, cumulative), [data, cumulative]);
  const hasSecondary = data.some((d) => (d.secondary ?? 0) > 0);
  const max = Math.max(...series.flatMap((p) => [p.value, hasSecondary ? p.secondary : 0]), 1);

  const primaryCoords = useMemo(
    () =>
      buildCoords(
        series.map((p) => p.value),
        max,
        width,
        height,
        padX,
        padY,
      ),
    [series, max, height],
  );
  const secondaryCoords = useMemo(
    () =>
      buildCoords(
        series.map((p) => p.secondary),
        max,
        width,
        height,
        padX,
        padY,
      ),
    [series, max, height],
  );

  const primaryPaths = useMemo(
    () => pathFromCoords(primaryCoords, height, padY),
    [primaryCoords, height],
  );
  const secondaryPaths = useMemo(
    () => pathFromCoords(secondaryCoords, height, padY),
    [secondaryCoords, height],
  );

  const idx = hover ?? series.length - 1;
  const active = series[idx];
  const empty = series.length === 0 || series.every((d) => d.value === 0 && d.secondary === 0);

  return (
    <div className="rounded-2xl border border-border bg-surface p-4 shadow-[var(--shadow-card)]">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-text">{title}</p>
          {subtitle ? <p className="mt-0.5 text-xs text-text-muted">{subtitle}</p> : null}
          {hasSecondary ? (
            <div className="mt-2 flex flex-wrap gap-3 text-[11px] font-semibold">
              <span className="inline-flex items-center gap-1.5 text-text-muted">
                <span className="h-2 w-2 rounded-full" style={{ background: color }} />
                {primaryLabel}
              </span>
              <span className="inline-flex items-center gap-1.5 text-text-muted">
                <span className="h-2 w-2 rounded-full" style={{ background: secondaryColor }} />
                {secondaryLabel}
              </span>
            </div>
          ) : null}
        </div>
        {active ? (
          <div className="text-right">
            <p className="text-lg font-bold tabular-nums text-text">{formatValue(active.value)}</p>
            {hasSecondary ? (
              <p className="text-[11px] font-semibold text-sky-700">
                {secondaryLabel} {formatValue(active.secondary)}
              </p>
            ) : (
              <p className="text-[11px] text-text-muted">{active.label}</p>
            )}
          </div>
        ) : null}
      </div>

      {empty ? (
        <div className="flex h-[200px] items-center justify-center text-sm text-text-muted">
          No activity yet
        </div>
      ) : (
        <div className="relative">
          <svg
            viewBox={`0 0 ${width} ${height}`}
            className="h-[200px] w-full overflow-visible"
            role="img"
            aria-label={title}
            onMouseLeave={() => setHover(null)}
          >
            <defs>
              <linearGradient id={`grow-${gradId}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity="0.32" />
                <stop offset="100%" stopColor={color} stopOpacity="0.02" />
              </linearGradient>
            </defs>
            {[0.25, 0.5, 0.75].map((t) => (
              <line
                key={t}
                x1={padX}
                x2={width - padX}
                y1={padY + (height - padY * 2) * t}
                y2={padY + (height - padY * 2) * t}
                stroke="#d1e7e2"
                strokeDasharray="4 4"
                strokeWidth="1"
              />
            ))}
            <path d={primaryPaths.area} fill={`url(#grow-${gradId})`} />
            <path
              d={primaryPaths.line}
              fill="none"
              stroke={color}
              strokeWidth="2.75"
              strokeLinejoin="round"
            />
            {hasSecondary ? (
              <path
                d={secondaryPaths.line}
                fill="none"
                stroke={secondaryColor}
                strokeWidth="2.25"
                strokeDasharray="5 4"
                strokeLinejoin="round"
              />
            ) : null}
            {series.map((p, i) => {
              const c = primaryCoords[i];
              const hitW = series.length > 1 ? (width - padX * 2) / series.length : 40;
              return (
                <g key={`${p.label}-${i}`}>
                  <circle
                    cx={c.x}
                    cy={c.y}
                    r={hover === i ? 5 : 0}
                    fill={color}
                    className="transition-all"
                  />
                  <rect
                    x={c.x - hitW / 2}
                    y={0}
                    width={hitW}
                    height={height}
                    fill="transparent"
                    onMouseEnter={() => setHover(i)}
                  />
                </g>
              );
            })}
            {hover != null && primaryCoords[hover] ? (
              <g>
                <line
                  x1={primaryCoords[hover].x}
                  x2={primaryCoords[hover].x}
                  y1={padY}
                  y2={height - padY}
                  stroke={color}
                  strokeOpacity="0.35"
                  strokeDasharray="3 3"
                />
                <circle
                  cx={primaryCoords[hover].x}
                  cy={primaryCoords[hover].y}
                  r={5}
                  fill="#fff"
                  stroke={color}
                  strokeWidth="2"
                />
                {hasSecondary && secondaryCoords[hover] ? (
                  <circle
                    cx={secondaryCoords[hover].x}
                    cy={secondaryCoords[hover].y}
                    r={4}
                    fill="#fff"
                    stroke={secondaryColor}
                    strokeWidth="2"
                  />
                ) : null}
              </g>
            ) : null}
          </svg>
          <div className="mt-1 flex justify-between px-1 text-[10px] text-text-muted">
            <span>{series[0]?.label}</span>
            <span>{series[Math.floor(series.length / 2)]?.label}</span>
            <span>{series[series.length - 1]?.label}</span>
          </div>
          {hover != null && active ? (
            <div className="pointer-events-none absolute left-1/2 top-2 -translate-x-1/2 rounded-lg border border-border bg-white px-2.5 py-1 text-xs shadow-sm">
              <span className="font-medium text-text">{active.label}</span>
              <span className="ml-2 font-bold" style={{ color }}>
                {formatValue(active.value)}
              </span>
              {hasSecondary ? (
                <span className="ml-2 font-bold" style={{ color: secondaryColor }}>
                  {formatValue(active.secondary)}
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
