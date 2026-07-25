import { useId, useMemo, useState } from 'react';

export type MountainPoint = {
  label: string;
  value: number;
};

type MountainChartProps = {
  title: string;
  subtitle?: string;
  data: MountainPoint[];
  color?: string;
  formatValue?: (n: number) => string;
  height?: number;
};

function buildPath(points: MountainPoint[], width: number, height: number, padX: number, padY: number) {
  const max = Math.max(...points.map((p) => p.value), 1);
  const innerW = width - padX * 2;
  const innerH = height - padY * 2;
  const step = points.length > 1 ? innerW / (points.length - 1) : 0;

  const coords = points.map((p, i) => {
    const x = padX + i * step;
    const y = padY + innerH - (p.value / max) * innerH;
    return { x, y, ...p };
  });

  if (coords.length === 0) {
    return { line: '', area: '', coords: [] as typeof coords, max };
  }

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

  return { line, area, coords, max };
}

export function MountainChart({
  title,
  subtitle,
  data,
  color = '#059669',
  formatValue = (n) => n.toLocaleString('en-PK', { maximumFractionDigits: 0 }),
  height = 180,
}: MountainChartProps) {
  const gradId = useId().replace(/:/g, '');
  const [hover, setHover] = useState<number | null>(null);
  const width = 480;

  const { line, area, coords } = useMemo(
    () => buildPath(data, width, height, 8, 12),
    [data, height],
  );

  const active = hover != null ? coords[hover] : coords[coords.length - 1];
  const change =
    data.length >= 2
      ? ((data[data.length - 1].value - data[0].value) / Math.max(data[0].value, 1)) * 100
      : 0;

  return (
    <div className="rounded-2xl border border-border bg-surface p-4 shadow-[var(--shadow-card)]">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-text">{title}</p>
          {subtitle && <p className="mt-0.5 text-xs text-text-muted">{subtitle}</p>}
        </div>
        <div className="text-right">
          <p className="text-lg font-bold tabular-nums text-text">
            {active ? formatValue(active.value) : '—'}
          </p>
          <p className={`text-[11px] font-semibold ${change >= 0 ? 'text-brand-700' : 'text-danger'}`}>
            {change >= 0 ? '+' : ''}
            {change.toFixed(1)}% period
          </p>
        </div>
      </div>

      {data.every((d) => d.value === 0) ? (
        <div className="flex h-[180px] items-center justify-center text-sm text-text-muted">
          No activity in this period yet
        </div>
      ) : (
        <div className="relative">
          <svg
            viewBox={`0 0 ${width} ${height}`}
            className="h-[180px] w-full overflow-visible"
            role="img"
            aria-label={title}
            onMouseLeave={() => setHover(null)}
          >
            <defs>
              <linearGradient id={`fill-${gradId}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity="0.35" />
                <stop offset="100%" stopColor={color} stopOpacity="0.02" />
              </linearGradient>
            </defs>
            {[0.25, 0.5, 0.75].map((t) => (
              <line
                key={t}
                x1={8}
                x2={width - 8}
                y1={12 + (height - 24) * t}
                y2={12 + (height - 24) * t}
                stroke="#d1e7e2"
                strokeDasharray="4 4"
                strokeWidth="1"
              />
            ))}
            <path d={area} fill={`url(#fill-${gradId})`} />
            <path d={line} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" />
            {coords.map((c, i) => (
              <g key={c.label}>
                <circle
                  cx={c.x}
                  cy={c.y}
                  r={hover === i ? 5 : 0}
                  fill={color}
                  className="transition-all"
                />
                <rect
                  x={c.x - (coords.length > 1 ? (width - 16) / coords.length / 2 : 20)}
                  y={0}
                  width={coords.length > 1 ? (width - 16) / coords.length : 40}
                  height={height}
                  fill="transparent"
                  onMouseEnter={() => setHover(i)}
                />
              </g>
            ))}
            {active && hover != null && (
              <g>
                <line
                  x1={active.x}
                  x2={active.x}
                  y1={12}
                  y2={height - 12}
                  stroke={color}
                  strokeOpacity="0.35"
                  strokeDasharray="3 3"
                />
                <circle cx={active.x} cy={active.y} r={5} fill="#fff" stroke={color} strokeWidth="2" />
              </g>
            )}
          </svg>
          <div className="mt-1 flex justify-between px-1 text-[10px] text-text-muted">
            <span>{data[0]?.label}</span>
            <span>{data[Math.floor(data.length / 2)]?.label}</span>
            <span>{data[data.length - 1]?.label}</span>
          </div>
          {active && hover != null && (
            <div className="pointer-events-none absolute left-1/2 top-2 -translate-x-1/2 rounded-lg border border-border bg-white px-2.5 py-1 text-xs shadow-sm">
              <span className="font-medium text-text">{active.label}</span>
              <span className="ml-2 font-bold text-brand-700">{formatValue(active.value)}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
