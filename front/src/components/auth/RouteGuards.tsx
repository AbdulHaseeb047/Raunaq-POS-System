import { Navigate, Outlet, useLocation } from 'react-router-dom';

import { PageLoader } from '@/components/ui/Spinner';
import { hasSessionFlag } from '@/lib/api-client';
import { getHomePath, isPlatformAdmin, canUsePosApp } from '@/lib/features';
import { useAuth } from '@/lib/auth';

export function ProtectedRoute() {
  const { user, isLoading } = useAuth();
  const location = useLocation();
  const hasSession = hasSessionFlag();

  if (isLoading) return <PageLoader />;

  // Cookie session present but /me still hydrating — keep shell instead of bouncing to login.
  if (!user && hasSession) return <PageLoader />;

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (user.mustChangePassword && location.pathname !== '/change-password') {
    return <Navigate to="/change-password" replace />;
  }

  return <Outlet />;
}

export function PublicOnlyRoute() {
  const { user, isLoading } = useAuth();

  if (isLoading) return <PageLoader />;

  if (user) {
    return <Navigate to={getHomePath(user)} replace />;
  }

  return <Outlet />;
}

export function PosShellRoute() {
  const { user, isLoading } = useAuth();
  const hasSession = hasSessionFlag();

  if (isLoading) return <PageLoader />;
  if (!user && hasSession) return <PageLoader />;
  if (!user) return <Navigate to="/login" replace />;
  if (isPlatformAdmin(user)) return <Navigate to="/admin" replace />;
  if (!canUsePosApp(user)) return <Navigate to="/login" replace />;

  return <Outlet />;
}

export function AdminShellRoute() {
  const { user, isLoading } = useAuth();
  const hasSession = hasSessionFlag();

  if (isLoading) return <PageLoader />;
  if (!user && hasSession) return <PageLoader />;
  if (!user) return <Navigate to="/login" replace />;
  if (!isPlatformAdmin(user)) return <Navigate to="/" replace />;

  return <Outlet />;
}
