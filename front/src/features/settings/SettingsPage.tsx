import { useEffect } from 'react';
import { Navigate } from 'react-router-dom';

import { useSettingsDialog } from '@/features/settings/settings-dialog-context';

/** Deep-link: open Claude-style settings window, then return home. */
export function SettingsPage() {
  const { openSettings } = useSettingsDialog();

  useEffect(() => {
    openSettings('business');
  }, [openSettings]);

  return <Navigate to="/" replace />;
}
