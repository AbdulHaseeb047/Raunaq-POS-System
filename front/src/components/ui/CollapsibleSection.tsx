import { useState, type ReactNode } from 'react';

type CollapsibleSectionProps = {
  title: string;
  summary?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
  /** Highlight header when section needs attention (e.g. revoked access). */
  accent?: 'default' | 'warning' | 'danger';
};

const accentStyles = {
  default: 'border-border bg-surface',
  warning: 'border-slate-200 bg-slate-50/80',
  danger: 'border-rose-200 bg-rose-50/50',
};

export function CollapsibleSection({
  title,
  summary,
  defaultOpen = true,
  children,
  accent = 'default',
}: CollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section
      className={`overflow-hidden rounded-2xl border shadow-[var(--shadow-card)] ${accentStyles[accent]}`}
    >
      <button
        type="button"
        className="flex w-full items-center gap-3 px-5 py-4 text-left transition hover:bg-black/[0.02]"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span
          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-surface-muted text-xs text-text-muted transition-transform ${
            open ? 'rotate-90' : ''
          }`}
          aria-hidden
        >
          ▶
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-text">{title}</span>
          {summary && !open && (
            <span className="mt-0.5 block truncate text-xs text-text-muted">{summary}</span>
          )}
        </span>
        {summary && open && (
          <span className="hidden shrink-0 text-xs text-text-muted sm:block">{summary}</span>
        )}
      </button>
      {open && <div className="border-t border-border/60 px-5 py-4">{children}</div>}
    </section>
  );
}
