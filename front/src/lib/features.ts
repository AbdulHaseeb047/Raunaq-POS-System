import { FEATURES, USER_ROLES, type FeatureKey } from '@pos/shared';

import type { AuthUser } from '@/types/api';

export { FEATURES };

export function hasFeature(user: AuthUser | null | undefined, feature: FeatureKey): boolean {
  if (!user) return false;
  return user.features.includes(feature);
}

export function isPlatformAdmin(user: AuthUser | null | undefined): boolean {
  if (!user) return false;
  return user.role === USER_ROLES.SUPER_ADMIN && !user.tenantId;
}

/** Shop POS — tenant users only. */
export function canUsePosApp(user: AuthUser | null | undefined): boolean {
  if (!user) return false;
  return Boolean(user.tenantId);
}

export function getHomePath(user: AuthUser): string {
  if (user.mustChangePassword) return '/change-password';
  if (isPlatformAdmin(user)) return '/admin';
  return '/';
}

export function hasAnyFeature(user: AuthUser | null | undefined, features: FeatureKey[]): boolean {
  return features.some((f) => hasFeature(user, f));
}

export function isClientAdmin(user: AuthUser | null | undefined): boolean {
  return user?.role === USER_ROLES.CLIENT_ADMIN || user?.role === USER_ROLES.SUPER_ADMIN;
}
