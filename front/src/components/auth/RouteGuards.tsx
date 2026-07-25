import { Navigate, Outlet, useLocation } from 'react-router-dom';

import { PageLoader } from '@/components/ui/Spinner';
import { getHomePath, isPlatformAdmin, canUsePosApp } from '@/lib/features';
import { useAuth } from '@/lib/auth';

export function ProtectedRoute() {
  const { user, isLoading } = useAuth();
  const location = useLocation();
  const hasToken =
    typeof localStorage !== 'undefined' && Boolean(localStorage.getItem('pos_access_token'));

  if (isLoading) return <PageLoader />;

  // Token present but /me still hydrating — keep shell instead of bouncing to login.
  if (!user && hasToken) return <PageLoader />;

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
  const hasToken =
    typeof localStorage !== 'undefined' && Boolean(localStorage.getItem('pos_access_token'));

  if (isLoading) return <PageLoader />;
  if (!user && hasToken) return <PageLoader />;
  if (!user) return <Navigate to="/login" replace />;
  if (isPlatformAdmin(user)) return <Navigate to="/admin" replace />;
  if (!canUsePosApp(user)) return <Navigate to="/login" replace />;

  return <Outlet />;
}

export function AdminShellRoute() {
  const { user, isLoading } = useAuth();
  const hasToken =
    typeof localStorage !== 'undefined' && Boolean(localStorage.getItem('pos_access_token'));

  if (isLoading) return <PageLoader />;
  if (!user && hasToken) return <PageLoader />;
  if (!user) return <Navigate to="/login" replace />;
  if (!isPlatformAdmin(user)) return <Navigate to="/" replace />;

  return <Outlet />;
}
