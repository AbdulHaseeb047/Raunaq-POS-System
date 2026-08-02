import type { FeatureKey, UserRole } from './features.js';

/** Standard API error shape returned by the backend */
export interface ApiError {
  statusCode: number;
  error: string;
  message: string;
  details?: unknown;
}

/** Paginated list response wrapper */
export interface PaginatedResponse<T> {
  data: T[];
  meta: {
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  };
}

/** JWT access token payload (decoded, not encrypted) */
export interface JwtPayload {
  sub: string;
  tenantId: string | null;
  role: UserRole;
  features: FeatureKey[];
  iat: number;
  exp: number;
}

// --- Auth ---

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  mustChangePassword: boolean;
  user: UserSummary;
}

export interface UserSummary {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  features: FeatureKey[];
}

export interface RefreshTokenResponse {
  success: boolean;
}

// --- Health ---

export interface HealthResponse {
  status: 'ok' | 'degraded';
  timestamp: string;
  database: 'connected' | 'disconnected';
}
