import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';

import { IconHelp, IconKey, IconLogout, IconSettings, IconUpgrade } from '@/components/icons';
import { useAdminPasswordDialogOptional } from '@/features/settings/admin-password-dialog-context';
import { useSettingsDialogOptional } from '@/features/settings/settings-dialog-context';
import { useAuth } from '@/lib/auth';
import { planLabel, resolveDisplayPlan } from '@/lib/pricing-plans';

type AccountMenuProps = {
  /** Sidebar footer (Claude-style): name + plan, menu opens upward */
  placement?: 'header' | 'sidebar';
  collapsed?: boolean;
};

type MenuPos = { top: number; left: number; width: number; openUp: boolean };

export function AccountMenu({ placement = 'header', collapsed = false }: AccountMenuProps) {
  const { user, logout, isAdmin } = useAuth();
  const navigate = useNavigate();
  const settingsDialog = useSettingsDialogOptional();
  const adminPasswordDialog = useAdminPasswordDialogOptional();
  const [open, setOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<MenuPos | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  const firstName = user?.fullName?.split(' ')[0] ?? 'Account';
  const currentPlan = resolveDisplayPlan(user?.planEntitlement);
  const planName = `${planLabel(currentPlan)} plan`;
  const isSidebar = placement === 'sidebar';
  const initial = (user?.fullName?.trim()?.[0] ?? 'A').toUpperCase();

  const updatePosition = () => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const openUp = isSidebar;
    const width = collapsed && isSidebar ? 224 : Math.max(r.width, isSidebar ? 200 : 256);
    let left = isSidebar ? r.left : r.right - width;
    left = Math.min(Math.max(8, left), window.innerWidth - width - 8);
    setMenuPos({
      top: openUp ? r.top - 8 : r.bottom + 8,
      left,
      width,
      openUp,
    });
  };

  useLayoutEffect(() => {
    if (!open) {
      setMenuPos(null);
      return;
    }
    updatePosition();
    const onReposition = () => updatePosition();
    window.addEventListener('resize', onReposition);
    window.addEventListener('scroll', onReposition, true);
    return () => {
      window.removeEventListener('resize', onReposition);
      window.removeEventListener('scroll', onReposition, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reposition when open/layout changes
  }, [open, collapsed, isSidebar]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const signOut = async () => {
    setOpen(false);
    try {
      await logout();
    } finally {
      navigate('/login', { replace: true });
    }
  };

  const go = (path: string) => {
    setOpen(false);
    navigate(path);
  };

  const openPosSettings = (tab: 'business' | 'password' = 'business') => {
    setOpen(false);
    if (settingsDialog) {
      settingsDialog.openSettings(tab);
      return;
    }
    go(tab === 'password' ? '/account/password' : '/settings');
  };

  const openAdminPassword = () => {
    setOpen(false);
    if (adminPasswordDialog) {
      adminPasswordDialog.openPasswordSettings();
      return;
    }
    go('/admin/account/password');
  };

  const itemClass = isSidebar
    ? 'text-brand-100/90 hover:bg-sidebar-active hover:text-white'
    : 'text-text hover:bg-surface-muted';
  const iconClass = isSidebar ? 'opacity-80' : 'text-text-muted';
  const dividerClass = isSidebar ? 'border-sidebar-border' : 'border-border';

  const menu =
    open &&
    menuPos &&
    createPortal(
      <>
        {/* Dismiss layer — outside menu: normal cursor, click closes */}
        <div
          role="presentation"
          aria-hidden
          className="fixed inset-0 z-[90] cursor-default"
          onClick={() => setOpen(false)}
        />
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-labelledby={`${menuId}-trigger`}
          className={`fixed z-[100] overflow-hidden rounded-xl border py-1 shadow-xl ${
            isSidebar
              ? 'border-sidebar-border bg-sidebar text-text-inverse'
              : 'border-border bg-surface text-text'
          }`}
          style={{
            width: menuPos.width,
            left: menuPos.left,
            ...(menuPos.openUp
              ? { bottom: window.innerHeight - menuPos.top, top: 'auto' }
              : { top: menuPos.top }),
          }}
        >
          <div className={`border-b px-4 py-2.5 ${dividerClass}`}>
            <p
              className={`truncate text-xs ${isSidebar ? 'text-brand-200/70' : 'text-text-muted'}`}
            >
              {user?.email}
            </p>
          </div>

          {!isAdmin && (
            <>
              <MenuItem
                className={itemClass}
                icon={<IconSettings className={`h-4 w-4 shrink-0 ${iconClass}`} />}
                onClick={() => openPosSettings('business')}
              >
                Settings
              </MenuItem>
              <MenuItem
                className={itemClass}
                icon={<IconHelp className={`h-4 w-4 shrink-0 ${iconClass}`} />}
                onClick={() => go('/support')}
              >
                Get help
              </MenuItem>

              <div className={`my-1 border-t ${dividerClass}`} />

              <MenuItem
                className={itemClass}
                icon={<IconUpgrade className={`h-4 w-4 shrink-0 ${iconClass}`} />}
                onClick={() => go('/upgrade')}
              >
                Upgrade plan
              </MenuItem>
            </>
          )}

          <MenuItem
            className={itemClass}
            icon={<IconKey className={`h-4 w-4 shrink-0 ${iconClass}`} />}
            onClick={() => (isAdmin ? openAdminPassword() : openPosSettings('password'))}
          >
            Change password
          </MenuItem>

          <div className={`my-1 border-t ${dividerClass}`} />

          <MenuItem
            className={itemClass}
            icon={<IconLogout className={`h-4 w-4 shrink-0 ${iconClass}`} />}
            onClick={() => void signOut()}
          >
            Log out
          </MenuItem>
        </div>
      </>,
      document.body,
    );

  return (
    <div className={isSidebar ? 'w-full' : 'relative'}>
      <button
        ref={triggerRef}
        id={`${menuId}-trigger`}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls={open ? menuId : undefined}
        title={user?.fullName ?? firstName}
        className={
          isSidebar
            ? `flex w-full items-center rounded-xl text-left transition-colors ${
                collapsed ? 'justify-center px-1 py-2' : 'justify-between gap-2 px-2.5 py-2'
              } ${
                open
                  ? 'bg-sidebar-hover text-white'
                  : 'text-brand-100/90 hover:bg-sidebar-hover hover:text-white'
              }`
            : 'flex items-center gap-2 rounded-xl border border-border bg-surface px-2 py-1.5 text-sm shadow-sm transition hover:bg-surface-muted'
        }
      >
        {isSidebar && collapsed ? (
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-sidebar-active text-xs font-bold text-white">
            {initial}
          </span>
        ) : isSidebar ? (
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-semibold tracking-wide">
              {user?.fullName ?? firstName}
            </span>
            {!isAdmin && (
              <span className="mt-0.5 block truncate text-[11px] font-medium text-brand-200/70">
                {planName}
              </span>
            )}
          </span>
        ) : (
          <span className="truncate max-w-[140px] font-medium text-text">{user?.fullName}</span>
        )}
        {!(isSidebar && collapsed) && (
          <svg
            className={`h-4 w-4 shrink-0 transition ${open ? 'rotate-180' : ''} ${isSidebar ? 'opacity-70' : 'text-text-muted'}`}
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path
              fillRule="evenodd"
              d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.94a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
              clipRule="evenodd"
            />
          </svg>
        )}
      </button>
      {menu}
    </div>
  );
}

function MenuItem({
  children,
  icon,
  onClick,
  className,
}: {
  children: ReactNode;
  icon: ReactNode;
  onClick: () => void;
  className: string;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      className={`flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm whitespace-nowrap ${className}`}
      onClick={onClick}
    >
      {icon}
      {children}
    </button>
  );
}
