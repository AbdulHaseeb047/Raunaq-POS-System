import { useEffect } from 'react';
import { Navigate } from 'react-router-dom';

import { useAuth } from '@/lib/auth';
import { useSettingsDialog } from '@/features/settings/settings-dialog-context';

/**
 * POS deep-link: open settings on the Password tab.
 * Admin password uses AdminPasswordDialog via AccountMenu / admin route wrapper.
 */
export function AccountPasswordPage() {
  const { isAdmin } = useAuth();
  const { openSettings } = useSettingsDialog();

  useEffect(() => {
    if (!isAdmin) openSettings('password');
  }, [isAdmin, openSettings]);

  if (isAdmin) return <Navigate to="/admin" replace />;
  return <Navigate to="/" replace />;
}
