import { useEffect } from 'react';

import { RaunaqLogo } from '@/components/brand/RaunaqLogo';
import { IconKey } from '@/components/icons';
import { Button } from '@/components/ui/Button';
import { ChangePasswordForm } from '@/features/settings/ChangePasswordForm';

type AdminPasswordDialogProps = {
  open: boolean;
  onClose: () => void;
};

/** Compact Claude-style password window for platform admin. */
export function AdminPasswordDialog({ open, onClose }: AdminPasswordDialogProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-text/45 backdrop-blur-[2px]"
        onClick={onClose}
        aria-label="Close"
      />
      <div
        role="dialog"
        aria-modal="true"
        className="relative flex h-[min(520px,90vh)] w-full max-w-lg overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl"
      >
        <aside className="flex w-40 shrink-0 flex-col bg-sidebar text-text-inverse sm:w-44">
          <div className="border-b border-sidebar-border px-3 py-3">
            <RaunaqLogo variant="compact" tone="dark" className="scale-90 origin-left" />
            <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-200/75">
              Settings
            </p>
          </div>
          <div className="p-2">
            <button
              type="button"
              className="sidebar-nav-link flex w-full cursor-pointer items-center gap-2.5 rounded-xl bg-sidebar-active px-2.5 py-2 text-left text-white shadow-sm"
            >
              <span className="sidebar-nav-icon-wrap flex shrink-0 items-center justify-center">
                <IconKey className="sidebar-nav-icon h-4 w-4 opacity-90" />
              </span>
              <span className="sidebar-nav-label min-w-0 flex-1">
                <span className="block text-[13px] font-semibold leading-tight">Password</span>
                <span className="block text-[11px] font-medium text-white/75">Security</span>
              </span>
            </button>
          </div>
        </aside>
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <h2 className="text-sm font-bold text-text">Password</h2>
            <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close">
              ✕
            </Button>
          </div>
          <div className="flex-1 overflow-y-auto px-4 py-4">
            <ChangePasswordForm />
          </div>
        </div>
      </div>
    </div>
  );
}
