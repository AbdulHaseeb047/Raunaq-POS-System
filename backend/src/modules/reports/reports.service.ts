import { Decimal } from '@prisma/client/runtime/library';

import { prisma } from '../core/prisma.js';
import { getUdhaarAging } from '../customers/ledger.service.js';

export async function getDashboardSummary(tenantId: string, branchId?: string) {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const saleWhere = {
    tenantId,
    status: 'COMPLETED' as const,
    createdAt: { gte: startOfDay },
    ...(branchId ? { branchId } : {}),
  };

  const [todaySales, todayCount, lowStock, udhaarTotal] = await Promise.all([
    prisma.sale.aggregate({ where: saleWhere, _sum: { grandTotal: true } }),
    prisma.sale.count({ where: saleWhere }),
    prisma.product.findMany({
      where: {
        tenantId,
        deletedAt: null,
        isActive: true,
        trackStock: true,
        lowStockThreshold: { not: null },
      },
      select: { id: true, name: true, stockQuantity: true, lowStockThreshold: true },
    }),
    prisma.customer.aggregate({
      where: { tenantId, deletedAt: null, balance: { gt: 0 } },
      _sum: { balance: true },
    }),
  ]);

  const lowStockAlerts = lowStock
    .filter((p) => p.lowStockThreshold && p.stockQuantity.lte(p.lowStockThreshold))
    .map((p) => ({
      id: p.id,
      name: p.name,
      stockQuantity: p.stockQuantity.toFixed(3),
      lowStockThreshold: p.lowStockThreshold!.toFixed(3),
    }));

  return {
    todaySalesTotal: todaySales._sum.grandTotal?.toFixed(2) ?? '0.00',
    todayTransactionCount: todayCount,
    lowStockAlerts,
    outstandingUdhaar: udhaarTotal._sum.balance?.toFixed(2) ?? '0.00',
  };
}

export async function getDailySalesReport(tenantId: string, date?: string, branchId?: string) {
  const day = date ? new Date(date) : new Date();
  day.setHours(0, 0, 0, 0);
  const nextDay = new Date(day);
  nextDay.setDate(nextDay.getDate() + 1);

  const sales = await prisma.sale.findMany({
    where: {
      tenantId,
      status: 'COMPLETED',
      createdAt: { gte: day, lt: nextDay },
      ...(branchId ? { branchId } : {}),
    },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      saleNumber: true,
      grandTotal: true,
      paymentStatus: true,
      createdAt: true,
      customer: { select: { name: true } },
    },
  });

  const total = sales.reduce((sum, s) => sum.plus(s.grandTotal), new Decimal(0));

  return {
    date: day.toISOString().slice(0, 10),
    total: total.toFixed(2),
    transactionCount: sales.length,
    sales: sales.map((s) => ({
      id: s.id,
      saleNumber: s.saleNumber,
      grandTotal: s.grandTotal.toFixed(2),
      paymentStatus: s.paymentStatus,
      customerName: s.customer?.name ?? null,
      createdAt: s.createdAt.toISOString(),
    })),
  };
}

export async function getUdhaarAgingReport(tenantId: string) {
  return getUdhaarAging(tenantId);
}

export async function getSalesSummary(
  tenantId: string,
  from?: string,
  to?: string,
  branchId?: string,
) {
  const start = from ? new Date(from) : new Date();
  start.setHours(0, 0, 0, 0);
  const end = to ? new Date(to) : new Date();
  end.setHours(23, 59, 59, 999);

  const sales = await prisma.sale.findMany({
    where: {
      tenantId,
      status: 'COMPLETED',
      createdAt: { gte: start, lte: end },
      ...(branchId ? { branchId } : {}),
    },
    include: { items: { include: { product: { select: { costPrice: true } } } } },
  });

  let revenue = new Decimal(0);
  let cost = new Decimal(0);
  let tax = new Decimal(0);
  let discounts = new Decimal(0);

  const productMap = new Map<string, { name: string; qty: number; revenue: number }>();

  for (const sale of sales) {
    revenue = revenue.plus(sale.grandTotal);
    tax = tax.plus(sale.taxTotal);
    discounts = discounts.plus(sale.discountTotal);

    for (const item of sale.items) {
      const itemCost = item.product.costPrice
        ? item.product.costPrice.times(item.quantity)
        : new Decimal(0);
      cost = cost.plus(itemCost);

      const existing = productMap.get(item.productId) ?? {
        name: item.productName,
        qty: 0,
        revenue: 0,
      };
      existing.qty += Number(item.quantity);
      existing.revenue += Number(item.lineTotal);
      productMap.set(item.productId, existing);
    }
  }

  const topProducts = [...productMap.entries()]
    .map(([productId, data]) => ({
      productId,
      name: data.name,
      quantitySold: data.qty,
      revenue: data.revenue.toFixed(2),
    }))
    .sort((a, b) => Number(b.revenue) - Number(a.revenue))
    .slice(0, 10);

  return {
    from: start.toISOString().slice(0, 10),
    to: end.toISOString().slice(0, 10),
    transactionCount: sales.length,
    revenue: revenue.toFixed(2),
    cost: cost.toFixed(2),
    grossProfit: revenue.minus(cost).minus(tax).toFixed(2),
    taxTotal: tax.toFixed(2),
    discountTotal: discounts.toFixed(2),
    averageTicket: sales.length > 0 ? revenue.div(sales.length).toFixed(2) : '0.00',
    topProducts,
  };
}

export async function getStockMovementReport(tenantId: string, from?: string, to?: string) {
  const start = from ? new Date(from) : new Date();
  start.setHours(0, 0, 0, 0);
  const end = to ? new Date(to) : new Date();
  end.setHours(23, 59, 59, 999);

  const movements = await prisma.stockMovement.findMany({
    where: { tenantId, createdAt: { gte: start, lte: end } },
    include: { product: { select: { name: true, sku: true } } },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });

  const products = await prisma.product.findMany({
    where: { tenantId, deletedAt: null, isActive: true, trackStock: true },
    select: { id: true, name: true, stockQuantity: true, lowStockThreshold: true },
  });

  const lowStock = products
    .filter((p) => p.lowStockThreshold && p.stockQuantity.lte(p.lowStockThreshold))
    .map((p) => ({
      id: p.id,
      name: p.name,
      stockQuantity: p.stockQuantity.toFixed(3),
      lowStockThreshold: p.lowStockThreshold!.toFixed(3),
    }));

  return {
    movements: movements.map((m) => ({
      id: m.id,
      productName: m.product.name,
      movementType: m.movementType,
      quantityDelta: m.quantityDelta.toFixed(3),
      createdAt: m.createdAt.toISOString(),
    })),
    lowStockAlerts: lowStock,
  };
}

export async function getStaffPerformanceReport(tenantId: string, from?: string, to?: string) {
  const start = from ? new Date(from) : new Date();
  start.setHours(0, 0, 0, 0);
  const end = to ? new Date(to) : new Date();
  end.setHours(23, 59, 59, 999);

  const sales = await prisma.sale.groupBy({
    by: ['cashierId'],
    where: { tenantId, status: 'COMPLETED', createdAt: { gte: start, lte: end } },
    _count: { id: true },
    _sum: { grandTotal: true },
  });

  const cashiers = await prisma.user.findMany({
    where: { id: { in: sales.map((s) => s.cashierId) } },
    select: { id: true, fullName: true },
  });
  const nameMap = new Map(cashiers.map((c) => [c.id, c.fullName]));

  return sales.map((s) => ({
    cashierId: s.cashierId,
    cashierName: nameMap.get(s.cashierId) ?? 'Unknown',
    transactionCount: s._count.id,
    totalSales: s._sum.grandTotal?.toFixed(2) ?? '0.00',
  }));
}
