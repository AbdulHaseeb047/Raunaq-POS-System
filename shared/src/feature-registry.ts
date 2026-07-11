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
    description: 'POS billing, cart, checkout, sales history, held bills, gift cards',
  },
  {
    key: FEATURES.BILLING_VOID_SALE,
    module: 'billing',
    label: 'Void Sale',
    description: 'Void completed sales from sales history',
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
    description: 'Browser and network thermal printer setup and receipt printing',
  },
  {
    key: FEATURES.INVENTORY_VIEW,
    module: 'inventory',
    label: 'View Inventory',
    description: 'Product list, brands, suppliers, barcode lookup',
  },
  {
    key: FEATURES.INVENTORY_EDIT,
    module: 'inventory',
    label: 'Edit Inventory',
    description: 'Add and edit products, brands, suppliers',
  },
  {
    key: FEATURES.INVENTORY_CATEGORIES,
    module: 'inventory',
    label: 'Manage Categories',
    description: 'Product categories page',
  },
  {
    key: FEATURES.INVENTORY_STOCK_ADJUST,
    module: 'inventory',
    label: 'Stock Adjustments',
    description: 'Manual stock in/out adjustments on products',
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
    description: 'Read customer credit ledger and sale links',
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
    description: 'Void or correct ledger entries',
  },
  {
    key: FEATURES.REPORTS_VIEW,
    module: 'reports',
    label: 'View Reports',
    description: 'Sales, stock, udhaar aging, and staff performance reports',
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
    description: 'Update shop name, tax, printer, and export data',
  },
  {
    key: FEATURES.MULTI_BRANCH_ACCESS,
    module: 'multi_branch',
    label: 'Multi-Branch Access',
    description: 'Switch branches and manage multiple shop locations',
  },
];

export const SHIPPED_FEATURE_KEYS = FEATURE_REGISTRY.map((f) => f.key);

export const TIER_FEATURE_PRESETS: Record<TenantTier, FeatureKey[]> = {
  [TENANT_TIERS.STARTER]: [
    FEATURES.BILLING_CREATE_SALE,
    FEATURES.INVENTORY_VIEW,
    FEATURES.CUSTOMERS_VIEW,
    FEATURES.CUSTOMERS_LEDGER_VIEW,
    FEATURES.CUSTOMERS_LEDGER_RECORD,
    FEATURES.REPORTS_VIEW,
    FEATURES.SETTINGS_VIEW,
  ],
  [TENANT_TIERS.STANDARD]: [
    FEATURES.BILLING_CREATE_SALE,
    FEATURES.BILLING_DISCOUNT,
    FEATURES.BILLING_PRINT_RECEIPT,
    FEATURES.INVENTORY_VIEW,
    FEATURES.INVENTORY_EDIT,
    FEATURES.INVENTORY_CATEGORIES,
    FEATURES.INVENTORY_STOCK_ADJUST,
    FEATURES.CUSTOMERS_VIEW,
    FEATURES.CUSTOMERS_EDIT,
    FEATURES.CUSTOMERS_LEDGER_VIEW,
    FEATURES.CUSTOMERS_LEDGER_RECORD,
    FEATURES.REPORTS_VIEW,
    FEATURES.USERS_MANAGE,
    FEATURES.SETTINGS_VIEW,
    FEATURES.SETTINGS_EDIT,
  ],
  [TENANT_TIERS.PRO]: [
    FEATURES.BILLING_CREATE_SALE,
    FEATURES.BILLING_VOID_SALE,
    FEATURES.BILLING_DISCOUNT,
    FEATURES.BILLING_DISCOUNT_UNLIMITED,
    FEATURES.BILLING_PRINT_RECEIPT,
    FEATURES.INVENTORY_VIEW,
    FEATURES.INVENTORY_EDIT,
    FEATURES.INVENTORY_CATEGORIES,
    FEATURES.INVENTORY_STOCK_ADJUST,
    FEATURES.CUSTOMERS_VIEW,
    FEATURES.CUSTOMERS_EDIT,
    FEATURES.CUSTOMERS_LEDGER_VIEW,
    FEATURES.CUSTOMERS_LEDGER_RECORD,
    FEATURES.CUSTOMERS_LEDGER_EDIT,
    FEATURES.REPORTS_VIEW,
    FEATURES.USERS_MANAGE,
    FEATURES.SETTINGS_VIEW,
    FEATURES.SETTINGS_EDIT,
    FEATURES.MULTI_BRANCH_ACCESS,
  ],
  [TENANT_TIERS.ENTERPRISE]: [...SHIPPED_FEATURE_KEYS],
};

export function getTierFeaturePreset(tier: TenantTier): FeatureKey[] {
  return [...TIER_FEATURE_PRESETS[tier]];
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
