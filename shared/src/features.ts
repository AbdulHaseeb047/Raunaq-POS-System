/**
 * Central feature key registry.
 * Single source of truth for frontend and backend permission checks.
 * Only shipped (implemented) features are listed here.
 */
export const FEATURES = {
  // Billing
  BILLING_CREATE_SALE: 'billing.create_sale',
  BILLING_VOID_SALE: 'billing.void_sale',
  BILLING_DISCOUNT: 'billing.discount',
  BILLING_DISCOUNT_UNLIMITED: 'billing.discount_unlimited',
  BILLING_PRINT_RECEIPT: 'billing.print_receipt',
  BILLING_HELD_CARTS: 'billing.held_carts',

  // Inventory
  INVENTORY_VIEW: 'inventory.view',
  INVENTORY_EDIT: 'inventory.edit',
  INVENTORY_CATEGORIES: 'inventory.categories',
  INVENTORY_STOCK_ADJUST: 'inventory.stock_adjust',
  INVENTORY_BRANDS: 'inventory.brands',
  INVENTORY_SUPPLIERS: 'inventory.suppliers',
  INVENTORY_PRODUCT_IMAGES: 'inventory.product_images',

  // Customers & Udhaar
  CUSTOMERS_VIEW: 'customers.view',
  CUSTOMERS_EDIT: 'customers.edit',
  CUSTOMERS_LEDGER_VIEW: 'customers.ledger_view',
  CUSTOMERS_LEDGER_RECORD: 'customers.ledger_record',
  CUSTOMERS_LEDGER_EDIT: 'customers.ledger_edit',

  // Reports
  REPORTS_VIEW: 'reports.view',
  REPORTS_ADVANCED: 'reports.advanced',

  // Users & Settings
  USERS_MANAGE: 'users.manage',
  SETTINGS_VIEW: 'settings.view',
  SETTINGS_EDIT: 'settings.edit',
  SETTINGS_RECEIPT_BRANDING: 'settings.receipt_branding',
  SETTINGS_FBR: 'settings.fbr',

  // Multi-branch
  MULTI_BRANCH_ACCESS: 'multi_branch.access',

  // Front customization (Standard+)
  UI_CUSTOMIZE: 'ui.customize',
} as const;

export type FeatureKey = (typeof FEATURES)[keyof typeof FEATURES];

export const FEATURE_MODULES = [
  'billing',
  'inventory',
  'customers',
  'reports',
  'users',
  'settings',
  'multi_branch',
  'ui',
] as const;

export type FeatureModule = (typeof FEATURE_MODULES)[number];

export const USER_ROLES = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  CLIENT_ADMIN: 'CLIENT_ADMIN',
  STAFF: 'STAFF',
} as const;

export type UserRole = (typeof USER_ROLES)[keyof typeof USER_ROLES];

export const DEPLOYMENT_MODES = {
  CLOUD: 'cloud',
  OFFLINE: 'offline',
  HYBRID: 'hybrid',
} as const;

export type DeploymentMode = (typeof DEPLOYMENT_MODES)[keyof typeof DEPLOYMENT_MODES];

export const TENANT_TIERS = {
  STARTER: 'STARTER',
  STANDARD: 'STANDARD',
  PRO: 'PRO',
} as const;

export type TenantTier = (typeof TENANT_TIERS)[keyof typeof TENANT_TIERS];
