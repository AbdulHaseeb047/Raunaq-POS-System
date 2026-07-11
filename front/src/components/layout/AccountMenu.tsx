import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { IconLogout, IconSettings } from '@/components/icons';
import { useAuth } from '@/lib/auth';

type AccountMenuProps = {
  /** Sidebar footer (Claude-style): name only, menu opens upward */
  placement?: 'header' | 'sidebar';
  collapsed?: boolean;
};

export function AccountMenu({ placement = 'header', collapsed = false }: AccountMenuProps) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const firstName = user?.fullName?.split(' ')[0] ?? 'Account';

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const signOut = async () => {
    setOpen(false);
    try {
      await logout();
    } finally {
      navigate('/login', { replace: true });
    }
  };

  const isSidebar = placement === 'sidebar';
  const initial = (user?.fullName?.trim()?.[0] ?? 'A').toUpperCase();

  return (
    <div ref={rootRef} className={`relative ${isSidebar ? 'w-full' : ''}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        title={user?.fullName ?? firstName}
        className={
          isSidebar
            ? `flex w-full items-center rounded-xl text-left text-[13px] font-semibold tracking-wide transition-colors ${
                collapsed ? 'justify-center px-1 py-2' : 'justify-between gap-2 px-2.5 py-2'
              } ${
                open ? 'bg-sidebar-hover text-white' : 'text-brand-100/90 hover:bg-sidebar-hover hover:text-white'
              }`
            : 'flex items-center gap-2 rounded-xl border border-border bg-surface px-2 py-1.5 text-sm shadow-sm transition hover:bg-surface-muted'
        }
      >
        {isSidebar && collapsed ? (
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-sidebar-active text-xs font-bold text-white">
            {initial}
          </span>
        ) : (
          <span className={`truncate ${isSidebar ? '' : 'max-w-[140px] font-medium text-text'}`}>
            {isSidebar ? user?.fullName ?? firstName : user?.fullName}
          </span>
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

      {open && (
        <div
          role="menu"
          className={`absolute z-[100] overflow-hidden rounded-xl border py-1 shadow-xl ${
            isSidebar
              ? collapsed
                ? 'bottom-full left-0 mb-2 w-52 border-sidebar-border bg-sidebar'
                : 'bottom-full left-0 right-0 mb-2 border-sidebar-border bg-sidebar-hover'
              : 'right-0 mt-2 w-64 border-border bg-surface'
          }`}
        >
          {!isSidebar && (
            <div className="border-b border-border px-4 py-3">
              <p className="truncate text-sm font-semibold text-text">{user?.fullName}</p>
              <p className="truncate text-xs text-text-muted">{user?.email}</p>
            </div>
          )}
          {isSidebar && collapsed && (
            <div className="border-b border-sidebar-border px-4 py-2.5">
              <p className="truncate text-sm font-semibold text-white">{user?.fullName}</p>
              <p className="truncate text-xs text-brand-200/60">{user?.email}</p>
            </div>
          )}
          <button
            type="button"
            role="menuitem"
            className={`flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm whitespace-nowrap ${
              isSidebar ? 'text-brand-100/90 hover:bg-sidebar-active hover:text-white' : 'text-text hover:bg-surface-muted'
            }`}
            onClick={() => {
              setOpen(false);
              navigate('/account/password');
            }}
          >
            <IconSettings className={`h-4 w-4 shrink-0 ${isSidebar ? 'opacity-80' : 'text-text-muted'}`} />
            Change password
          </button>
          <button
            type="button"
            role="menuitem"
            className={`flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm whitespace-nowrap ${
              isSidebar ? 'text-brand-100/90 hover:bg-sidebar-active hover:text-white' : 'text-text hover:bg-surface-muted'
            }`}
            onClick={() => void signOut()}
          >
            <IconLogout className={`h-4 w-4 shrink-0 ${isSidebar ? 'opacity-80' : 'text-text-muted'}`} />
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
