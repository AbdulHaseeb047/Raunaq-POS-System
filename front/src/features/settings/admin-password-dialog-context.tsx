import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

import { AdminPasswordDialog } from './AdminPasswordDialog';

type Ctx = {
  openPasswordSettings: () => void;
  closePasswordSettings: () => void;
};

const AdminPasswordDialogContext = createContext<Ctx | null>(null);

export function AdminPasswordDialogProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const openPasswordSettings = useCallback(() => setOpen(true), []);
  const closePasswordSettings = useCallback(() => setOpen(false), []);
  const value = useMemo(
    () => ({ openPasswordSettings, closePasswordSettings }),
    [openPasswordSettings, closePasswordSettings],
  );

  return (
    <AdminPasswordDialogContext.Provider value={value}>
      {children}
      <AdminPasswordDialog open={open} onClose={closePasswordSettings} />
    </AdminPasswordDialogContext.Provider>
  );
}

export function useAdminPasswordDialogOptional(): Ctx | null {
  return useContext(AdminPasswordDialogContext);
}

export function useAdminPasswordDialog(): Ctx {
  const ctx = useAdminPasswordDialogOptional();
  if (!ctx) {
    throw new Error('useAdminPasswordDialog must be used within AdminPasswordDialogProvider');
  }
  return ctx;
}
