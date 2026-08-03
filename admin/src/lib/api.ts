export class ApiError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public code?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

const API_BASE = (import.meta.env.VITE_API_URL ?? '/api').replace(/\/$/, '');
const STORAGE_SESSION = 'admin_session';
const LEGACY_ACCESS = 'admin_access_token';
const LEGACY_REFRESH = 'admin_refresh_token';

export function hasSessionFlag(): boolean {
  return localStorage.getItem(STORAGE_SESSION) === '1';
}

export function markSession(): void {
  localStorage.setItem(STORAGE_SESSION, '1');
  localStorage.removeItem(LEGACY_ACCESS);
  localStorage.removeItem(LEGACY_REFRESH);
}

export function clearTokens(): void {
  localStorage.removeItem(STORAGE_SESSION);
  localStorage.removeItem(LEGACY_ACCESS);
  localStorage.removeItem(LEGACY_REFRESH);
}

/** @deprecated httpOnly cookies — kept for call-site compatibility. */
export function setTokens(_access?: string, _refresh?: string): void {
  markSession();
}

let refreshPromise: Promise<boolean> | null = null;

async function refreshTokens() {
  if (!hasSessionFlag()) return false;
  if (!refreshPromise) {
    refreshPromise = (async () => {
      try {
        const res = await fetch(`${API_BASE}/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({}),
        });
        if (!res.ok) return false;
        markSession();
        return true;
      } catch {
        return false;
      } finally {
        refreshPromise = null;
      }
    })();
  }
  return refreshPromise;
}

type RequestOptions = RequestInit & { skipAuth?: boolean };

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { skipAuth = false, headers: initHeaders, ...init } = options;
  const headers = new Headers(initHeaders);
  if (!headers.has('Content-Type') && init.body) headers.set('Content-Type', 'application/json');

  let res = await fetch(`${API_BASE}${path}`, { ...init, headers, credentials: 'include' });
  if (res.status === 401 && !skipAuth) {
    const refreshed = await refreshTokens();
    if (refreshed) {
      res = await fetch(`${API_BASE}${path}`, { ...init, headers, credentials: 'include' });
    }
  }

  if (!res.ok) {
    const err = (await res.json().catch(() => ({ message: res.statusText }))) as {
      message?: string;
      code?: string;
    };
    throw new ApiError(err.message ?? 'Request failed', res.status, err.code);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  role: string;
  tenantId: string | null;
  mustChangePassword: boolean;
}

export interface LoginResponse {
  mustChangePassword?: boolean;
  user: AuthUser;
}

export interface Paginated<T> {
  data: T[];
  meta: { total: number; page: number; pageSize: number; totalPages: number };
}

export interface AdminDashboard {
  totals: {
    tenants: number;
    activeTenants: number;
    inactiveTenants: number;
    clientUsers: number;
    activeClientUsers: number;
    salesReps: number;
  };
  feeStatus: { status: string; count: number }[];
  salesRepPerformance: { salesRepId: string | null; salesRepName: string; clientCount: number }[];
  recentTenants: {
    id: string;
    name: string;
    slug: string;
    tier: string;
    isActive: boolean;
    feeStatus: string;
    monthlyFee: string | null;
    userCount: number;
    acquiredBy: { id: string; name: string } | null;
    createdAt: string;
  }[];
}

export interface TenantRow {
  id: string;
  name: string;
  slug: string;
  tier: string;
  isActive: boolean;
  featureCount: number;
  userCount: number;
  feeStatus: string;
  monthlyFee: string | null;
  feeDueDate: string | null;
  acquiredBy: { id: string; name: string } | null;
  createdAt: string;
  subscriptionStartAt: string | null;
  subscriptionEndsAt: string | null;
  subscriptionDays: number;
  accessRevokedAt: string | null;
  accessRevokeReason: string | null;
  daysRemaining: number | null;
  subscriptionExpired: boolean;
  isTrial?: boolean;
  billingCycle?: 'monthly' | 'yearly';
  isTrialActive?: boolean;
  isPaidActive?: boolean;
  accessStatus: string;
}

export interface TenantDetail {
  id: string;
  name: string;
  slug: string;
  tier: string;
  trialPlanTier?: string | null;
  isTrial?: boolean;
  billingCycle?: 'monthly' | 'yearly';
  isActive: boolean;
  featureCount?: number;
  userCount?: number;
  feeStatus: string;
  monthlyFee: string | null;
  feeDueDate: string | null;
  acquiredBy: { id: string; name: string; email?: string } | null;
  createdAt: string;
  updatedAt?: string;
  features: string[];
  planFeatureKeys?: string[];
  featureOverrides?: string[];
  subscriptionStartAt: string | null;
  subscriptionEndsAt: string | null;
  subscriptionDays: number;
  accessRevokedAt: string | null;
  accessRevokeReason: string | null;
  daysRemaining: number | null;
  subscriptionExpired: boolean;
  isTrialActive?: boolean;
  isPaidActive?: boolean;
  isSoftLocked?: boolean;
  effectivePlan?: string;
  assignedPlan?: string;
  trialPlan?: string;
  accessStatus: string;
}

export interface SalesRep {
  id: string;
  email: string;
  fullName: string;
  isActive: boolean;
  clientCount: number;
  createdAt: string;
}

export interface FeatureRegistryItem {
  key: string;
  module: string;
  label: string;
  description?: string;
}

export interface TenantUser {
  id: string;
  email: string;
  fullName: string;
  role: string;
  isActive: boolean;
  features: string[];
  branchId: string | null;
  lastLoginAt: string | null;
  createdAt: string;
}

export const api = {
  auth: {
    login: (email: string, password: string) =>
      apiRequest<LoginResponse>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
        skipAuth: true,
      }).then((data) => {
        markSession();
        return data;
      }),
    logout: () =>
      apiRequest<{ success: boolean }>('/auth/logout', {
        method: 'POST',
        body: JSON.stringify({}),
        skipAuth: true,
      }),
    me: () => apiRequest<AuthUser>('/auth/me'),
    changePassword: (currentPassword: string, newPassword: string) =>
      apiRequest<LoginResponse>('/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword }),
      }).then((data) => {
        markSession();
        return data;
      }),
  },
  admin: {
    dashboard: () => apiRequest<AdminDashboard>('/admin/dashboard'),
    salesReps: () => apiRequest<SalesRep[]>('/admin/sales-reps'),
    createSalesRep: (body: { fullName: string }) =>
      apiRequest<SalesRep>('/admin/sales-reps', { method: 'POST', body: JSON.stringify(body) }),
  },
  tenants: {
    list: (page = 1, pageSize = 20) =>
      apiRequest<Paginated<TenantRow>>(`/tenants?page=${page}&pageSize=${pageSize}`),
    get: (id: string) => apiRequest<TenantDetail>(`/tenants/${id}`),
    create: (body: Record<string, unknown>) =>
      apiRequest<TenantDetail>('/tenants', { method: 'POST', body: JSON.stringify(body) }),
    update: (id: string, body: Record<string, unknown>) =>
      apiRequest<TenantDetail>(`/tenants/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    revokeAccess: (id: string, reason?: string) =>
      apiRequest<TenantDetail>(`/tenants/${id}/revoke-access`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      }),
    restoreAccess: (
      id: string,
      body: { subscriptionStartAt?: string; subscriptionDays?: number; feeStatus?: string },
    ) =>
      apiRequest<TenantDetail>(`/tenants/${id}/restore-access`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    setFeatures: (id: string, featureKeys: string[]) =>
      apiRequest<TenantDetail>(`/tenants/${id}/features`, {
        method: 'PUT',
        body: JSON.stringify({ featureKeys }),
      }),
    users: (tenantId: string, page = 1) =>
      apiRequest<Paginated<TenantUser>>(`/tenants/${tenantId}/users?page=${page}&pageSize=50`),
    createUser: (tenantId: string, body: Record<string, unknown>) =>
      apiRequest<TenantUser>(`/tenants/${tenantId}/users`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    updateUser: (tenantId: string, userId: string, body: Record<string, unknown>) =>
      apiRequest<TenantUser>(`/tenants/${tenantId}/users/${userId}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
    setUserFeatures: (tenantId: string, userId: string, featureKeys: string[]) =>
      apiRequest<TenantUser>(`/tenants/${tenantId}/users/${userId}/features`, {
        method: 'PUT',
        body: JSON.stringify({ featureKeys }),
      }),
    deleteUser: (tenantId: string, userId: string) =>
      apiRequest<{ success: boolean }>(`/tenants/${tenantId}/users/${userId}`, {
        method: 'DELETE',
      }),
    setUserPassword: (
      tenantId: string,
      userId: string,
      body: { password: string; mustChangePassword?: boolean },
    ) =>
      apiRequest<{ success: boolean; mustChangePassword: boolean }>(
        `/tenants/${tenantId}/users/${userId}/set-password`,
        {
          method: 'POST',
          body: JSON.stringify(body),
        },
      ),
  },
  features: {
    list: () => apiRequest<FeatureRegistryItem[]>('/features'),
  },
};
