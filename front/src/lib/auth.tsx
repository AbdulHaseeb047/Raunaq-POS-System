import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import {
  api,
  clearTokens,
  getStoredBranchId,
  setStoredBranchId,
  setTokens,
} from '@/lib/api-client';
import type { AuthUser, Branch } from '@/types/api';
import { canUsePosApp, FEATURES, hasFeature, isPlatformAdmin } from '@/lib/features';

const USER_CACHE_KEY = 'pos_user_cache';

function readCachedUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem(USER_CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

function writeCachedUser(user: AuthUser | null) {
  try {
    if (!user) localStorage.removeItem(USER_CACHE_KEY);
    else localStorage.setItem(USER_CACHE_KEY, JSON.stringify(user));
  } catch {
    /* ignore quota */
  }
}

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
  const [user, setUser] = useState<AuthUser | null>(() => {
    if (typeof localStorage === 'undefined') return null;
    if (!localStorage.getItem('pos_access_token')) return null;
    return readCachedUser();
  });
  // Cached user + token → show shell immediately; revalidate in background.
  const [isLoading, setIsLoading] = useState(() => {
    if (typeof localStorage === 'undefined') return true;
    const token = localStorage.getItem('pos_access_token');
    if (!token) return false;
    return !readCachedUser();
  });
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchId, setBranchIdState] = useState<string | null>(getStoredBranchId());

  const applyUser = useCallback((next: AuthUser | null) => {
    setUser(next);
    writeCachedUser(next);
  }, []);

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
        applyUser(null);
        setBranches([]);
        return;
      }
      applyUser(me);
      // Branches are not required for first paint — load in background.
      if (canUsePosApp(me)) {
        void loadBranches(me);
      } else {
        setBranches([]);
      }
    } catch {
      applyUser(null);
      clearTokens();
    }
  }, [applyUser, loadBranches]);

  useEffect(() => {
    void (async () => {
      const accessToken = localStorage.getItem('pos_access_token');
      if (accessToken) {
        await refreshUser();
      } else {
        applyUser(null);
      }
      setIsLoading(false);
    })();
  }, [refreshUser, applyUser]);

  const login = useCallback(
    async (email: string, password: string) => {
      const result = await api.auth.login(email, password);
      setTokens(result.accessToken, result.refreshToken);
      applyUser(result.user);
      if (canUsePosApp(result.user)) {
        void loadBranches(result.user);
      } else {
        setBranches([]);
      }
      return result.user;
    },
    [applyUser, loadBranches],
  );

  const logout = useCallback(async () => {
    try {
      await api.auth.logout();
    } finally {
      clearTokens();
      applyUser(null);
      setBranches([]);
      setBranchIdState(null);
      setStoredBranchId(null);
    }
  }, [applyUser]);

  const changePassword = useCallback(
    async (currentPassword: string, newPassword: string) => {
      const result = await api.auth.changePassword(currentPassword, newPassword);
      setTokens(result.accessToken, result.refreshToken);
      applyUser(result.user);
    },
    [applyUser],
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
    [
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
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
