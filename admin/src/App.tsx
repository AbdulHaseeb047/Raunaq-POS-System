import { Navigate, Route, Routes } from 'react-router-dom';

import { AppShell } from '@/components/AppShell';
import { PageLoader } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { ChangePasswordPage } from '@/pages/ChangePasswordPage';
import { DashboardPage } from '@/pages/DashboardPage';
import { LoginPage } from '@/pages/LoginPage';
import { SalesRepsPage } from '@/pages/SalesRepsPage';
import { TenantDetailPage } from '@/pages/TenantDetailPage';
import { TenantsPage } from '@/pages/TenantsPage';

function Protected({
  children,
  allowPasswordChange,
}: {
  children: React.ReactNode;
  allowPasswordChange?: boolean;
}) {
  const { user, loading } = useAuth();
  if (loading) return <PageLoader />;
  if (!user) return <Navigate to="/login" replace />;
  if (user.mustChangePassword && !allowPasswordChange) {
    return <Navigate to="/account/password" replace />;
  }
  return <>{children}</>;
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/account/password"
        element={
          <Protected allowPasswordChange>
            <ChangePasswordPage />
          </Protected>
        }
      />
      <Route
        element={
          <Protected>
            <AppShell />
          </Protected>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="clients" element={<TenantsPage />} />
        <Route path="clients/:tenantId" element={<TenantDetailPage />} />
        <Route path="sales-reps" element={<SalesRepsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
