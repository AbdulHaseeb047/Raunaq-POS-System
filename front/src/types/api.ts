import type { FeatureKey, UserRole } from '@pos/shared';

export interface ApiErrorBody {
  statusCode: number;
  error: string;
  message: string;
  code?: string;
  details?: unknown;
}

export interface PaginatedMeta {
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface Paginated<T> {
  data: T[];
  meta: PaginatedMeta;
}

export interface PlanEntitlement {
  tier?: string;
  trialPlanTier?: string | null;
  assignedPlan?: string;
  trialPlan?: string;
  effectivePlan?: string;
  accessStatus?: string;
  isTrialActive?: boolean;
  isPaidActive?: boolean;
  isSoftLocked?: boolean;
  daysRemaining?: number | null;
  subscriptionStartAt?: string | null;
  subscriptionEndsAt?: string | null;
  subscriptionDays?: number;
  /** monthly when subscriptionDays < 300, yearly otherwise */
  billingCycle?: 'monthly' | 'yearly';
  upgradeUrl?: string;
}

export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  tenantId?: string | null;
  features: FeatureKey[];
  mustChangePassword: boolean;
  planEntitlement?: PlanEntitlement | null;
}

export interface LoginResponse {
  mustChangePassword: boolean;
  user: AuthUser;
}

export interface DashboardSummary {
  todaySalesTotal: string;
  /** Gross COMPLETED sales before subtracting returns. */
  todayGrossSalesTotal?: string;
  todayTransactionCount: number;
  averageOrderValue?: string;
  revenueChangePct?: number;
  aovChangePct?: number;
  transactionChangePct?: number;
  from?: string;
  to?: string;
  chartMode?: 'hourly' | 'daily';
  compareLabel?: string;
  /** Total products below threshold (may exceed alerts list). */
  lowStockCount: number;
  /** Preview list (top 5). */
  lowStockAlerts: Array<{
    id: string;
    name: string;
    stockQuantity: string;
    lowStockThreshold: string;
  }>;
  /** Sum of cost × qty for active products. */
  inventoryValue?: string;
  /** Total active products in the catalog. */
  totalProducts?: number;
  outstandingUdhaar: string;
  todayReturnsAmount?: string;
  todayReturnsCount?: number;
  todayReturnedUnits?: string;
  hourlySales?: Array<{
    hour: string;
    revenue: number;
    transactions: number;
  }>;
  paymentMethods?: Array<{
    name: string;
    value: number;
    amount?: string;
    color: string;
  }>;
  topProducts?: Array<{
    name: string;
    revenue: number;
  }>;
}

export interface SalesTrendPoint {
  date: string;
  /** Net sales (gross − returns) for the day. */
  sales: string;
  grossSales?: string;
  transactions: number;
  returns: string;
}

export interface SalesTrendReport {
  from: string;
  to: string;
  days: number;
  /** Net sales across the period. */
  totalSales: string;
  totalGrossSales?: string;
  totalTransactions: number;
  totalReturns: string;
  growthPct: number;
  series: SalesTrendPoint[];
}

export interface Product {
  id: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  unit: string;
  costPrice: string | null;
  sellPrice: string;
  stockQuantity: string;
  lowStockThreshold: string | null;
  taxRate: string;
  expiryDate: string | null;
  trackStock: boolean;
  isActive: boolean;
  category: { id: string; name: string } | null;
  brand: { id: string; name: string } | null;
  supplier: { id: string; name: string } | null;
}

export interface Brand {
  id: string;
  name: string;
  isActive: boolean;
}

export interface Supplier {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  balance: string;
  isActive: boolean;
}

export interface SupplierLedgerEntry {
  id: string;
  entryType: string;
  amount: string;
  balanceAfter: string;
  paymentMethod: string | null;
  notes: string | null;
  referenceType: string | null;
  referenceId: string | null;
  recordedBy: { id: string; fullName: string } | null;
  createdAt: string;
  description: string;
  stockIn: {
    productId: string;
    productName: string;
    sku: string | null;
    unit: string;
    quantity: string;
    notes: string | null;
  } | null;
}

export interface InventorySummary {
  totalProducts: number;
  healthyCount: number;
  lowStockCount: number;
  outOfStockCount: number;
  inventoryValue: string;
  projectedProfit: string;
}

export interface HeldCart {
  id: string;
  name: string | null;
  cartData: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface GiftCard {
  id: string;
  code: string;
  initialBalance: string;
  balance: string;
  isActive: boolean;
  expiresAt: string | null;
}

export interface SaleDetail {
  id: string;
  saleNumber: string;
  status: string;
  subtotal: string;
  discountTotal: string;
  taxTotal: string;
  grandTotal: string;
  amountReceived: string | null;
  changeGiven: string | null;
  paymentStatus: string;
  notes: string | null;
  createdAt: string;
  voidedAt: string | null;
  voidReason: string | null;
  fbrInvoiceNumber: string | null;
  fbrQrData: string | null;
  customer: { id: string; name: string; phone: string | null } | null;
  cashier: { id: string; fullName: string };
  items: Array<{
    id: string;
    productId: string;
    productName: string;
    unitPrice: string;
    quantity: string;
    discountAmount: string;
    taxAmount: string;
    lineTotal: string;
    returnedQuantity?: string;
    returnableQuantity?: string;
  }>;
  payments: Array<{ id: string; paymentMethod: string; amount: string }>;
  returns: Array<{
    id: string;
    returnNumber: string;
    reason: string;
    totalAmount: string;
    createdAt: string;
    items: Array<{
      id: string;
      saleItemId: string;
      productName: string;
      quantity: string;
      refundAmount: string;
    }>;
  }>;
  receipt: {
    businessName: string;
    address: string | null;
    phone: string | null;
    logoUrl?: string | null;
    receiptHeaderMode?: 'NAME' | 'LOGO' | 'BOTH';
    taxLabel: string;
    receiptFooter: string | null;
    currency: string;
    fbrEnabled: boolean;
    fbrPosId: string | null;
    fbrStrn: string | null;
    fbrRegisteredName: string | null;
    builtBy: string;
  };
}

export interface SalesSummaryReport {
  from: string;
  to: string;
  transactionCount: number;
  returnsCount?: number;
  grossRevenue?: string;
  returnsAmount?: string;
  /** Net revenue after returns. */
  revenue: string;
  cost: string;
  grossProfit: string;
  taxTotal: string;
  discountTotal: string;
  averageTicket: string;
  topProducts: Array<{
    productId: string;
    name: string;
    quantitySold: number;
    revenue: string;
  }>;
}

export interface StockMovementReport {
  movements: Array<{
    id: string;
    productName: string;
    movementType: string;
    quantityDelta: string;
    createdAt: string;
  }>;
  /** @deprecated Prefer Inventory page stock filters (`?stock=low`). */
  lowStockAlerts?: Array<{
    id: string;
    name: string;
    stockQuantity: string;
    lowStockThreshold: string;
  }>;
}

export interface StaffPerformanceRow {
  cashierId: string;
  cashierName: string;
  transactionCount: number;
  totalSales: string;
}

export interface DiscountUsageRow {
  discountRuleId: string;
  ruleName: string;
  usageCount: number;
  totalDiscount: string;
}

export interface Category {
  id: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
}

export interface Customer {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  creditLimit: string | null;
  balance: string;
  notes: string | null;
  isActive: boolean;
}

export interface LedgerEntry {
  id: string;
  entryType: string;
  amount: string;
  balanceAfter: string;
  paymentMethod: string | null;
  notes: string | null;
  voidedAt: string | null;
  recordedBy: { id: string; fullName: string } | null;
  createdAt: string;
  saleId: string | null;
  saleNumber: string | null;
  saleTotal: string | null;
  dueDate: string | null;
  daysOutstanding: number | null;
  remainingAmount: string | null;
  description: string;
}

export interface SaleListItem {
  id: string;
  saleNumber: string;
  status?: string;
  subtotal?: string;
  discountTotal?: string;
  taxTotal?: string;
  grandTotal: string;
  paymentStatus: string;
  createdAt: string;
  customer: { id: string; name: string; phone?: string | null } | null;
  cashier?: { id: string; fullName: string };
  itemCount?: number;
  payments?: Array<{ paymentMethod: string; amount: string }>;
  hasReturns?: boolean;
  returnedTotal?: string;
  netTotal?: string;
}

export interface CreateSaleResponse {
  sale: {
    id: string;
    saleNumber: string;
    grandTotal: string;
    paymentStatus: string;
    createdAt: string;
  };
  /** Full receipt payload — avoids a second GET after checkout. */
  detail?: SaleDetail;
  printReceipt: boolean;
  creditLimitWarning?: string;
}

export interface DiscountRule {
  id: string;
  name: string;
  discountType: string;
  value: string;
  appliesTo: string;
  productId: string | null;
  categoryId: string | null;
  minBillAmount: string | null;
  isActive: boolean;
  usageCount?: number;
  totalDiscountGiven?: string;
}

export interface BusinessSettings {
  tenantId: string;
  businessName: string;
  address: string | null;
  phone: string | null;
  logoUrl: string | null;
  currency: string;
  taxLabel: string;
  defaultTaxRate: string;
  printReceiptsDefault: boolean;
  receiptFooter: string | null;
  receiptHeaderMode: 'NAME' | 'LOGO' | 'BOTH';
  maxDiscountPercentStaff: string | null;
  fbrEnabled: boolean;
  fbrPosId: string | null;
  fbrStrn: string | null;
  fbrRegisteredName: string | null;
  printerMode: 'BROWSER' | 'NETWORK';
  printerHost: string | null;
  printerPort: number;
  printerPaperWidth: 58 | 80;
}

export interface Branch {
  id: string;
  name: string;
  code: string;
  address: string | null;
  phone: string | null;
  isDefault: boolean;
  isActive: boolean;
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

export interface DailySalesReport {
  date: string;
  total: string;
  transactionCount: number;
  sales: Array<{
    id: string;
    saleNumber: string;
    grandTotal: string;
    paymentStatus: string;
    customerName: string | null;
    createdAt: string;
  }>;
}

export interface UdhaarAgingRow {
  customerId: string;
  name: string;
  phone: string | null;
  bucket0_7: string;
  bucket8_30: string;
  bucket30_plus: string;
  total: string;
}

export interface SyncStatus {
  deploymentMode: string;
  pendingChanges: number;
  conflictChanges: number;
  failedChanges: number;
  status: 'synced' | 'pending' | 'conflict' | 'failed';
  userMessage: string | null;
  workerRunning: boolean;
  workerConfigured: boolean;
  lastPushedAt: string | null;
  lastPulledAt: string | null;
  cloudCursor: string | null;
}

export interface SyncIssue {
  id: string;
  tableName: string;
  recordId: string;
  operation: string;
  status: string;
  errorMessage: string | null;
  retryCount: number;
  createdAt: string;
  syncedAt: string | null;
}

export interface FeatureRegistryItem {
  key: string;
  module: string;
  label: string;
  description: string | null;
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
  accessStatus: string;
}

export interface TenantDetail {
  id: string;
  name: string;
  slug: string;
  tier: string;
  trialPlanTier?: string | null;
  isActive: boolean;
  feeStatus: string;
  monthlyFee: string | null;
  feeDueDate: string | null;
  acquiredBy: { id: string; name: string; email?: string } | null;
  createdAt: string;
  updatedAt?: string;
  features: string[];
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
