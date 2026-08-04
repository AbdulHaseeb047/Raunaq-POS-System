import { FEATURES, TENANT_TIERS, type FeatureKey, type TenantTier } from './features.js';

export interface FeatureDefinition {
  key: FeatureKey;
  module: string;
  label: string;
  description: string;
}

/** Only features with real UI + API enforcement in the product. */
export const FEATURE_REGISTRY: FeatureDefinition[] = [
  {
    key: FEATURES.BILLING_CREATE_SALE,
    module: 'billing',
    label: 'Create Sale',
    description: 'POS billing, cart, checkout, sales history',
  },
  {
    key: FEATURES.BILLING_VOID_SALE,
    module: 'billing',
    label: 'Delete sale / Returns',
    description: 'Delete sale records and process partial returns',
  },
  {
    key: FEATURES.BILLING_DISCOUNT,
    module: 'billing',
    label: 'Apply Discounts',
    description: 'Discount rules and discounts on the sale screen',
  },
  {
    key: FEATURES.BILLING_DISCOUNT_UNLIMITED,
    module: 'billing',
    label: 'Unlimited Discounts',
    description: 'Remove discount percentage caps on sales',
  },
  {
    key: FEATURES.BILLING_PRINT_RECEIPT,
    module: 'billing',
    label: 'Print Receipts',
    description: 'Browser and network thermal receipt printing',
  },
  {
    key: FEATURES.BILLING_HELD_CARTS,
    module: 'billing',
    label: 'Held Bills',
    description: 'Park and resume carts',
  },
  {
    key: FEATURES.INVENTORY_VIEW,
    module: 'inventory',
    label: 'View Inventory',
    description: 'Product list, stock levels, barcode lookup',
  },
  {
    key: FEATURES.INVENTORY_EDIT,
    module: 'inventory',
    label: 'Edit Inventory',
    description: 'Add and edit products',
  },
  {
    key: FEATURES.INVENTORY_CATEGORIES,
    module: 'inventory',
    label: 'Manage Categories',
    description: 'Add/edit/organize product categories',
  },
  {
    key: FEATURES.INVENTORY_STOCK_ADJUST,
    module: 'inventory',
    label: 'Stock Adjustments',
    description: 'Manual stock in/out adjustments',
  },
  {
    key: FEATURES.INVENTORY_BRANDS,
    module: 'inventory',
    label: 'Brands',
    description: 'Brand catalog management',
  },
  {
    key: FEATURES.INVENTORY_SUPPLIERS,
    module: 'inventory',
    label: 'Suppliers',
    description: 'Supplier catalog and purchases',
  },
  {
    key: FEATURES.INVENTORY_PRODUCT_IMAGES,
    module: 'inventory',
    label: 'Product Images',
    description: 'Upload product images and show them on the sale register',
  },
  {
    key: FEATURES.CUSTOMERS_VIEW,
    module: 'customers',
    label: 'View Customers',
    description: 'Udhaar customer list and profiles',
  },
  {
    key: FEATURES.CUSTOMERS_EDIT,
    module: 'customers',
    label: 'Edit Customers',
    description: 'Create and update customer records',
  },
  {
    key: FEATURES.CUSTOMERS_LEDGER_VIEW,
    module: 'customers',
    label: 'View Udhaar Ledger',
    description: 'Read customer credit ledger',
  },
  {
    key: FEATURES.CUSTOMERS_LEDGER_RECORD,
    module: 'customers',
    label: 'Record Udhaar/Payments',
    description: 'Record udhaar sales and customer payments',
  },
  {
    key: FEATURES.CUSTOMERS_LEDGER_EDIT,
    module: 'customers',
    label: 'Edit Ledger Entries',
    description: 'Void or correct ledger entries and statements',
  },
  {
    key: FEATURES.REPORTS_VIEW,
    module: 'reports',
    label: 'View Reports',
    description: 'Sales and growth reports',
  },
  {
    key: FEATURES.REPORTS_ADVANCED,
    module: 'reports',
    label: 'Advanced Reports',
    description: 'Udhaar aging and staff performance reports',
  },
  {
    key: FEATURES.USERS_MANAGE,
    module: 'users',
    label: 'Manage Staff',
    description: 'Add staff accounts and assign permissions',
  },
  {
    key: FEATURES.SETTINGS_VIEW,
    module: 'settings',
    label: 'View Settings',
    description: 'View shop business settings',
  },
  {
    key: FEATURES.SETTINGS_EDIT,
    module: 'settings',
    label: 'Edit Settings',
    description: 'Update shop profile, tax, and printer settings',
  },
  {
    key: FEATURES.SETTINGS_RECEIPT_BRANDING,
    module: 'settings',
    label: 'Receipt Branding',
    description: 'Logo, header mode, and custom footer on receipts',
  },
  {
    key: FEATURES.SETTINGS_FBR,
    module: 'settings',
    label: 'FBR Invoice Fields',
    description: 'FBR POS ID, STRN, and QR on invoices',
  },
  {
    key: FEATURES.MULTI_BRANCH_ACCESS,
    module: 'multi_branch',
    label: 'Multi-Branch Access',
    description: 'Switch branches and manage multiple shop locations',
  },
  {
    key: FEATURES.UI_CUSTOMIZE,
    module: 'ui',
    label: 'Customize Front',
    description: 'Curate Sale Quick pick products and rearrange Dashboard sections',
  },
];

export const SHIPPED_FEATURE_KEYS = FEATURE_REGISTRY.map((f) => f.key);

const STARTER_FEATURES: FeatureKey[] = [
  FEATURES.BILLING_CREATE_SALE,
  FEATURES.BILLING_VOID_SALE,
  FEATURES.BILLING_PRINT_RECEIPT,
  FEATURES.INVENTORY_VIEW,
  FEATURES.INVENTORY_EDIT,
  FEATURES.INVENTORY_STOCK_ADJUST,
  FEATURES.CUSTOMERS_VIEW,
  FEATURES.CUSTOMERS_EDIT,
  FEATURES.CUSTOMERS_LEDGER_VIEW,
  FEATURES.CUSTOMERS_LEDGER_RECORD,
  FEATURES.SETTINGS_VIEW,
];

const STANDARD_FEATURES: FeatureKey[] = [
  ...STARTER_FEATURES,
  FEATURES.BILLING_HELD_CARTS,
  FEATURES.BILLING_DISCOUNT,
  FEATURES.BILLING_DISCOUNT_UNLIMITED,
  FEATURES.INVENTORY_CATEGORIES,
  FEATURES.INVENTORY_BRANDS,
  FEATURES.INVENTORY_SUPPLIERS,
  FEATURES.INVENTORY_PRODUCT_IMAGES,
  FEATURES.CUSTOMERS_LEDGER_EDIT,
  FEATURES.REPORTS_VIEW,
  FEATURES.USERS_MANAGE,
  FEATURES.SETTINGS_EDIT,
  FEATURES.SETTINGS_RECEIPT_BRANDING,
  FEATURES.UI_CUSTOMIZE,
];

const PRO_FEATURES: FeatureKey[] = [
  ...STANDARD_FEATURES,
  FEATURES.REPORTS_ADVANCED,
  FEATURES.SETTINGS_FBR,
  FEATURES.MULTI_BRANCH_ACCESS,
];

/** Single source of truth: plan → feature keys. */
export const PLAN_FEATURES: Record<TenantTier, FeatureKey[]> = {
  [TENANT_TIERS.STARTER]: STARTER_FEATURES,
  [TENANT_TIERS.STANDARD]: STANDARD_FEATURES,
  [TENANT_TIERS.PRO]: PRO_FEATURES,
};

/** @deprecated Prefer PLAN_FEATURES — kept for existing imports. */
export const TIER_FEATURE_PRESETS = PLAN_FEATURES;

export function getTierFeaturePreset(tier: TenantTier): FeatureKey[] {
  return [...(PLAN_FEATURES[tier] ?? PLAN_FEATURES[TENANT_TIERS.STARTER])];
}

export function normalizePlanTier(tier: TenantTier | string | null | undefined): TenantTier {
  if (
    tier === TENANT_TIERS.STANDARD ||
    tier === TENANT_TIERS.PRO ||
    tier === TENANT_TIERS.STARTER
  ) {
    return tier;
  }
  // Legacy Enterprise (and any unknown value) maps to Pro.
  if (tier === 'ENTERPRISE') return TENANT_TIERS.PRO;
  return TENANT_TIERS.STARTER;
}

export function planHasFeature(tier: TenantTier, feature: FeatureKey): boolean {
  return getTierFeaturePreset(tier).includes(feature);
}

export function groupFeaturesByModule(
  features: FeatureDefinition[],
): Record<string, FeatureDefinition[]> {
  return features.reduce<Record<string, FeatureDefinition[]>>((acc, f) => {
    (acc[f.module] ??= []).push(f);
    return acc;
  }, {});
}

/** Legacy keys removed from the product — kept for DB cleanup migrations. */
export const DEPRECATED_FEATURE_KEYS = [
  'delivery.basic',
  'delivery.rider_app',
  'delivery.gps_tracking',
  'delivery.aggregator_sync',
  'fbr.integration',
  'reports.analytics_dashboard',
] as const;
