import { NavLink, Outlet } from 'react-router-dom';

import { IconChart, IconDashboard, IconUsers } from '@/components/icons';
import { AccountMenu } from '@/components/layout/AccountMenu';
import { SidebarHeader } from '@/components/layout/SidebarHeader';
import { AdminPasswordDialogProvider } from '@/features/settings/admin-password-dialog-context';
import { useSidebarCollapsed } from '@/lib/use-sidebar-collapsed';

const links = [
  { to: '/admin', label: 'Dashboard', icon: IconDashboard, end: true },
  { to: '/admin/clients', label: 'Clients', icon: IconUsers },
  { to: '/admin/sales-reps', label: 'Sales Reps', icon: IconChart },
];

export function AdminAppShell() {
  const { collapsed, toggle } = useSidebarCollapsed();

  return (
    <AdminPasswordDialogProvider>
      <div className="flex min-h-screen bg-surface-muted">
        <aside
          className={`sidebar-shell sticky top-0 flex h-screen shrink-0 flex-col bg-sidebar font-sans antialiased text-text-inverse transition-[width] duration-200 ease-in-out ${
            collapsed ? 'w-[4.75rem]' : 'w-[15.5rem]'
          }`}
        >
          <SidebarHeader collapsed={collapsed} onToggle={toggle} subtitle="Platform admin" />

          <nav
            className={`min-h-0 flex-1 overflow-y-auto overscroll-contain py-2.5 ${
              collapsed ? 'space-y-0.5 px-1' : 'space-y-0.5 px-1.5'
            }`}
          >
            {links.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                title={item.label}
                className={({ isActive }) =>
                  `sidebar-nav-link flex min-h-[38px] cursor-pointer items-center rounded-xl py-2 text-[13px] font-semibold tracking-wide transition-all ${
                    collapsed ? 'justify-center px-2' : 'gap-2.5 px-3'
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
                {!collapsed && <span className="sidebar-nav-label min-w-0 flex-1 truncate">{item.label}</span>}
              </NavLink>
            ))}
          </nav>

          <div className={`relative z-10 shrink-0 border-t border-sidebar-border ${collapsed ? 'p-1' : 'p-2'}`}>
            <AccountMenu placement="sidebar" collapsed={collapsed} />
          </div>
        </aside>

        <main className="flex-1 overflow-auto p-4 lg:p-6">
          <Outlet />
        </main>
      </div>
    </AdminPasswordDialogProvider>
  );
}
