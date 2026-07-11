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

const API_BASE = import.meta.env.VITE_API_URL ?? '/api';
const STORAGE_ACCESS = 'admin_access_token';
const STORAGE_REFRESH = 'admin_refresh_token';

export function getAccessToken(): string | null {
  return localStorage.getItem(STORAGE_ACCESS);
}

function getRefreshToken(): string | null {
  return localStorage.getItem(STORAGE_REFRESH);
}

export function setTokens(access: string, refresh: string): void {
  localStorage.setItem(STORAGE_ACCESS, access);
  localStorage.setItem(STORAGE_REFRESH, refresh);
}

export function clearTokens(): void {
  localStorage.removeItem(STORAGE_ACCESS);
  localStorage.removeItem(STORAGE_REFRESH);
}

let refreshPromise: Promise<{ accessToken: string; refreshToken: string } | null> | null = null;

async function refreshTokens() {
  const refresh = getRefreshToken();
  if (!refresh) return null;
  if (!refreshPromise) {
    refreshPromise = (async () => {
      try {
        const res = await fetch(`${API_BASE}/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken: refresh }),
        });
        if (!res.ok) return null;
        const data = (await res.json()) as { accessToken: string; refreshToken: string };
        setTokens(data.accessToken, data.refreshToken);
        return data;
      } catch {
        return null;
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
  if (!skipAuth) {
    const token = getAccessToken();
    if (token) headers.set('Authorization', `Bearer ${token}`);
  }

  let res = await fetch(`${API_BASE}${path}`, { ...init, headers });
  if (res.status === 401 && !skipAuth) {
    const refreshed = await refreshTokens();
    if (refreshed) {
      headers.set('Authorization', `Bearer ${refreshed.accessToken}`);
      res = await fetch(`${API_BASE}${path}`, { ...init, headers });
    }
  }

  if (!res.ok) {
    const err = (await res.json().catch(() => ({ message: res.statusText }))) as { message?: string; code?: string };
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
  accessToken: string;
  refreshToken: string;
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
}

export interface TenantDetail {
  id: string;
  name: string;
  slug: string;
  tier: string;
  isActive: boolean;
  featureCount?: number;
  userCount?: number;
  feeStatus: string;
  monthlyFee: string | null;
  feeDueDate: string | null;
  acquiredBy: { id: string; name: string; email?: string } | null;
  createdAt: string;
  features: string[];
  users?: { id: string; email: string; fullName: string; role: string; isActive: boolean }[];
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
}

export const api = {
  auth: {
    login: (email: string, password: string) =>
      apiRequest<LoginResponse>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
        skipAuth: true,
      }),
    logout: () =>
      apiRequest<{ success: boolean }>('/auth/logout', {
        method: 'POST',
        body: JSON.stringify({ refreshToken: getRefreshToken() }),
        skipAuth: true,
      }),
    me: () => apiRequest<AuthUser>('/auth/me'),
    changePassword: (currentPassword: string, newPassword: string) =>
      apiRequest<LoginResponse>('/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword }),
      }),
  },
  admin: {
    dashboard: () => apiRequest<AdminDashboard>('/admin/dashboard'),
    salesReps: () => apiRequest<SalesRep[]>('/admin/sales-reps'),
    createSalesRep: (body: { email: string; password: string; fullName: string }) =>
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
  },
  features: {
    list: () => apiRequest<FeatureRegistryItem[]>('/features'),
  },
};
