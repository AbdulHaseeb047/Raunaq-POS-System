import { useQuery } from '@tanstack/react-query';

import { IconSync } from '@/components/icons';
import { api } from '@/lib/api-client';
import { useAuth } from '@/lib/auth';

const dotStyles = {
  synced: 'bg-brand-500',
  pending: 'bg-amber-500',
  failed: 'bg-orange-500',
  conflict: 'bg-rose-500',
} as const;

export function SyncStatusBadge() {
  const { user } = useAuth();

  const { data: status } = useQuery({
    queryKey: ['sync', 'status'],
    queryFn: () => api.sync.status(),
    refetchInterval: 60_000,
    enabled: !!user,
  });

  if (!status) return null;

  const dot = dotStyles[status.status] ?? 'bg-surface-muted';
  const label =
    status.deploymentMode === 'hybrid'
      ? status.status === 'synced'
        ? 'Synced'
        : status.status.charAt(0).toUpperCase() + status.status.slice(1)
      : 'Online';

  return (
    <div
      className="flex items-center gap-1.5 rounded-full border border-border bg-white px-2.5 py-1 text-xs font-medium text-text-muted shadow-sm"
      title={status.userMessage ?? label}
    >
      <span className={`h-2 w-2 rounded-full ${dot}`} />
      <IconSync className="h-3 w-3" />
      <span>{label}</span>
      {status.pendingChanges > 0 && (
        <span className="rounded-full bg-amber-100 px-1.5 text-[10px] font-bold text-amber-800">
          {status.pendingChanges}
        </span>
      )}
    </div>
  );
}
