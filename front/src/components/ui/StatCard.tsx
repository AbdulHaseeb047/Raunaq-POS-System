import type { ReactNode } from 'react';

const accentColors = {
  brand: 'from-brand-500 to-brand-600',
  accent: 'from-accent-400 to-accent-500',
  info: 'from-sky-400 to-sky-500',
  warning: 'from-slate-500 to-slate-600',
} as const;

export function StatCard({
  label,
  value,
  icon,
  accent = 'brand',
  trend,
}: {
  label: string;
  value: string | number;
  icon: ReactNode;
  accent?: keyof typeof accentColors;
  trend?: string;
}) {
  return (
    <div className="group rounded-2xl border border-border bg-surface p-5 shadow-[var(--shadow-card)] transition-all hover:shadow-[var(--shadow-card-hover)]">
      <div className="flex items-start justify-between">
        <div
          className={`flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br ${accentColors[accent]} text-white shadow-sm`}
        >
          {icon}
        </div>
        {trend && <span className="text-xs font-medium text-brand-600">{trend}</span>}
      </div>
      <p className="mt-4 text-sm font-medium text-text-muted">{label}</p>
      <p className="mt-1 text-2xl font-bold tracking-tight text-text">{value}</p>
    </div>
  );
}
