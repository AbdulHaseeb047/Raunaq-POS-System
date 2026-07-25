type BadgeVariant = 'default' | 'success' | 'warning' | 'danger' | 'info' | 'brand';

const styles: Record<BadgeVariant, string> = {
  default: 'bg-surface-muted text-text-muted border-border',
  success: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  warning: 'bg-slate-100 text-slate-800 border-slate-200',
  danger: 'bg-rose-50 text-rose-700 border-rose-200',
  info: 'bg-sky-50 text-sky-700 border-sky-200',
  brand: 'bg-brand-50 text-brand-700 border-brand-200',
};

export function Badge({
  children,
  variant = 'default',
  className = '',
}: {
  children: React.ReactNode;
  variant?: BadgeVariant;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-lg border px-2.5 py-0.5 text-xs font-semibold ${styles[variant]} ${className}`}
    >
      {children}
    </span>
  );
}
