import { FEATURES, USER_ROLES, type FeatureKey } from '@pos/shared';

import type { AuthUser } from '@/types/api';

export { FEATURES };

/** Human-readable labels for plan / upgrade screens. */
export const FEATURE_LABELS: Partial<Record<FeatureKey, string>> = {
  [FEATURES.BILLING_CREATE_SALE]: 'Sales register',
  [FEATURES.BILLING_VOID_SALE]: 'Delete sale records',
  [FEATURES.BILLING_PRINT_RECEIPT]: 'Receipt printing',
  [FEATURES.BILLING_DISCOUNT]: 'Discounts',
  [FEATURES.BILLING_HELD_CARTS]: 'Held bills',
  [FEATURES.BILLING_DISCOUNT_UNLIMITED]: 'Unlimited discounts',
  [FEATURES.INVENTORY_VIEW]: 'Inventory',
  [FEATURES.INVENTORY_EDIT]: 'Edit products',
  [FEATURES.INVENTORY_STOCK_ADJUST]: 'Stock adjustments',
  [FEATURES.INVENTORY_CATEGORIES]: 'Categories',
  [FEATURES.INVENTORY_BRANDS]: 'Brands',
  [FEATURES.INVENTORY_SUPPLIERS]: 'Suppliers',
  [FEATURES.CUSTOMERS_VIEW]: 'Udhaar / customers',
  [FEATURES.CUSTOMERS_EDIT]: 'Edit customers',
  [FEATURES.CUSTOMERS_LEDGER_VIEW]: 'Udhaar ledger',
  [FEATURES.CUSTOMERS_LEDGER_RECORD]: 'Record payments',
  [FEATURES.CUSTOMERS_LEDGER_EDIT]: 'Edit ledger entries',
  [FEATURES.USERS_MANAGE]: 'Staff accounts',
  [FEATURES.REPORTS_VIEW]: 'Reports',
  [FEATURES.REPORTS_ADVANCED]: 'Advanced reports',
  [FEATURES.SETTINGS_VIEW]: 'Settings',
  [FEATURES.SETTINGS_EDIT]: 'Edit settings',
  [FEATURES.SETTINGS_RECEIPT_BRANDING]: 'Receipt branding',
  [FEATURES.SETTINGS_FBR]: 'FBR invoicing',
  [FEATURES.UI_CUSTOMIZE]: 'Customize front layout',
};

export function featureLabel(feature: FeatureKey | string): string {
  return FEATURE_LABELS[feature as FeatureKey] ?? String(feature).replace(/[._]/g, ' ');
}

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
