import { useEffect, useRef, type ReactNode } from 'react';

import { Button } from './Button';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  /** When false, skip auto-focusing the first field (default true). */
  autoFocus?: boolean;
  /**
   * When true, blocks backdrop click, ESC, and the header close button
   * (e.g. while a checkout is submitting).
   */
  closeLocked?: boolean;
}

const sizes = { sm: 'max-w-md', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' };

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  size = 'md',
  autoFocus = true,
  closeLocked = false,
}: ModalProps) {
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || !autoFocus) return;
    const timer = window.setTimeout(() => {
      const el = bodyRef.current?.querySelector<HTMLElement>(
        'input:not([disabled]):not([type="hidden"]), textarea:not([disabled]), select:not([disabled])',
      );
      el?.focus();
      if (el instanceof HTMLInputElement && el.type !== 'number') {
        const len = el.value.length;
        try {
          el.setSelectionRange(len, len);
        } catch {
          /* some input types don't support selection */
        }
      }
    }, 30);
    return () => window.clearTimeout(timer);
  }, [open, autoFocus, title]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (closeLocked) {
        e.preventDefault();
        return;
      }
      onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, closeLocked, onClose]);

  if (!open) return null;

  const requestClose = () => {
    if (closeLocked) return;
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4">
      <button
        type="button"
        className="absolute inset-0 bg-text/40 backdrop-blur-sm"
        onClick={requestClose}
        aria-label="Close modal"
        disabled={closeLocked}
      />
      <div
        className={`relative flex max-h-[92dvh] w-full flex-col rounded-t-2xl border border-border bg-surface shadow-2xl sm:max-h-[85vh] sm:rounded-2xl ${sizes[size]}`}
        role="dialog"
        aria-modal="true"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-2.5 sm:px-4 sm:py-3">
          <h2 className="pr-2 text-sm font-semibold text-text sm:text-base">{title}</h2>
          <Button
            variant="ghost"
            size="sm"
            onClick={requestClose}
            disabled={closeLocked}
            aria-label="Close"
          >
            ✕
          </Button>
        </div>
        <div
          ref={bodyRef}
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3 sm:px-4"
        >
          {children}
        </div>
        {footer && (
          <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-border px-4 py-2.5 sm:px-4 sm:py-3">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
