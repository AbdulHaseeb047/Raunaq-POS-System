import { NavLink, Outlet } from 'react-router-dom';
import type { FeatureKey } from '@pos/shared';

import {
  IconBox,
  IconBrand,
  IconChart,
  IconDashboard,
  IconGrid,
  IconHistory,
  IconSale,
  IconSettings,
  IconStaff,
  IconSupplier,
  IconTag,
  IconWallet,
} from '@/components/icons';
import { AccountMenu } from '@/components/layout/AccountMenu';
import { SidebarHeader } from '@/components/layout/SidebarHeader';
import { Select } from '@/components/ui/Select';
import { SyncBanner } from '@/components/layout/SyncBanner';
import { FEATURES, hasFeature } from '@/lib/features';
import { useAuth } from '@/lib/auth';
import { useSidebarCollapsed } from '@/lib/use-sidebar-collapsed';

type NavItem = {
  to: string;
  label: string;
  icon: React.FC<React.SVGProps<SVGSVGElement>>;
  feature: FeatureKey | null;
  end?: boolean;
};

type NavSection = {
  title: string;
  items: NavItem[];
};

const navSections: NavSection[] = [
  {
    title: 'Billing',
    items: [
      { to: '/sale', label: 'Register', icon: IconSale, feature: FEATURES.BILLING_CREATE_SALE },
      { to: '/sales', label: 'History', icon: IconHistory, feature: FEATURES.BILLING_CREATE_SALE },
      { to: '/discounts', label: 'Discounts', icon: IconTag, feature: FEATURES.BILLING_DISCOUNT },
    ],
  },
  {
    title: 'Catalog',
    items: [
      { to: '/inventory', label: 'Inventory', icon: IconBox, feature: FEATURES.INVENTORY_VIEW },
      { to: '/categories', label: 'Categories', icon: IconGrid, feature: FEATURES.INVENTORY_CATEGORIES },
      { to: '/brands', label: 'Brands', icon: IconBrand, feature: FEATURES.INVENTORY_VIEW },
      { to: '/suppliers', label: 'Suppliers', icon: IconSupplier, feature: FEATURES.INVENTORY_VIEW },
    ],
  },
  {
    title: 'Accounts',
    items: [
      { to: '/customers', label: 'Udhaar', icon: IconWallet, feature: FEATURES.CUSTOMERS_VIEW },
      { to: '/staff', label: 'Staff', icon: IconStaff, feature: FEATURES.USERS_MANAGE },
    ],
  },
  {
    title: 'Insights',
    items: [
      { to: '/reports', label: 'Reports', icon: IconChart, feature: FEATURES.REPORTS_VIEW },
      { to: '/settings', label: 'Settings', icon: IconSettings, feature: FEATURES.SETTINGS_VIEW },
    ],
  },
];

const dashboardItem: NavItem = {
  to: '/',
  label: 'Dashboard',
  icon: IconDashboard,
  feature: null,
  end: true,
};

function NavItemLink({ item, collapsed }: { item: NavItem; collapsed: boolean }) {
  return (
    <NavLink
      to={item.to}
      end={item.end}
      title={item.label}
      className={({ isActive }) =>
        `sidebar-nav-link flex min-h-[38px] items-center rounded-xl py-2 text-[13px] font-semibold tracking-wide transition-all ${
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
  );
}

export function AppShell() {
  const { user, branches, branchId, setBranchId } = useAuth();
  const { collapsed, toggle } = useSidebarCollapsed();

  const visibleSections = navSections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => !item.feature || hasFeature(user, item.feature)),
    }))
    .filter((section) => section.items.length > 0);

  return (
    <div className="flex min-h-screen bg-surface-muted">
      <aside
        className={`sidebar-shell sticky top-0 flex h-screen shrink-0 flex-col bg-sidebar font-sans antialiased text-text-inverse transition-[width] duration-200 ease-in-out ${
          collapsed ? 'w-[4.75rem]' : 'w-[15.5rem]'
        }`}
      >
        <SidebarHeader collapsed={collapsed} onToggle={toggle} />

        <nav
          className={`min-h-0 flex-1 overflow-y-auto overscroll-contain py-2.5 ${
            collapsed ? 'space-y-1 px-1' : 'space-y-3.5 px-1.5'
          }`}
        >
          <NavItemLink item={dashboardItem} collapsed={collapsed} />

          {visibleSections.map((section) => (
            <div key={section.title}>
              {!collapsed && (
                <p className="mb-1.5 px-3 text-[10px] font-bold uppercase tracking-[0.16em] text-brand-200/65">
                  {section.title}
                </p>
              )}
              <div className="space-y-0.5">
                {section.items.map((item) => (
                  <NavItemLink key={item.to} item={item} collapsed={collapsed} />
                ))}
              </div>
            </div>
          ))}
        </nav>

        <div className={`relative z-10 shrink-0 border-t border-sidebar-border ${collapsed ? 'p-1' : 'p-2'}`}>
          <AccountMenu placement="sidebar" collapsed={collapsed} />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {branches.length > 1 && (
          <div className="flex items-center justify-end gap-2 border-b border-border bg-surface px-4 py-2 lg:px-6">
            <span className="text-xs font-medium text-text-muted">Branch</span>
            <Select
              className="w-44 py-1.5 text-xs min-h-[36px]"
              value={branchId ?? ''}
              onChange={(e) => setBranchId(e.target.value)}
              options={branches.map((b) => ({
                value: b.id,
                label: `${b.name}${b.isDefault ? ' (default)' : ''}`,
              }))}
            />
          </div>
        )}

        <SyncBanner />

        <main className="flex-1 overflow-auto p-4 lg:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
