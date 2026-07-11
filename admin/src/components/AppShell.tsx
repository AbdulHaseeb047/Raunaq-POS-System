import { NavLink, Outlet } from 'react-router-dom';

import { AccountMenu } from './AccountMenu';
import { RaunaqLogo } from './RaunaqLogo';

const links = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/clients', label: 'Clients' },
  { to: '/sales-reps', label: 'Sales Reps' },
];

export function AppShell() {
  return (
    <div className="flex min-h-screen">
      <aside className="flex w-52 flex-col bg-[var(--color-sidebar)] text-[var(--color-text-inverse)]">
        <div className="border-b border-indigo-900/50 px-2.5 py-2.5">
          <RaunaqLogo tone="dark" />
          <p className="mt-1.5 px-1 text-[10px] text-indigo-200/80">Platform admin</p>
        </div>
        <nav className="flex-1 space-y-1 p-3">
          {links.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              end={l.end}
              className={({ isActive }) =>
                `block rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                  isActive ? 'bg-[var(--color-sidebar-active)]' : 'hover:bg-[var(--color-sidebar-hover)]'
                }`
              }
            >
              {l.label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-3">
          <p className="text-sm font-medium text-slate-600">Platform control panel</p>
          <AccountMenu />
        </header>
        <main className="flex-1 overflow-auto p-6 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
