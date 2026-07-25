import { lazy, Suspense, type ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { FEATURES } from '@pos/shared';
import type { FeatureKey } from '@pos/shared';

import {
  AdminShellRoute,
  PosShellRoute,
  ProtectedRoute,
  PublicOnlyRoute,
} from '@/components/auth/RouteGuards';
import { AdminAppShell } from '@/components/layout/AdminAppShell';
import { AppShell } from '@/components/layout/AppShell';
import { PageLoader } from '@/components/ui/Spinner';
import { LoginPage } from '@/features/auth/LoginPage';
import { ChangePasswordPage } from '@/features/auth/ChangePasswordPage';
import { AccountPasswordPage } from '@/features/auth/AccountPasswordPage';
import { AdminAccountPasswordPage } from '@/features/auth/AdminAccountPasswordPage';
import { SettingsPage } from '@/features/settings/SettingsPage';
import { hasFeature } from '@/lib/features';
import { useAuth } from '@/lib/auth';

const DashboardPage = lazy(() =>
  import('@/features/dashboard/DashboardPage').then((m) => ({ default: m.DashboardPage })),
);
const SalePage = lazy(() =>
  import('@/features/billing/SalePage').then((m) => ({ default: m.SalePage })),
);
const SalesHistoryPage = lazy(() =>
  import('@/features/billing/SalesHistoryPage').then((m) => ({ default: m.SalesHistoryPage })),
);
const InventoryPage = lazy(() =>
  import('@/features/inventory/InventoryPage').then((m) => ({ default: m.InventoryPage })),
);
const CategoriesPage = lazy(() =>
  import('@/features/inventory/CategoriesPage').then((m) => ({ default: m.CategoriesPage })),
);
const CustomersPage = lazy(() =>
  import('@/features/customers/CustomersPage').then((m) => ({ default: m.CustomersPage })),
);
const DiscountsPage = lazy(() =>
  import('@/features/discounts/DiscountsPage').then((m) => ({ default: m.DiscountsPage })),
);
const ReportsPage = lazy(() =>
  import('@/features/reports/ReportsPage').then((m) => ({ default: m.ReportsPage })),
);
const StaffPage = lazy(() =>
  import('@/features/staff/StaffPage').then((m) => ({ default: m.StaffPage })),
);
const BrandsPage = lazy(() =>
  import('@/features/catalog/BrandsPage').then((m) => ({ default: m.BrandsPage })),
);
const SuppliersPage = lazy(() =>
  import('@/features/catalog/SuppliersPage').then((m) => ({ default: m.SuppliersPage })),
);
const SupportPage = lazy(() =>
  import('@/features/support/SupportPage').then((m) => ({ default: m.SupportPage })),
);
const UpgradePlansPage = lazy(() =>
  import('@/features/billing/UpgradePlansPage').then((m) => ({ default: m.UpgradePlansPage })),
);
const AdminDashboardPage = lazy(() =>
  import('@/features/admin/AdminDashboardPage').then((m) => ({ default: m.AdminDashboardPage })),
);
const ClientsPage = lazy(() =>
  import('@/features/admin/ClientsPage').then((m) => ({ default: m.ClientsPage })),
);
const ClientDetailPage = lazy(() =>
  import('@/features/admin/ClientDetailPage').then((m) => ({ default: m.ClientDetailPage })),
);
const SalesRepsPage = lazy(() =>
  import('@/features/admin/SalesRepsPage').then((m) => ({ default: m.SalesRepsPage })),
);

function FeatureRoute({
  feature,
  children,
}: {
  feature: FeatureKey | null;
  children: ReactNode;
}) {
  const { user } = useAuth();
  if (feature && !hasFeature(user, feature)) {
    return <Navigate to="/upgrade" replace state={{ fromFeature: feature }} />;
  }
  return <>{children}</>;
}

function LazyPage({ children }: { children: ReactNode }) {
  return <Suspense fallback={<PageLoader />}>{children}</Suspense>;
}

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<PublicOnlyRoute />}>
        <Route path="/login" element={<LoginPage />} />
      </Route>

      <Route element={<ProtectedRoute />}>
        <Route path="/change-password" element={<ChangePasswordPage />} />

        <Route element={<AdminShellRoute />}>
          <Route element={<AdminAppShell />}>
            <Route
              path="/admin"
              element={
                <LazyPage>
                  <AdminDashboardPage />
                </LazyPage>
              }
            />
            <Route
              path="/admin/clients"
              element={
                <LazyPage>
                  <ClientsPage />
                </LazyPage>
              }
            />
            <Route
              path="/admin/clients/:tenantId"
              element={
                <LazyPage>
                  <ClientDetailPage />
                </LazyPage>
              }
            />
            <Route
              path="/admin/sales-reps"
              element={
                <LazyPage>
                  <SalesRepsPage />
                </LazyPage>
              }
            />
            <Route path="/admin/account/password" element={<AdminAccountPasswordPage />} />
          </Route>
        </Route>

        <Route element={<PosShellRoute />}>
          <Route element={<AppShell />}>
            <Route
              index
              element={
                <LazyPage>
                  <DashboardPage />
                </LazyPage>
              }
            />
            <Route path="account/password" element={<AccountPasswordPage />} />

            <Route
              path="sale"
              element={
                <FeatureRoute feature={FEATURES.BILLING_CREATE_SALE}>
                  <LazyPage>
                    <SalePage />
                  </LazyPage>
                </FeatureRoute>
              }
            />
            <Route
              path="inventory"
              element={
                <FeatureRoute feature={FEATURES.INVENTORY_VIEW}>
                  <LazyPage>
                    <InventoryPage />
                  </LazyPage>
                </FeatureRoute>
              }
            />
            <Route
              path="categories"
              element={
                <FeatureRoute feature={FEATURES.INVENTORY_CATEGORIES}>
                  <LazyPage>
                    <CategoriesPage />
                  </LazyPage>
                </FeatureRoute>
              }
            />
            <Route
              path="customers"
              element={
                <FeatureRoute feature={FEATURES.CUSTOMERS_VIEW}>
                  <LazyPage>
                    <CustomersPage />
                  </LazyPage>
                </FeatureRoute>
              }
            />
            <Route
              path="discounts"
              element={
                <FeatureRoute feature={FEATURES.BILLING_DISCOUNT}>
                  <LazyPage>
                    <DiscountsPage />
                  </LazyPage>
                </FeatureRoute>
              }
            />
            <Route
              path="reports"
              element={
                <FeatureRoute feature={FEATURES.REPORTS_VIEW}>
                  <LazyPage>
                    <ReportsPage />
                  </LazyPage>
                </FeatureRoute>
              }
            />
            <Route
              path="staff"
              element={
                <FeatureRoute feature={FEATURES.USERS_MANAGE}>
                  <LazyPage>
                    <StaffPage />
                  </LazyPage>
                </FeatureRoute>
              }
            />
            <Route
              path="sales"
              element={
                <FeatureRoute feature={FEATURES.BILLING_CREATE_SALE}>
                  <LazyPage>
                    <SalesHistoryPage />
                  </LazyPage>
                </FeatureRoute>
              }
            />
            <Route
              path="brands"
              element={
                <FeatureRoute feature={FEATURES.INVENTORY_BRANDS}>
                  <LazyPage>
                    <BrandsPage />
                  </LazyPage>
                </FeatureRoute>
              }
            />
            <Route
              path="suppliers"
              element={
                <FeatureRoute feature={FEATURES.INVENTORY_SUPPLIERS}>
                  <LazyPage>
                    <SuppliersPage />
                  </LazyPage>
                </FeatureRoute>
              }
            />
            <Route path="settings" element={<SettingsPage />} />
            <Route
              path="support"
              element={
                <LazyPage>
                  <SupportPage />
                </LazyPage>
              }
            />
            <Route
              path="upgrade"
              element={
                <LazyPage>
                  <UpgradePlansPage />
                </LazyPage>
              }
            />
          </Route>
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}
