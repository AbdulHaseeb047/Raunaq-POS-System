import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';

import { IconChart, IconClose, IconDashboard, IconMenu, IconUsers } from '@/components/icons';
import { AccountMenu } from '@/components/layout/AccountMenu';
import { SidebarHeader } from '@/components/layout/SidebarHeader';
import { RaunaqMark } from '@/components/brand/RaunaqMark';
import { AdminPasswordDialogProvider } from '@/features/settings/admin-password-dialog-context';
import { useSidebarCollapsed } from '@/lib/use-sidebar-collapsed';

const links = [
  { to: '/admin', label: 'Dashboard', icon: IconDashboard, end: true },
  { to: '/admin/clients', label: 'Clients', icon: IconUsers },
  { to: '/admin/sales-reps', label: 'Sales Reps', icon: IconChart },
];

export function AdminAppShell() {
  const { collapsed, toggle } = useSidebarCollapsed();
  const location = useLocation();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!mobileNavOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mobileNavOpen]);

  useEffect(() => {
    if (!mobileNavOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMobileNavOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mobileNavOpen]);

  const nav = (opts: { collapsed: boolean; onNavigate?: () => void }) => (
    <>
      <nav
        className={`min-h-0 flex-1 overflow-y-auto overscroll-contain py-2.5 ${
          opts.collapsed ? 'space-y-0.5 px-1' : 'space-y-0.5 px-1.5'
        }`}
      >
        {links.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            title={item.label}
            onClick={opts.onNavigate}
            className={({ isActive }) =>
              `sidebar-nav-link flex min-h-[44px] cursor-pointer items-center rounded-xl py-2 text-[13px] font-semibold tracking-wide transition-all ${
                opts.collapsed ? 'justify-center px-2' : 'gap-2.5 px-3'
              } ${
                isActive
                  ? 'bg-sidebar-active text-white shadow-sm'
                  : 'text-brand-100/95 hover:bg-sidebar-hover hover:text-white'
              }`
            }
          >
            <span className="sidebar-nav-icon-wrap flex shrink-0 items-center justify-center">
              <item.icon className="sidebar-nav-icon h-4 w-4 opacity-90" />
            </span>
            {!opts.collapsed && (
              <span className="sidebar-nav-label min-w-0 flex-1 truncate">{item.label}</span>
            )}
          </NavLink>
        ))}
      </nav>
      <div
        className={`relative z-10 shrink-0 border-t border-sidebar-border ${opts.collapsed ? 'p-1' : 'p-2'}`}
      >
        <AccountMenu placement="sidebar" collapsed={opts.collapsed} />
      </div>
    </>
  );

  return (
    <AdminPasswordDialogProvider>
      <div className="flex min-h-screen bg-surface-muted">
        <aside
          className={`sidebar-shell sticky top-0 z-30 hidden h-screen shrink-0 flex-col bg-sidebar font-sans antialiased text-text-inverse transition-[width] duration-200 ease-in-out md:flex ${
            collapsed ? 'w-[4.75rem]' : 'w-[15.5rem]'
          }`}
        >
          <SidebarHeader collapsed={collapsed} onToggle={toggle} subtitle="Platform admin" />
          {nav({ collapsed })}
        </aside>

        {mobileNavOpen && (
          <div className="fixed inset-0 z-50 md:hidden">
            <button
              type="button"
              className="absolute inset-0 bg-text/45 backdrop-blur-[2px]"
              aria-label="Close menu"
              onClick={() => setMobileNavOpen(false)}
            />
            <aside className="sidebar-shell absolute inset-y-0 left-0 flex w-[min(18rem,88vw)] flex-col bg-sidebar font-sans antialiased text-text-inverse shadow-2xl">
              <div className="flex items-center justify-between border-b border-sidebar-border px-3 py-3">
                <div className="flex items-center gap-2">
                  <RaunaqMark size={28} tone="dark" />
                  <span className="text-sm font-semibold text-white">Admin</span>
                </div>
                <button
                  type="button"
                  onClick={() => setMobileNavOpen(false)}
                  className="inline-flex h-11 w-11 items-center justify-center rounded-xl text-brand-100 hover:bg-sidebar-hover"
                  aria-label="Close menu"
                >
                  <IconClose className="h-5 w-5" />
                </button>
              </div>
              {nav({ collapsed: false, onNavigate: () => setMobileNavOpen(false) })}
            </aside>
          </div>
        )}

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-20 flex items-center gap-2 border-b border-border bg-surface px-3 py-2 md:hidden">
            <button
              type="button"
              onClick={() => setMobileNavOpen(true)}
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-border bg-white text-text"
              aria-label="Open menu"
            >
              <IconMenu className="h-5 w-5" />
            </button>
            <p className="truncate text-sm font-bold text-text">Platform admin</p>
          </header>

          <main className="flex-1 overflow-auto p-3 sm:p-4 lg:p-6">
            <Outlet />
          </main>
        </div>
      </div>
    </AdminPasswordDialogProvider>
  );
}
