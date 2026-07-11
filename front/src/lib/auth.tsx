import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { api, clearTokens, getStoredBranchId, setStoredBranchId, setTokens } from '@/lib/api-client';
import type { AuthUser, Branch } from '@/types/api';
import { canUsePosApp, FEATURES, hasFeature, isPlatformAdmin } from '@/lib/features';

interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  branchId: string | null;
  branches: Branch[];
  setBranchId: (id: string) => void;
  login: (email: string, password: string) => Promise<AuthUser>;
  logout: () => Promise<void>;
  changePassword: (current: string, next: string) => Promise<void>;
  refreshUser: () => Promise<void>;
  isAdmin: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchId, setBranchIdState] = useState<string | null>(getStoredBranchId());

  const loadBranches = useCallback(async (authUser: AuthUser) => {
    if (!canUsePosApp(authUser) || !hasFeature(authUser, FEATURES.MULTI_BRANCH_ACCESS)) {
      setBranches([]);
      return;
    }
    try {
      const list = await api.branches.list();
      setBranches(list);
      const stored = getStoredBranchId();
      const defaultBranch = list.find((b) => b.isDefault) ?? list[0];
      if (stored && list.some((b) => b.id === stored)) {
        setBranchIdState(stored);
      } else if (defaultBranch) {
        setBranchIdState(defaultBranch.id);
        setStoredBranchId(defaultBranch.id);
      }
    } catch {
      setBranches([]);
    }
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      const me = await api.auth.me();
      if (!canUsePosApp(me) && !isPlatformAdmin(me)) {
        clearTokens();
        setUser(null);
        setBranches([]);
        return;
      }
      setUser(me);
      if (canUsePosApp(me)) {
        await loadBranches(me);
      } else {
        setBranches([]);
      }
    } catch {
      setUser(null);
      clearTokens();
    }
  }, [loadBranches]);

  useEffect(() => {
    void (async () => {
      const token = localStorage.getItem('pos_access_token');
      if (token) {
        await refreshUser();
      }
      setIsLoading(false);
    })();
  }, [refreshUser]);

  const login = useCallback(
    async (email: string, password: string) => {
      const result = await api.auth.login(email, password);
      setTokens(result.accessToken, result.refreshToken);
      setUser(result.user);
      if (canUsePosApp(result.user)) {
        await loadBranches(result.user);
      } else {
        setBranches([]);
      }
      return result.user;
    },
    [loadBranches],
  );

  const logout = useCallback(async () => {
    try {
      await api.auth.logout();
    } finally {
      clearTokens();
      setUser(null);
      setBranches([]);
      setBranchIdState(null);
      setStoredBranchId(null);
    }
  }, []);

  const changePassword = useCallback(
    async (currentPassword: string, newPassword: string) => {
      const result = await api.auth.changePassword(currentPassword, newPassword);
      setTokens(result.accessToken, result.refreshToken);
      setUser(result.user);
    },
    [],
  );

  const setBranchId = useCallback((id: string) => {
    setBranchIdState(id);
    setStoredBranchId(id);
  }, []);

  const isAdmin = isPlatformAdmin(user);

  const value = useMemo(
    () => ({
      user,
      isLoading,
      branchId,
      branches,
      setBranchId,
      login,
      logout,
      changePassword,
      refreshUser,
      isAdmin,
    }),
    [user, isLoading, branchId, branches, setBranchId, login, logout, changePassword, refreshUser, isAdmin],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
