import { z } from 'zod';

import { prisma } from '../core/prisma.js';
import { toDecimal } from '../core/money.js';
import { SYNC_TABLES, syncUpdate } from '../sync/sync-payload.js';

export const settingsSchema = z.object({
  businessName: z.string().min(1).max(255).optional(),
  address: z.string().optional().nullable(),
  phone: z.string().max(20).optional().nullable(),
  logoUrl: z.string().optional().nullable(),
  currency: z.string().length(3).optional(),
  taxLabel: z.string().max(50).optional(),
  defaultTaxRate: z.number().nonnegative().optional(),
  printReceiptsDefault: z.boolean().optional(),
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
});

export async function ensureBusinessSettings(tenantId: string, businessName: string) {
  await prisma.businessSettings.upsert({
    where: { tenantId },
    create: { tenantId, businessName },
    update: {},
  });
}

export async function getSettings(tenantId: string) {
  let settings = await prisma.businessSettings.findUnique({ where: { tenantId } });
  if (!settings) {
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    settings = await prisma.businessSettings.create({
      data: { tenantId, businessName: tenant?.name ?? 'My Business' },
    });
  }
  return serializeSettings(settings);
}

export async function updateSettings(tenantId: string, input: z.infer<typeof settingsSchema>) {
  await getSettings(tenantId);
  const settings = await prisma.$transaction(async (tx) => {
    const updated = await tx.businessSettings.update({
      where: { tenantId },
      data: {
        businessName: input.businessName,
        address: input.address,
        phone: input.phone,
        logoUrl: input.logoUrl,
        currency: input.currency,
        taxLabel: input.taxLabel,
        defaultTaxRate: input.defaultTaxRate != null ? toDecimal(input.defaultTaxRate) : undefined,
        printReceiptsDefault: input.printReceiptsDefault,
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
      },
    });
    await syncUpdate(
      tx,
      SYNC_TABLES.businessSettings,
      { ...updated, id: updated.tenantId },
      { recordId: updated.tenantId },
    );
    return updated;
  });
  return serializeSettings(settings);
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
  };
}
