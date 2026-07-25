import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { IconAlert, IconSync } from '@/components/icons';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { api } from '@/lib/api-client';
import { isClientAdmin } from '@/lib/features';
import { useAuth } from '@/lib/auth';
import type { SyncIssue } from '@/types/api';

const statusStyles = {
  synced: 'bg-brand-50 border-brand-200 text-brand-800',
  pending: 'bg-amber-50 border-amber-200 text-amber-900',
  failed: 'bg-orange-50 border-orange-200 text-orange-900',
  conflict: 'bg-rose-50 border-rose-200 text-rose-900',
} as const;

export function SyncBanner() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [issuesOpen, setIssuesOpen] = useState(false);
  const [dismissReason, setDismissReason] = useState('');
  const [dismissTarget, setDismissTarget] = useState<SyncIssue | null>(null);
  // Defer sync status so it doesn't compete with dashboard/first-page APIs.
  const [pollReady, setPollReady] = useState(false);
  useEffect(() => {
    if (!user) {
      setPollReady(false);
      return;
    }
    const t = window.setTimeout(() => setPollReady(true), 2500);
    return () => window.clearTimeout(t);
  }, [user]);

  const { data: status } = useQuery({
    queryKey: ['sync', 'status'],
    queryFn: () => api.sync.status(),
    // Only keep polling in hybrid mode — cloud/offline Railway should not pay this RTT every minute.
    refetchInterval: (q) => (q.state.data?.deploymentMode === 'hybrid' ? 60_000 : false),
    enabled: !!user && pollReady,
    staleTime: 5 * 60_000,
  });

  const { data: issues } = useQuery({
    queryKey: ['sync', 'issues'],
    queryFn: () => api.sync.issues(),
    enabled: issuesOpen,
  });

  const runSync = useMutation({
    mutationFn: () => api.sync.run(),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['sync'] });
    },
  });

  const retry = useMutation({
    mutationFn: (id: string) => api.sync.retry(id),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['sync'] }),
  });

  const dismiss = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => api.sync.dismiss(id, reason),
    onSuccess: () => {
      setDismissTarget(null);
      setDismissReason('');
      void queryClient.invalidateQueries({ queryKey: ['sync'] });
    },
  });

  if (!status || status.deploymentMode !== 'hybrid') return null;
  if (status.status === 'synced') return null;

  const style = statusStyles[status.status];

  return (
    <>
      <div
        className={`flex flex-wrap items-center justify-between gap-3 border-b px-6 py-3 ${style}`}
      >
        <div className="flex items-center gap-2 text-sm font-medium">
          <IconSync className="h-4 w-4 shrink-0" />
          <span>{status.userMessage}</span>
        </div>
        <div className="flex items-center gap-2">
          {(status.conflictChanges > 0 || status.failedChanges > 0) && (
            <Button variant="secondary" size="sm" onClick={() => setIssuesOpen(true)}>
              View issues
            </Button>
          )}
          {status.workerConfigured && (
            <Button
              variant="secondary"
              size="sm"
              loading={runSync.isPending}
              onClick={() => runSync.mutate()}
            >
              Sync now
            </Button>
          )}
        </div>
      </div>

      <Modal open={issuesOpen} onClose={() => setIssuesOpen(false)} title="Sync issues" size="lg">
        {!isClientAdmin(user) && (
          <p className="mb-4 flex items-center gap-2 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <IconAlert className="h-4 w-4" />
            Only client admins can retry or dismiss issues.
          </p>
        )}
        <div className="space-y-3">
          {(issues?.data ?? []).length === 0 && (
            <p className="text-sm text-text-muted">No issues found.</p>
          )}
          {(issues?.data ?? []).map((issue) => (
            <div
              key={issue.id}
              className="rounded-xl border border-border bg-surface-muted p-4 text-sm"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-text">
                    {issue.operation} {issue.tableName}
                  </p>
                  <p className="text-xs text-text-muted">Record: {issue.recordId}</p>
                  {issue.errorMessage && (
                    <p className="mt-1 text-xs text-danger">{issue.errorMessage}</p>
                  )}
                </div>
                <span className="rounded-lg bg-white px-2 py-0.5 text-xs font-medium">
                  {issue.status}
                </span>
              </div>
              {isClientAdmin(user) && (
                <div className="mt-3 flex gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    loading={retry.isPending}
                    onClick={() => retry.mutate(issue.id)}
                  >
                    Retry
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setDismissTarget(issue)}>
                    Dismiss (keep cloud)
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      </Modal>

      <Modal
        open={!!dismissTarget}
        onClose={() => setDismissTarget(null)}
        title="Dismiss sync issue"
        footer={
          <>
            <Button variant="ghost" onClick={() => setDismissTarget(null)}>
              Cancel
            </Button>
            <Button
              loading={dismiss.isPending}
              disabled={!dismissReason.trim()}
              onClick={() =>
                dismissTarget &&
                dismiss.mutate({ id: dismissTarget.id, reason: dismissReason.trim() })
              }
            >
              Confirm dismiss
            </Button>
          </>
        }
      >
        <p className="mb-4 text-sm text-text-muted">
          This will accept the cloud version and update your local database. Provide a reason for
          the audit trail.
        </p>
        <textarea
          className="w-full rounded-xl border border-border px-4 py-3 text-sm min-h-[100px]"
          placeholder="Reason..."
          value={dismissReason}
          onChange={(e) => setDismissReason(e.target.value)}
        />
      </Modal>
    </>
  );
}
