import {
  createContext,
  lazy,
  Suspense,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import type { SettingsTabId } from './SettingsDialog';

type SettingsDialogContextValue = {
  openSettings: (tab?: SettingsTabId) => void;
  closeSettings: () => void;
};

const SettingsDialogContext = createContext<SettingsDialogContextValue | null>(null);

const SettingsDialogLazy = lazy(() =>
  import('./SettingsDialog').then((m) => ({ default: m.SettingsDialog })),
);

export function SettingsDialogProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<SettingsTabId>('business');

  const openSettings = useCallback((nextTab: SettingsTabId = 'business') => {
    setTab(nextTab);
    setOpen(true);
  }, []);

  const closeSettings = useCallback(() => setOpen(false), []);

  const value = useMemo(() => ({ openSettings, closeSettings }), [openSettings, closeSettings]);

  return (
    <SettingsDialogContext.Provider value={value}>
      {children}
      {open && (
        <Suspense fallback={null}>
          <SettingsDialogLazy open={open} tab={tab} onTabChange={setTab} onClose={closeSettings} />
        </Suspense>
      )}
    </SettingsDialogContext.Provider>
  );
}

export function useSettingsDialogOptional(): SettingsDialogContextValue | null {
  return useContext(SettingsDialogContext);
}

export function useSettingsDialog(): SettingsDialogContextValue {
  const ctx = useSettingsDialogOptional();
  if (!ctx) {
    throw new Error('useSettingsDialog must be used within SettingsDialogProvider');
  }
  return ctx;
}
