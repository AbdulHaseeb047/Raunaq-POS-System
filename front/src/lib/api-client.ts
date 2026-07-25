import type {
  ApiErrorBody,
  AuthUser,
  Branch,
  Brand,
  BusinessSettings,
  Category,
  CreateSaleResponse,
  Customer,
  DailySalesReport,
  DashboardSummary,
  DiscountRule,
  DiscountUsageRow,
  FeatureRegistryItem,
  GiftCard,
  HeldCart,
  InventorySummary,
  LedgerEntry,
  LoginResponse,
  Paginated,
  Product,
  SaleDetail,
  SaleListItem,
  SalesSummaryReport,
  Supplier,
  SupplierLedgerEntry,
  SyncIssue,
  SyncStatus,
  AdminDashboard,
  SalesRep,
  TenantDetail,
  TenantRow,
  TenantUser,
  TokenPair,
  UdhaarAgingRow,
} from '@/types/api';

const API_BASE = (import.meta.env.VITE_API_URL ?? '/api').replace(/\/$/, '');

const STORAGE_ACCESS = 'pos_access_token';
const STORAGE_REFRESH = 'pos_refresh_token';
const STORAGE_BRANCH = 'pos_branch_id';

export class ApiError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public code?: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

function getAccessToken(): string | null {
  return localStorage.getItem(STORAGE_ACCESS);
}

function getRefreshToken(): string | null {
  return localStorage.getItem(STORAGE_REFRESH);
}

export function getStoredBranchId(): string | null {
  return localStorage.getItem(STORAGE_BRANCH);
}

export function setStoredBranchId(id: string | null): void {
  if (id) localStorage.setItem(STORAGE_BRANCH, id);
  else localStorage.removeItem(STORAGE_BRANCH);
}

export function setTokens(access: string, refresh: string): void {
  localStorage.setItem(STORAGE_ACCESS, access);
  localStorage.setItem(STORAGE_REFRESH, refresh);
}

export function clearTokens(): void {
  localStorage.removeItem(STORAGE_ACCESS);
  localStorage.removeItem(STORAGE_REFRESH);
}

let refreshPromise: Promise<TokenPair | null> | null = null;

async function refreshTokens(): Promise<TokenPair | null> {
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
        const data = (await res.json()) as TokenPair;
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

type RequestOptions = RequestInit & { branch?: boolean; skipAuth?: boolean };

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { branch = false, skipAuth = false, headers: initHeaders, ...init } = options;

  const headers = new Headers(initHeaders);
  if (!headers.has('Content-Type') && init.body) {
    headers.set('Content-Type', 'application/json');
  }

  if (!skipAuth) {
    const token = getAccessToken();
    if (token) headers.set('Authorization', `Bearer ${token}`);
  }

  if (branch) {
    const branchId = getStoredBranchId();
    if (branchId) headers.set('X-Branch-Id', branchId);
  }

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers,
      signal: init.signal ?? AbortSignal.timeout(20_000),
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'TimeoutError') {
      throw new ApiError(
        'Request timed out. The server is slow or unreachable — try again.',
        0,
        'TIMEOUT',
      );
    }
    const hint =
      !import.meta.env.DEV && (API_BASE === '/api' || API_BASE.startsWith('/'))
        ? ' API URL looks wrong for hosting — set VITE_API_URL to your backend (e.g. https://your-api.up.railway.app) and redeploy.'
        : ' Check your internet connection, CORS_ORIGINS on the API, and that the backend is running.';
    throw new ApiError(`Cannot reach server.${hint}`, 0, 'NETWORK_ERROR');
  }

  if (res.status === 401 && !skipAuth) {
    const refreshed = await refreshTokens();
    if (refreshed) {
      headers.set('Authorization', `Bearer ${refreshed.accessToken}`);
      res = await fetch(`${API_BASE}${path}`, {
        ...init,
        headers,
        signal: init.signal ?? AbortSignal.timeout(20_000),
      });
    }
  }

  if (!res.ok) {
    const contentType = res.headers.get('content-type') ?? '';
    if (!contentType.includes('application/json')) {
      throw new ApiError(
        `API returned ${res.status} (not JSON). On Vercel, set VITE_API_URL to your Railway backend URL — not /api.`,
        res.status,
        'BAD_API_RESPONSE',
      );
    }
    const err = (await res.json().catch(() => ({ message: res.statusText }))) as ApiErrorBody;
    // Soft-lock uses UPGRADE_REQUIRED — do not log the user out.
    // Only hard-revoke / missing tenant / deactivated user clear the session.
    const blockedCodes = new Set(['TENANT_ACCESS_REVOKED', 'TENANT_NOT_FOUND', 'USER_DEACTIVATED']);
    if (res.status === 403 && err.code && blockedCodes.has(err.code)) {
      clearTokens();
    }
    throw new ApiError(err.message ?? 'Request failed', res.status, err.code, err.details);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
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

  reports: {
    dashboard: (branchId?: string) =>
      apiRequest<DashboardSummary>(`/reports/dashboard${branchId ? `?branchId=${branchId}` : ''}`),
    dailySales: (date?: string, branchId?: string) => {
      const params = new URLSearchParams();
      if (date) params.set('date', date);
      if (branchId) params.set('branchId', branchId);
      const q = params.toString();
      return apiRequest<DailySalesReport>(`/reports/daily-sales${q ? `?${q}` : ''}`);
    },
    udhaarAging: () => apiRequest<UdhaarAgingRow[]>('/reports/udhaar-aging'),
    salesSummary: (from?: string, to?: string, branchId?: string) => {
      const params = new URLSearchParams();
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      if (branchId) params.set('branchId', branchId);
      const q = params.toString();
      return apiRequest<SalesSummaryReport>(`/reports/sales-summary${q ? `?${q}` : ''}`);
    },
    salesTrend: (days = 14, branchId?: string) => {
      const params = new URLSearchParams({ days: String(days) });
      if (branchId) params.set('branchId', branchId);
      return apiRequest<import('@/types/api').SalesTrendReport>(`/reports/sales-trend?${params}`);
    },
    stockMovement: (from?: string, to?: string) => {
      const params = new URLSearchParams();
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      const q = params.toString();
      return apiRequest<import('@/types/api').StockMovementReport>(
        `/reports/stock-movement${q ? `?${q}` : ''}`,
      );
    },
    staffPerformance: (from?: string, to?: string) => {
      const params = new URLSearchParams();
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      const q = params.toString();
      return apiRequest<import('@/types/api').StaffPerformanceRow[]>(
        `/reports/staff-performance${q ? `?${q}` : ''}`,
      );
    },
  },

  products: {
    list: (opts?: {
      search?: string;
      categoryId?: string;
      brandId?: string;
      stockStatus?: string;
      page?: number;
      pageSize?: number;
      activeOnly?: boolean;
      skipCount?: boolean;
    }) => {
      const params = new URLSearchParams({
        page: String(opts?.page ?? 1),
        pageSize: String(opts?.pageSize ?? 50),
      });
      if (opts?.search) params.set('search', opts.search);
      if (opts?.categoryId) params.set('categoryId', opts.categoryId);
      if (opts?.brandId) params.set('brandId', opts.brandId);
      if (opts?.stockStatus) params.set('stockStatus', opts.stockStatus);
      if (opts?.activeOnly) params.set('activeOnly', 'true');
      if (opts?.skipCount) params.set('skipCount', 'true');
      return apiRequest<Paginated<Product>>(`/products?${params}`);
    },
    summary: () => apiRequest<InventorySummary>('/products/summary'),
    byBarcode: (barcode: string) =>
      apiRequest<Product>(`/products/barcode/${encodeURIComponent(barcode)}`),
    miscOpen: () => apiRequest<Product>('/products/misc-open'),
    create: (body: Record<string, unknown>) =>
      apiRequest<Product>('/products', { method: 'POST', body: JSON.stringify(body) }),
    update: (id: string, body: Record<string, unknown>) =>
      apiRequest<Product>(`/products/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    adjustStock: (id: string, body: Record<string, unknown>) =>
      apiRequest<Product>(`/products/${id}/stock`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    delete: (id: string) =>
      apiRequest<{ success: boolean }>(`/products/${id}`, { method: 'DELETE' }),
    importCsv: (body: {
      rows: Array<{
        name: string;
        sellPrice: number;
        costPrice?: number | null;
        sku?: string | null;
        barcode?: string | null;
        unit?: string;
        categoryName?: string | null;
        brandName?: string | null;
        supplierName?: string | null;
        stockQuantity?: number;
        lowStockThreshold?: number | null;
        trackStock?: boolean;
        expiryDate?: string | null;
      }>;
      updateExisting?: boolean;
    }) =>
      apiRequest<{
        created: number;
        updated: number;
        skipped: number;
        errors: Array<{ row: number; message: string }>;
        total: number;
      }>('/products/import', { method: 'POST', body: JSON.stringify(body) }),
    purgeAll: () => apiRequest<{ deleted: number }>('/products?confirm=true', { method: 'DELETE' }),
  },

  brands: {
    list: () => apiRequest<Brand[]>('/brands'),
    create: (body: Record<string, unknown>) =>
      apiRequest<Brand>('/brands', { method: 'POST', body: JSON.stringify(body) }),
    update: (id: string, body: Record<string, unknown>) =>
      apiRequest<Brand>(`/brands/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    delete: (id: string) => apiRequest<{ success: boolean }>(`/brands/${id}`, { method: 'DELETE' }),
  },

  suppliers: {
    list: () => apiRequest<Supplier[]>('/suppliers'),
    create: (body: Record<string, unknown>) =>
      apiRequest<Supplier>('/suppliers', { method: 'POST', body: JSON.stringify(body) }),
    update: (id: string, body: Record<string, unknown>) =>
      apiRequest<Supplier>(`/suppliers/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    delete: (id: string) =>
      apiRequest<{ success: boolean }>(`/suppliers/${id}`, { method: 'DELETE' }),
    ledger: (id: string) => apiRequest<SupplierLedgerEntry[]>(`/suppliers/${id}/ledger`),
    stockIn: (id: string, body: Record<string, unknown>) =>
      apiRequest<Supplier>(`/suppliers/${id}/stock-in`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    payment: (id: string, body: Record<string, unknown>) =>
      apiRequest<Supplier>(`/suppliers/${id}/payments`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
  },

  categories: {
    list: () => apiRequest<Category[]>('/categories'),
    create: (body: Record<string, unknown>) =>
      apiRequest<Category>('/categories', { method: 'POST', body: JSON.stringify(body) }),
    update: (id: string, body: Record<string, unknown>) =>
      apiRequest<Category>(`/categories/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    delete: (id: string) =>
      apiRequest<{ success: boolean }>(`/categories/${id}`, { method: 'DELETE' }),
  },

  sales: {
    list: (page = 1, pageSize = 20, search?: string) => {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
      });
      if (search?.trim()) params.set('search', search.trim());
      return apiRequest<Paginated<SaleListItem>>(`/sales?${params.toString()}`);
    },
    get: (saleId: string) => apiRequest<SaleDetail>(`/sales/${saleId}`),
    create: (body: Record<string, unknown>) =>
      apiRequest<CreateSaleResponse>('/sales', {
        method: 'POST',
        body: JSON.stringify(body),
        branch: true,
      }),
    void: (saleId: string, reason: string) =>
      apiRequest<{ success: boolean }>(`/sales/${saleId}/void`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      }),
    return: (saleId: string, body: Record<string, unknown>) =>
      apiRequest<Record<string, unknown>>(`/sales/${saleId}/return`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    printSlip: (saleId: string) =>
      apiRequest<{ success: boolean; mode: 'NETWORK' }>(`/sales/${saleId}/print-slip`, {
        method: 'POST',
      }),
  },

  heldCarts: {
    list: () => apiRequest<HeldCart[]>('/held-carts'),
    save: (body: Record<string, unknown>) =>
      apiRequest<HeldCart>('/held-carts', { method: 'POST', body: JSON.stringify(body) }),
    delete: (id: string) =>
      apiRequest<{ success: boolean }>(`/held-carts/${id}`, { method: 'DELETE' }),
  },

  giftCards: {
    list: () => apiRequest<GiftCard[]>('/gift-cards'),
    create: (body: Record<string, unknown>) =>
      apiRequest<GiftCard>('/gift-cards', { method: 'POST', body: JSON.stringify(body) }),
    lookup: (code: string) =>
      apiRequest<{ id: string; code: string; balance: string }>(
        `/gift-cards/lookup/${encodeURIComponent(code)}`,
      ),
  },

  discounts: {
    list: (includeInactive = false) =>
      apiRequest<DiscountRule[]>(`/discounts${includeInactive ? '?includeInactive=true' : ''}`),
    create: (body: Record<string, unknown>) =>
      apiRequest<DiscountRule>('/discounts', { method: 'POST', body: JSON.stringify(body) }),
    update: (id: string, body: Record<string, unknown>) =>
      apiRequest<DiscountRule>(`/discounts/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    usageReport: (from?: string, to?: string) => {
      const params = new URLSearchParams();
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      const q = params.toString();
      return apiRequest<DiscountUsageRow[]>(`/discounts/usage-report${q ? `?${q}` : ''}`);
    },
  },

  customers: {
    list: (search?: string, page = 1, pageSize = 50, sortBy?: 'name' | 'balance') => {
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
      if (search) params.set('search', search);
      if (sortBy) params.set('sortBy', sortBy);
      return apiRequest<Paginated<Customer>>(`/customers?${params}`);
    },
    get: (id: string) => apiRequest<Customer>(`/customers/${id}`),
    create: (body: Record<string, unknown>) =>
      apiRequest<Customer>('/customers', { method: 'POST', body: JSON.stringify(body) }),
    update: (id: string, body: Record<string, unknown>) =>
      apiRequest<Customer>(`/customers/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    delete: (id: string) =>
      apiRequest<{ success: boolean }>(`/customers/${id}`, { method: 'DELETE' }),
    ledger: (id: string) => apiRequest<LedgerEntry[]>(`/customers/${id}/ledger`),
    payment: (id: string, body: Record<string, unknown>) =>
      apiRequest<Customer>(`/customers/${id}/payments`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    voidLedger: (customerId: string, entryId: string, reason: string) =>
      apiRequest<{ success: boolean }>(`/customers/${customerId}/ledger/${entryId}/void`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      }),
  },

  settings: {
    get: () => apiRequest<BusinessSettings>('/settings'),
    update: (body: Record<string, unknown>) =>
      apiRequest<BusinessSettings>('/settings', { method: 'PATCH', body: JSON.stringify(body) }),
    export: () => apiRequest<Record<string, unknown>>('/settings/export'),
    printerTest: () =>
      apiRequest<{ success: boolean }>('/settings/printer-test', { method: 'POST' }),
  },

  branches: {
    list: () => apiRequest<Branch[]>('/branches'),
    create: (body: Record<string, unknown>) =>
      apiRequest<Branch>('/branches', { method: 'POST', body: JSON.stringify(body) }),
    update: (id: string, body: Record<string, unknown>) =>
      apiRequest<Branch>(`/branches/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  },

  users: {
    list: (page = 1, pageSize = 20) =>
      apiRequest<Paginated<TenantUser>>(`/users?page=${page}&pageSize=${pageSize}`),
    create: (body: Record<string, unknown>) =>
      apiRequest<TenantUser>('/users', { method: 'POST', body: JSON.stringify(body) }),
    update: (userId: string, body: Record<string, unknown>) =>
      apiRequest<TenantUser>(`/users/${userId}`, { method: 'PATCH', body: JSON.stringify(body) }),
    setFeatures: (userId: string, featureKeys: string[]) =>
      apiRequest<TenantUser>(`/users/${userId}/features`, {
        method: 'PUT',
        body: JSON.stringify({ featureKeys }),
      }),
  },

  features: {
    list: () => apiRequest<FeatureRegistryItem[]>('/features'),
  },

  sync: {
    status: () => apiRequest<SyncStatus>('/sync/status'),
    issues: () => apiRequest<{ data: SyncIssue[] }>('/sync/outbox/issues'),
    retry: (outboxId: string) =>
      apiRequest<{ id: string; status: string }>(`/sync/outbox/${outboxId}/retry`, {
        method: 'POST',
      }),
    dismiss: (outboxId: string, reason: string) =>
      apiRequest<{ id: string; status: string }>(`/sync/outbox/${outboxId}/dismiss`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      }),
    run: () => apiRequest<Record<string, unknown>>('/sync/run', { method: 'POST' }),
  },

  admin: {
    dashboard: () => apiRequest<AdminDashboard>('/admin/dashboard'),
    salesReps: () => apiRequest<SalesRep[]>('/admin/sales-reps'),
    createSalesRep: (body: { email: string; password: string; fullName: string }) =>
      apiRequest<SalesRep>('/admin/sales-reps', { method: 'POST', body: JSON.stringify(body) }),
  },

  support: {
    createQuery: (body: { topic: string; subject: string; message: string }) =>
      apiRequest<{
        id: string;
        topic: string;
        subject: string;
        status: string;
        createdAt: string;
      }>('/support/queries', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
  },

  platform: {
    listTenants: (page = 1, pageSize = 20) =>
      apiRequest<Paginated<TenantRow>>(`/tenants?page=${page}&pageSize=${pageSize}`),
    getTenant: (id: string) => apiRequest<TenantDetail>(`/tenants/${id}`),
    createTenant: (body: Record<string, unknown>) =>
      apiRequest<TenantDetail>('/tenants', { method: 'POST', body: JSON.stringify(body) }),
    updateTenant: (id: string, body: Record<string, unknown>) =>
      apiRequest<TenantDetail>(`/tenants/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    setTenantFeatures: (id: string, featureKeys: string[]) =>
      apiRequest<TenantDetail>(`/tenants/${id}/features`, {
        method: 'PUT',
        body: JSON.stringify({ featureKeys }),
      }),
    revokeTenantAccess: (id: string, reason?: string) =>
      apiRequest<TenantDetail>(`/tenants/${id}/revoke-access`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      }),
    restoreTenantAccess: (
      id: string,
      body?: { subscriptionStartAt?: string; subscriptionDays?: number; feeStatus?: string },
    ) =>
      apiRequest<TenantDetail>(`/tenants/${id}/restore-access`, {
        method: 'POST',
        body: JSON.stringify(body ?? {}),
      }),
    listTenantUsers: (tenantId: string, page = 1) =>
      apiRequest<Paginated<TenantUser>>(`/tenants/${tenantId}/users?page=${page}&pageSize=50`),
    createTenantUser: (tenantId: string, body: Record<string, unknown>) =>
      apiRequest<TenantUser>(`/tenants/${tenantId}/users`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    updateTenantUser: (
      tenantId: string,
      userId: string,
      body: { isActive?: boolean; fullName?: string },
    ) =>
      apiRequest<TenantUser>(`/tenants/${tenantId}/users/${userId}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
    deleteTenantUser: (tenantId: string, userId: string) =>
      apiRequest<{ success: boolean }>(`/tenants/${tenantId}/users/${userId}`, {
        method: 'DELETE',
      }),
  },
};
