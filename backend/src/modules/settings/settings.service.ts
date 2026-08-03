import { Prisma } from '@prisma/client';
import { z } from 'zod';

import { ForbiddenError, ValidationError } from '../core/errors.js';
import { prisma } from '../core/prisma.js';
import { toDecimal } from '../core/money.js';
import { SYNC_TABLES, syncUpdate } from '../sync/sync-payload.js';

export const DASHBOARD_WIDGET_IDS = [
  'kpis',
  'trend',
  'payments',
  'topProducts',
  'topCategories',
  'returns',
  'lowStock',
] as const;

export type DashboardWidgetId = (typeof DASHBOARD_WIDGET_IDS)[number];

const dashboardWidgetSchema = z.object({
  id: z.enum(DASHBOARD_WIDGET_IDS),
  visible: z.boolean(),
});

export const dashboardLayoutSchema = z.object({
  widgets: z.array(dashboardWidgetSchema).min(1).max(DASHBOARD_WIDGET_IDS.length),
});

const uuidListSchema = z
  .array(z.string().uuid())
  .max(40)
  .transform((ids) => Array.from(new Set(ids)));

export const settingsSchema = z.object({
  businessName: z.string().min(1).max(255).optional(),
  address: z.string().optional().nullable(),
  phone: z.string().max(20).optional().nullable(),
  logoUrl: z.string().optional().nullable(),
  currency: z.string().length(3).optional(),
  taxLabel: z.string().max(50).optional(),
  defaultTaxRate: z.number().nonnegative().optional(),
  printReceiptsDefault: z.boolean().optional(),
  showReceiptAfterSale: z.boolean().optional(),
  receiptFooter: z.string().optional().nullable(),
  receiptHeaderMode: z.enum(['NAME', 'LOGO', 'BOTH']).optional(),
  maxDiscountPercentStaff: z.number().nonnegative().optional().nullable(),
  fbrEnabled: z.boolean().optional(),
  fbrPosId: z.string().max(50).optional().nullable(),
  fbrStrn: z.string().max(50).optional().nullable(),
  fbrRegisteredName: z.string().max(255).optional().nullable(),
  printerMode: z.enum(['BROWSER', 'NETWORK']).optional(),
  printerHost: z.string().max(255).optional().nullable(),
  printerPort: z.number().int().min(1).max(65535).optional(),
  printerPaperWidth: z.union([z.literal(58), z.literal(80)]).optional(),
  saleQuickPickIds: uuidListSchema.optional(),
  dashboardLayout: dashboardLayoutSchema.nullable().optional(),
});

export function settingsPatchTouchesLayout(input: z.infer<typeof settingsSchema>): boolean {
  return input.saleQuickPickIds !== undefined || input.dashboardLayout !== undefined;
}

/** Core columns only — works before ui_customize_layout migration. */
const CORE_SETTINGS_SELECT = {
  tenantId: true,
  businessName: true,
  address: true,
  phone: true,
  logoUrl: true,
  currency: true,
  taxLabel: true,
  defaultTaxRate: true,
  printReceiptsDefault: true,
  showReceiptAfterSale: true,
  receiptFooter: true,
  receiptHeaderMode: true,
  maxDiscountPercentStaff: true,
  fbrEnabled: true,
  fbrPosId: true,
  fbrStrn: true,
  fbrRegisteredName: true,
  printerMode: true,
  printerHost: true,
  printerPort: true,
  printerPaperWidth: true,
} as const;

const FULL_SETTINGS_SELECT = {
  ...CORE_SETTINGS_SELECT,
  saleQuickPickIds: true,
  dashboardLayout: true,
} as const;

/** Cached: true when business_settings.sale_quick_pick_ids exists. */
let layoutColumnsAvailable: boolean | null = null;
let layoutEnsurePromise: Promise<boolean> | null = null;

export function resetLayoutColumnsCache(): void {
  layoutColumnsAvailable = null;
  layoutEnsurePromise = null;
}

/**
 * Self-heal: add Customize columns if the migration was never applied on this DB.
 * Safe to run repeatedly (IF NOT EXISTS).
 */
export async function ensureLayoutColumns(): Promise<boolean> {
  if (layoutColumnsAvailable === true) return true;
  if (layoutEnsurePromise) return layoutEnsurePromise;

  layoutEnsurePromise = (async () => {
    try {
      const rows = await prisma.$queryRaw<Array<{ ok: boolean }>>`
        SELECT EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'business_settings'
            AND column_name = 'sale_quick_pick_ids'
        ) AS ok
      `;
      if (rows[0]?.ok) {
        layoutColumnsAvailable = true;
        return true;
      }

      await prisma.$executeRawUnsafe(`
        ALTER TABLE business_settings
          ADD COLUMN IF NOT EXISTS sale_quick_pick_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
          ADD COLUMN IF NOT EXISTS dashboard_layout JSONB
      `);

      layoutColumnsAvailable = true;
      return true;
    } catch {
      layoutColumnsAvailable = false;
      return false;
    } finally {
      layoutEnsurePromise = null;
    }
  })();

  return layoutEnsurePromise;
}

export async function hasLayoutColumns(): Promise<boolean> {
  if (layoutColumnsAvailable != null) return layoutColumnsAvailable;
  return ensureLayoutColumns();
}

function isMissingLayoutColumnError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /sale_quick_pick_ids|dashboard_layout|column .* does not exist/i.test(msg);
}

async function settingsSelect() {
  return (await hasLayoutColumns()) ? FULL_SETTINGS_SELECT : CORE_SETTINGS_SELECT;
}

export async function ensureBusinessSettings(tenantId: string, businessName: string) {
  const hasLayout = await hasLayoutColumns();
  if (hasLayout) {
    await prisma.businessSettings.upsert({
      where: { tenantId },
      create: { tenantId, businessName },
      update: {},
    });
  } else {
    await prisma.$executeRaw`
      INSERT INTO business_settings (tenant_id, business_name)
      VALUES (${tenantId}::uuid, ${businessName})
      ON CONFLICT (tenant_id) DO NOTHING
    `;
  }
  settingsCache.delete(tenantId);
}

const SETTINGS_CACHE_TTL_MS = 45_000;
const settingsCache = new Map<
  string,
  { at: number; value: ReturnType<typeof serializeSettings> }
>();

export async function getSettings(tenantId: string) {
  const hit = settingsCache.get(tenantId);
  if (hit && Date.now() - hit.at < SETTINGS_CACHE_TTL_MS) {
    return hit.value;
  }

  const select = await settingsSelect();
  let settings = await prisma.businessSettings.findUnique({
    where: { tenantId },
    select,
  });

  if (!settings) {
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    const name = tenant?.name ?? 'My Business';
    try {
      if (await hasLayoutColumns()) {
        settings = await prisma.businessSettings.create({
          data: { tenantId, businessName: name },
          select,
        });
      } else {
        await prisma.$executeRaw`
          INSERT INTO business_settings (tenant_id, business_name)
          VALUES (${tenantId}::uuid, ${name})
          ON CONFLICT (tenant_id) DO NOTHING
        `;
        settings = await prisma.businessSettings.findUnique({
          where: { tenantId },
          select: CORE_SETTINGS_SELECT,
        });
      }
    } catch (err) {
      if (isMissingLayoutColumnError(err)) {
        layoutColumnsAvailable = false;
        await prisma.$executeRaw`
          INSERT INTO business_settings (tenant_id, business_name)
          VALUES (${tenantId}::uuid, ${name})
          ON CONFLICT (tenant_id) DO NOTHING
        `;
        settings = await prisma.businessSettings.findUnique({
          where: { tenantId },
          select: CORE_SETTINGS_SELECT,
        });
      } else {
        throw err;
      }
    }
  }

  if (!settings) {
    throw new ValidationError('Could not load business settings');
  }

  const serialized = serializeSettings(settings);
  settingsCache.set(tenantId, { at: Date.now(), value: serialized });
  return serialized;
}

export async function updateSettings(
  tenantId: string,
  input: z.infer<typeof settingsSchema>,
  opts?: { allowLayout?: boolean },
) {
  if (settingsPatchTouchesLayout(input) && !opts?.allowLayout) {
    throw new ForbiddenError(
      'This feature requires a plan upgrade. Contact Raunaq to unlock it.',
      'UPGRADE_REQUIRED',
    );
  }

  const hasLayout = await ensureLayoutColumns();
  if (settingsPatchTouchesLayout(input) && !hasLayout) {
    throw new ValidationError(
      'Could not create layout columns on the database. Check DB permissions, then retry Customize.',
    );
  }

  await getSettings(tenantId);
  settingsCache.delete(tenantId);

  const data: Prisma.BusinessSettingsUpdateInput = {
    businessName: input.businessName,
    address: input.address,
    phone: input.phone,
    logoUrl: input.logoUrl,
    currency: input.currency,
    taxLabel: input.taxLabel,
    defaultTaxRate: input.defaultTaxRate != null ? toDecimal(input.defaultTaxRate) : undefined,
    printReceiptsDefault: input.printReceiptsDefault,
    showReceiptAfterSale: input.showReceiptAfterSale,
    receiptFooter: input.receiptFooter,
    ...(input.receiptHeaderMode ? { receiptHeaderMode: input.receiptHeaderMode } : {}),
    maxDiscountPercentStaff:
      input.maxDiscountPercentStaff != null ? toDecimal(input.maxDiscountPercentStaff) : undefined,
    fbrEnabled: input.fbrEnabled,
    fbrPosId: input.fbrPosId,
    fbrStrn: input.fbrStrn,
    fbrRegisteredName: input.fbrRegisteredName,
    printerMode: input.printerMode,
    printerHost: input.printerHost,
    printerPort: input.printerPort,
    printerPaperWidth: input.printerPaperWidth,
  };

  if (hasLayout) {
    if (input.saleQuickPickIds !== undefined) {
      data.saleQuickPickIds = input.saleQuickPickIds;
    }
    if (input.dashboardLayout !== undefined) {
      data.dashboardLayout = input.dashboardLayout === null ? Prisma.DbNull : input.dashboardLayout;
    }
  }

  const select = hasLayout ? FULL_SETTINGS_SELECT : CORE_SETTINGS_SELECT;

  try {
    const settings = await prisma.$transaction(async (tx) => {
      const updated = await tx.businessSettings.update({
        where: { tenantId },
        data,
        select,
      });
      await syncUpdate(
        tx,
        SYNC_TABLES.businessSettings,
        { ...updated, id: updated.tenantId },
        { recordId: updated.tenantId },
      );
      return updated;
    });
    const serialized = serializeSettings(settings);
    settingsCache.set(tenantId, { at: Date.now(), value: serialized });
    return serialized;
  } catch (err) {
    if (isMissingLayoutColumnError(err)) {
      layoutColumnsAvailable = false;
      const healed = await ensureLayoutColumns();
      if (healed) {
        // Retry once after self-heal.
        const settings = await prisma.$transaction(async (tx) => {
          const updated = await tx.businessSettings.update({
            where: { tenantId },
            data,
            select: FULL_SETTINGS_SELECT,
          });
          await syncUpdate(
            tx,
            SYNC_TABLES.businessSettings,
            { ...updated, id: updated.tenantId },
            { recordId: updated.tenantId },
          );
          return updated;
        });
        const serialized = serializeSettings(settings);
        settingsCache.set(tenantId, { at: Date.now(), value: serialized });
        return serialized;
      }
      throw new ValidationError(
        'Could not create layout columns on the database. Check DB permissions, then retry Customize.',
      );
    }
    throw err;
  }
}

export async function exportTenantData(tenantId: string) {
  const [products, customers, ledger] = await Promise.all([
    prisma.product.findMany({ where: { tenantId, deletedAt: null } }),
    prisma.customer.findMany({ where: { tenantId, deletedAt: null } }),
    prisma.customerLedgerEntry.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      take: 5000,
    }),
  ]);

  return {
    exportedAt: new Date().toISOString(),
    note: 'Sales records are exported as PDF from Sales History or Settings. Use Inventory page for CSV import/export.',
    products: products.map((p) => ({
      id: p.id,
      name: p.name,
      sku: p.sku,
      barcode: p.barcode,
      sellPrice: p.sellPrice.toFixed(2),
      costPrice: p.costPrice?.toFixed(2) ?? null,
      stockQuantity: p.stockQuantity.toFixed(3),
    })),
    customers: customers.map((c) => ({
      id: c.id,
      name: c.name,
      phone: c.phone,
      balance: c.balance.toFixed(2),
      creditLimit: c.creditLimit?.toFixed(2) ?? null,
    })),
    ledger: ledger.map((e) => ({
      id: e.id,
      customerId: e.customerId,
      entryType: e.entryType,
      amount: e.amount.toFixed(2),
      balanceAfter: e.balanceAfter.toFixed(2),
      createdAt: e.createdAt.toISOString(),
    })),
  };
}

function parseSaleQuickPickIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((id): id is string => typeof id === 'string' && id.length > 0).slice(0, 40);
}

function parseDashboardLayout(raw: unknown): z.infer<typeof dashboardLayoutSchema> | null {
  if (raw == null) return null;
  const parsed = dashboardLayoutSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

function serializeSettings(s: {
  tenantId: string;
  businessName: string;
  address: string | null;
  phone: string | null;
  logoUrl: string | null;
  currency: string;
  taxLabel: string;
  defaultTaxRate: { toFixed: (n: number) => string };
  printReceiptsDefault: boolean;
  showReceiptAfterSale?: boolean;
  receiptFooter: string | null;
  receiptHeaderMode?: string;
  maxDiscountPercentStaff: { toFixed: (n: number) => string } | null;
  fbrEnabled: boolean;
  fbrPosId: string | null;
  fbrStrn: string | null;
  fbrRegisteredName: string | null;
  printerMode: string;
  printerHost: string | null;
  printerPort: number;
  printerPaperWidth: number;
  saleQuickPickIds?: unknown;
  dashboardLayout?: unknown;
}) {
  return {
    tenantId: s.tenantId,
    businessName: s.businessName,
    address: s.address,
    phone: s.phone,
    logoUrl: s.logoUrl,
    currency: s.currency,
    taxLabel: s.taxLabel,
    defaultTaxRate: s.defaultTaxRate.toFixed(2),
    printReceiptsDefault: s.printReceiptsDefault,
    showReceiptAfterSale: s.showReceiptAfterSale ?? true,
    receiptFooter: s.receiptFooter,
    receiptHeaderMode: (s.receiptHeaderMode === 'LOGO' || s.receiptHeaderMode === 'BOTH'
      ? s.receiptHeaderMode
      : 'NAME') as 'NAME' | 'LOGO' | 'BOTH',
    maxDiscountPercentStaff: s.maxDiscountPercentStaff?.toFixed(2) ?? null,
    fbrEnabled: s.fbrEnabled,
    fbrPosId: s.fbrPosId,
    fbrStrn: s.fbrStrn,
    fbrRegisteredName: s.fbrRegisteredName,
    printerMode: s.printerMode,
    printerHost: s.printerHost,
    printerPort: s.printerPort,
    printerPaperWidth: s.printerPaperWidth,
    saleQuickPickIds: parseSaleQuickPickIds(s.saleQuickPickIds),
    dashboardLayout: parseDashboardLayout(s.dashboardLayout),
  };
}
