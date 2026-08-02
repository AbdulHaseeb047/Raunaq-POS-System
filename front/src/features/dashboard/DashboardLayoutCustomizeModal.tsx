import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { api } from '@/lib/api-client';
import { DASHBOARD_WIDGET_META, resolveDashboardLayout, widgetLabel } from '@/lib/dashboard-layout';
import { useToast } from '@/components/ui/Toast';
import type { DashboardLayout, DashboardWidgetId } from '@/types/api';

export function DashboardLayoutCustomizeModal({
  open,
  onClose,
  initial,
}: {
  open: boolean;
  onClose: () => void;
  initial: DashboardLayout | null | undefined;
}) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [layout, setLayout] = useState<DashboardLayout>(() => resolveDashboardLayout(initial));

  useEffect(() => {
    if (open) setLayout(resolveDashboardLayout(initial));
  }, [open, initial]);

  const save = useMutation({
    mutationFn: () => api.settings.update({ dashboardLayout: layout }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['settings'] });
      toast.success('Dashboard layout updated');
      onClose();
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Failed to save layout');
    },
  });

  const toggle = (id: DashboardWidgetId) => {
    setLayout((prev) => ({
      widgets: prev.widgets.map((w) => (w.id === id ? { ...w, visible: !w.visible } : w)),
    }));
  };

  const move = (index: number, dir: -1 | 1) => {
    const next = index + dir;
    if (next < 0 || next >= layout.widgets.length) return;
    setLayout((prev) => {
      const copy = [...prev.widgets];
      const tmp = copy[index]!;
      copy[index] = copy[next]!;
      copy[next] = tmp;
      return { widgets: copy };
    });
  };

  const resetDefault = () => {
    setLayout({
      widgets: DASHBOARD_WIDGET_META.map((w) => ({ id: w.id, visible: true })),
    });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Customize Dashboard"
      size="md"
      footer={
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button type="button" variant="secondary" onClick={resetDefault}>
            Reset default
          </Button>
          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="button" onClick={() => save.mutate()} disabled={save.isPending}>
              {save.isPending ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </div>
      }
    >
      <p className="mb-3 text-sm text-text-muted">
        Show, hide, and reorder sections. At least one section should stay visible.
      </p>
      <ul className="space-y-2">
        {layout.widgets.map((w, index) => (
          <li
            key={w.id}
            className="flex items-center gap-3 rounded-xl border border-border bg-surface-muted/40 px-3 py-2"
          >
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-border text-brand-600"
              checked={w.visible}
              onChange={() => toggle(w.id)}
              aria-label={`Show ${widgetLabel(w.id)}`}
            />
            <span className="min-w-0 flex-1 text-sm font-medium text-text">
              {widgetLabel(w.id)}
            </span>
            <button
              type="button"
              className="rounded px-1.5 text-xs font-semibold text-text-muted hover:bg-white"
              onClick={() => move(index, -1)}
              disabled={index === 0}
              aria-label="Move up"
            >
              ↑
            </button>
            <button
              type="button"
              className="rounded px-1.5 text-xs font-semibold text-text-muted hover:bg-white"
              onClick={() => move(index, 1)}
              disabled={index === layout.widgets.length - 1}
              aria-label="Move down"
            >
              ↓
            </button>
          </li>
        ))}
      </ul>
    </Modal>
  );
}
