import { BRAND } from '@pos/shared';

import { IconSidebarPanel } from '@/components/icons';
import { RaunaqLogo } from '@/components/brand/RaunaqLogo';
import { RaunaqMark } from '@/components/brand/RaunaqMark';

type SidebarHeaderProps = {
  collapsed: boolean;
  onToggle: () => void;
  subtitle?: string;
};

function SidebarPanelButton({
  onClick,
  label,
  className = '',
}: {
  onClick: () => void;
  label: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`sidebar-panel-btn flex shrink-0 items-center justify-center rounded-xl text-brand-100/80 ${className}`}
    >
      <IconSidebarPanel className="sidebar-panel-btn-icon h-5 w-5" />
    </button>
  );
}

function CollapsedMarkToggle({ onToggle }: { onToggle: () => void }) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <button
        type="button"
        onClick={onToggle}
        aria-label="Expand sidebar"
        title="Expand sidebar"
        className="sidebar-logo-mark-toggle group relative flex h-11 w-11 items-center justify-center rounded-xl transition-colors hover:bg-sidebar-hover"
      >
        <RaunaqMark
          size={32}
          tone="dark"
          className="sidebar-logo-mark-swap pointer-events-none will-change-[transform,opacity,filter]"
        />
        <IconSidebarPanel className="sidebar-logo-panel-swap pointer-events-none absolute h-5 w-5 text-brand-100 will-change-[transform,opacity,filter]" />
      </button>
      <p className="sidebar-logo-brand-name text-center text-[11px] font-semibold tracking-wide text-white">
        {BRAND.name}
      </p>
    </div>
  );
}

export function SidebarHeader({ collapsed, onToggle, subtitle }: SidebarHeaderProps) {
  if (collapsed) {
    return (
      <div className="shrink-0 border-b border-sidebar-border px-1.5 py-2.5">
        <CollapsedMarkToggle onToggle={onToggle} />
      </div>
    );
  }

  return (
    <div className="shrink-0 border-b border-sidebar-border px-2.5 py-3">
      <div className="flex items-start justify-between gap-1.5">
        <RaunaqLogo variant="compact" tone="dark" className="min-w-0 flex-1" />
        <SidebarPanelButton
          onClick={onToggle}
          label="Collapse sidebar"
          className="mt-0.5 h-9 w-9 hover:bg-sidebar-hover hover:text-white"
        />
      </div>
      {subtitle && (
        <p className="mt-1.5 pl-[2.75rem] text-[9px] font-medium tracking-wide text-brand-200/55">
          {subtitle}
        </p>
      )}
    </div>
  );
}
