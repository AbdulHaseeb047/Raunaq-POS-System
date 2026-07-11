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
import { AdminDashboardPage } from '@/features/admin/AdminDashboardPage';
import { ClientDetailPage } from '@/features/admin/ClientDetailPage';
import { ClientsPage } from '@/features/admin/ClientsPage';
import { SalesRepsPage } from '@/features/admin/SalesRepsPage';
import { ChangePasswordPage } from '@/features/auth/ChangePasswordPage';
import { AccountPasswordPage } from '@/features/auth/AccountPasswordPage';
import { LoginPage } from '@/features/auth/LoginPage';
import { BrandsPage } from '@/features/catalog/BrandsPage';
import { SuppliersPage } from '@/features/catalog/SuppliersPage';
import { SalePage } from '@/features/billing/SalePage';
import { SalesHistoryPage } from '@/features/billing/SalesHistoryPage';
import { CustomersPage } from '@/features/customers/CustomersPage';
import { DashboardPage } from '@/features/dashboard/DashboardPage';
import { DiscountsPage } from '@/features/discounts/DiscountsPage';
import { CategoriesPage } from '@/features/inventory/CategoriesPage';
import { InventoryPage } from '@/features/inventory/InventoryPage';
import { ReportsPage } from '@/features/reports/ReportsPage';
import { SettingsPage } from '@/features/settings/SettingsPage';
import { StaffPage } from '@/features/staff/StaffPage';
import { hasFeature } from '@/lib/features';
import { useAuth } from '@/lib/auth';

function FeatureRoute({
  feature,
  children,
}: {
  feature: FeatureKey | null;
  children: React.ReactNode;
}) {
  const { user } = useAuth();
  if (feature && !hasFeature(user, feature)) {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<PublicOnlyRoute />}>
        <Route path="/login" element={<LoginPage />} />
      </Route>

      <Route element={<ProtectedRoute />}>
        <Route path="/change-password" element={<ChangePasswordPage />} />
        <Route path="/account/password" element={<AccountPasswordPage />} />

        <Route element={<AdminShellRoute />}>
          <Route element={<AdminAppShell />}>
            <Route path="/admin" element={<AdminDashboardPage />} />
            <Route path="/admin/clients" element={<ClientsPage />} />
            <Route path="/admin/clients/:tenantId" element={<ClientDetailPage />} />
            <Route path="/admin/sales-reps" element={<SalesRepsPage />} />
          </Route>
        </Route>

        <Route element={<PosShellRoute />}>
          <Route element={<AppShell />}>
            <Route index element={<DashboardPage />} />

            <Route
              path="sale"
              element={
                <FeatureRoute feature={FEATURES.BILLING_CREATE_SALE}>
                  <SalePage />
                </FeatureRoute>
              }
            />
            <Route
              path="inventory"
              element={
                <FeatureRoute feature={FEATURES.INVENTORY_VIEW}>
                  <InventoryPage />
                </FeatureRoute>
              }
            />
            <Route
              path="categories"
              element={
                <FeatureRoute feature={FEATURES.INVENTORY_CATEGORIES}>
                  <CategoriesPage />
                </FeatureRoute>
              }
            />
            <Route
              path="customers"
              element={
                <FeatureRoute feature={FEATURES.CUSTOMERS_VIEW}>
                  <CustomersPage />
                </FeatureRoute>
              }
            />
            <Route
              path="discounts"
              element={
                <FeatureRoute feature={FEATURES.BILLING_DISCOUNT}>
                  <DiscountsPage />
                </FeatureRoute>
              }
            />
            <Route
              path="reports"
              element={
                <FeatureRoute feature={FEATURES.REPORTS_VIEW}>
                  <ReportsPage />
                </FeatureRoute>
              }
            />
            <Route
              path="staff"
              element={
                <FeatureRoute feature={FEATURES.USERS_MANAGE}>
                  <StaffPage />
                </FeatureRoute>
              }
            />
            <Route
              path="sales"
              element={
                <FeatureRoute feature={FEATURES.BILLING_CREATE_SALE}>
                  <SalesHistoryPage />
                </FeatureRoute>
              }
            />
            <Route
              path="brands"
              element={
                <FeatureRoute feature={FEATURES.INVENTORY_VIEW}>
                  <BrandsPage />
                </FeatureRoute>
              }
            />
            <Route
              path="suppliers"
              element={
                <FeatureRoute feature={FEATURES.INVENTORY_VIEW}>
                  <SuppliersPage />
                </FeatureRoute>
              }
            />
            <Route
              path="settings"
              element={
                <FeatureRoute feature={FEATURES.SETTINGS_VIEW}>
                  <SettingsPage />
                </FeatureRoute>
              }
            />
          </Route>
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}
