import { z } from 'zod';

import { resolvePkDateRange } from '../core/date-bounds.js';
import { NotFoundError } from '../core/errors.js';
import { prisma } from '../core/prisma.js';
import { toDecimal } from '../core/money.js';
import { SYNC_TABLES, syncInsert, syncUpdate } from '../sync/sync-payload.js';

export const discountSchema = z.object({
  name: z.string().min(1).max(255),
  discountType: z.enum(['PERCENTAGE', 'FLAT']),
  value: z.number().positive(),
  appliesTo: z.enum(['ITEM', 'BILL']),
  productId: z.string().uuid().optional().nullable(),
  categoryId: z.string().uuid().optional().nullable(),
  minBillAmount: z.number().nonnegative().optional().nullable(),
  isActive: z.boolean().optional(),
});

export async function listDiscounts(tenantId: string, includeInactive = false) {
  const rules = await prisma.discountRule.findMany({
    where: { tenantId, deletedAt: null, ...(includeInactive ? {} : { isActive: true }) },
    orderBy: { name: 'asc' },
  });

  const usageStats = await prisma.discountUsage.groupBy({
    by: ['discountRuleId'],
    where: { tenantId, discountRuleId: { in: rules.map((r) => r.id) } },
    _count: { id: true },
    _sum: { amount: true },
  });
  const statsMap = new Map(
    usageStats.map((u) => [
      u.discountRuleId,
      { usageCount: u._count.id, totalDiscount: u._sum.amount?.toFixed(2) ?? '0.00' },
    ]),
  );

  return rules.map((r) => ({
    ...serializeDiscount(r),
    usageCount: statsMap.get(r.id)?.usageCount ?? 0,
    totalDiscountGiven: statsMap.get(r.id)?.totalDiscount ?? '0.00',
  }));
}

export async function getDiscountUsageReport(tenantId: string, from?: string, to?: string) {
  const { start, end } = resolvePkDateRange(from, to);

  const usages = await prisma.discountUsage.groupBy({
    by: ['discountRuleId'],
    where: { tenantId, createdAt: { gte: start, lte: end } },
    _count: { id: true },
    _sum: { amount: true },
  });

  const rules = await prisma.discountRule.findMany({
    where: { tenantId, id: { in: usages.map((u) => u.discountRuleId) } },
    select: { id: true, name: true },
  });
  const nameMap = new Map(rules.map((r) => [r.id, r.name]));

  return usages.map((u) => ({
    discountRuleId: u.discountRuleId,
    ruleName: nameMap.get(u.discountRuleId) ?? 'Unknown',
    usageCount: u._count.id,
    totalDiscount: u._sum.amount?.toFixed(2) ?? '0.00',
  }));
}

export async function recordDiscountUsages(
  tx: import('../core/prisma.js').TransactionClient,
  tenantId: string,
  saleId: string,
  applied: Array<{ ruleId: string; amount: number }>,
) {
  const rows = applied
    .filter((item) => item.amount > 0)
    .map((item) => ({
      tenantId,
      discountRuleId: item.ruleId,
      saleId,
      amount: toDecimal(item.amount),
    }));
  if (rows.length === 0) return;
  await tx.discountUsage.createMany({ data: rows });
}

export async function createDiscount(tenantId: string, input: z.infer<typeof discountSchema>) {
  const rule = await prisma.$transaction(async (tx) => {
    const created = await tx.discountRule.create({
      data: {
        tenantId,
        name: input.name,
        discountType: input.discountType,
        value: toDecimal(input.value),
        appliesTo: input.appliesTo,
        productId: input.productId ?? null,
        categoryId: input.categoryId ?? null,
        minBillAmount: input.minBillAmount != null ? toDecimal(input.minBillAmount) : null,
        isActive: input.isActive ?? true,
      },
    });
    await syncInsert(tx, SYNC_TABLES.discountRules, created);
    return created;
  });
  return serializeDiscount(rule);
}

export async function updateDiscount(
  tenantId: string,
  id: string,
  input: Partial<z.infer<typeof discountSchema>>,
) {
  const existing = await prisma.discountRule.findFirst({
    where: { id, tenantId, deletedAt: null },
  });
  if (!existing) throw new NotFoundError('Discount rule not found');

  const rule = await prisma.$transaction(async (tx) => {
    const updated = await tx.discountRule.update({
      where: { id },
      data: {
        name: input.name,
        discountType: input.discountType,
        value: input.value != null ? toDecimal(input.value) : undefined,
        appliesTo: input.appliesTo,
        productId: input.productId,
        categoryId: input.categoryId,
        minBillAmount: input.minBillAmount != null ? toDecimal(input.minBillAmount) : undefined,
        isActive: input.isActive,
      },
    });
    await syncUpdate(tx, SYNC_TABLES.discountRules, updated);
    return updated;
  });
  return serializeDiscount(rule);
}

function serializeDiscount(r: {
  id: string;
  name: string;
  discountType: string;
  value: { toFixed: (n: number) => string };
  appliesTo: string;
  productId: string | null;
  categoryId: string | null;
  minBillAmount: { toFixed: (n: number) => string } | null;
  isActive: boolean;
}) {
  return {
    id: r.id,
    name: r.name,
    discountType: r.discountType,
    value: r.value.toFixed(2),
    appliesTo: r.appliesTo,
    productId: r.productId,
    categoryId: r.categoryId,
    minBillAmount: r.minBillAmount?.toFixed(2) ?? null,
    isActive: r.isActive,
  };
}
