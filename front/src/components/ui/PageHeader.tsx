import type { ReactNode } from 'react';

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-lg font-bold tracking-tight text-text">{title}</h1>
        {subtitle && <p className="mt-0.5 text-xs text-text-muted">{subtitle}</p>}
      </div>
      {action && (
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
          {action}
        </div>
      )}
    </div>
  );
}
