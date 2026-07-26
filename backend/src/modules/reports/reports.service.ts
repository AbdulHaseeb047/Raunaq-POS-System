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

  const [todaySales, todayCount, lowStock, udhaarTotal, todayReturns, returnItemsAgg] =
    await Promise.all([
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
        take: 200,
      }),
      prisma.customer.aggregate({
        where: { tenantId, deletedAt: null, balance: { gt: 0 } },
        _sum: { balance: true },
      }),
      prisma.saleReturn.aggregate({
        where: {
          tenantId,
          createdAt: { gte: startOfDay },
          ...(branchId ? { sale: { branchId } } : {}),
        },
        _sum: { totalAmount: true },
        _count: true,
      }),
      prisma.saleReturnItem.aggregate({
        where: {
          tenantId,
          saleReturn: {
            createdAt: { gte: startOfDay },
            ...(branchId ? { sale: { branchId } } : {}),
          },
        },
        _sum: { quantity: true },
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

  const grossSales = todaySales._sum.grandTotal ?? new Decimal(0);
  const returnsAmount = todayReturns._sum.totalAmount ?? new Decimal(0);
  const netSales = Decimal.max(0, grossSales.minus(returnsAmount));

  return {
    todaySalesTotal: netSales.toFixed(2),
    todayGrossSalesTotal: grossSales.toFixed(2),
    todayTransactionCount: todayCount,
    lowStockAlerts,
    outstandingUdhaar: udhaarTotal._sum.balance?.toFixed(2) ?? '0.00',
    todayReturnsAmount: returnsAmount.toFixed(2),
    todayReturnsCount: todayReturns._count,
    todayReturnedUnits: returnItemsAgg._sum.quantity?.toFixed(3) ?? '0.000',
  };
}

export async function getDailySalesReport(tenantId: string, date?: string, branchId?: string) {
  const day = date ? new Date(date) : new Date();
  day.setHours(0, 0, 0, 0);
  const nextDay = new Date(day);
  nextDay.setDate(nextDay.getDate() + 1);

  const [sales, returnsAgg] = await Promise.all([
    prisma.sale.findMany({
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
    }),
    prisma.saleReturn.aggregate({
      where: {
        tenantId,
        createdAt: { gte: day, lt: nextDay },
        ...(branchId ? { sale: { branchId } } : {}),
      },
      _sum: { totalAmount: true },
      _count: true,
    }),
  ]);

  const grossTotal = sales.reduce((sum, s) => sum.plus(s.grandTotal), new Decimal(0));
  const returnsAmount = returnsAgg._sum.totalAmount ?? new Decimal(0);
  const netTotal = Decimal.max(0, grossTotal.minus(returnsAmount));

  return {
    date: day.toISOString().slice(0, 10),
    total: netTotal.toFixed(2),
    grossTotal: grossTotal.toFixed(2),
    returnsTotal: returnsAmount.toFixed(2),
    returnsCount: returnsAgg._count,
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

  const saleWhere = {
    tenantId,
    status: 'COMPLETED' as const,
    createdAt: { gte: start, lte: end },
    ...(branchId ? { branchId } : {}),
  };

  const [sales, returns] = await Promise.all([
    prisma.sale.findMany({
      where: saleWhere,
      include: { items: { include: { product: { select: { costPrice: true } } } } },
    }),
    prisma.saleReturn.findMany({
      where: {
        tenantId,
        createdAt: { gte: start, lte: end },
        ...(branchId ? { sale: { branchId } } : {}),
      },
      include: { items: true },
    }),
  ]);

  const returnProductIds = [...new Set(returns.flatMap((r) => r.items.map((i) => i.productId)))];
  const returnProducts =
    returnProductIds.length > 0
      ? await prisma.product.findMany({
          where: { id: { in: returnProductIds }, tenantId },
          select: { id: true, costPrice: true },
        })
      : [];
  const returnCostMap = new Map(returnProducts.map((p) => [p.id, p.costPrice]));

  let grossRevenue = new Decimal(0);
  let cost = new Decimal(0);
  let tax = new Decimal(0);
  let discounts = new Decimal(0);
  let returnsAmount = new Decimal(0);
  let returnedCost = new Decimal(0);

  const productMap = new Map<string, { name: string; qty: number; revenue: number }>();

  for (const sale of sales) {
    grossRevenue = grossRevenue.plus(sale.grandTotal);
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

  for (const ret of returns) {
    returnsAmount = returnsAmount.plus(ret.totalAmount);
    for (const ri of ret.items) {
      const costPrice = returnCostMap.get(ri.productId);
      const itemCost = costPrice ? costPrice.times(ri.quantity) : new Decimal(0);
      returnedCost = returnedCost.plus(itemCost);

      const existing = productMap.get(ri.productId);
      if (existing) {
        existing.qty = Math.max(0, existing.qty - Number(ri.quantity));
        existing.revenue = Math.max(0, existing.revenue - Number(ri.refundAmount));
      }
    }
  }

  const revenue = Decimal.max(0, grossRevenue.minus(returnsAmount));
  const netCost = Decimal.max(0, cost.minus(returnedCost));
  const grossProfit = revenue.minus(netCost).minus(tax);

  const topProducts = [...productMap.entries()]
    .map(([productId, data]) => ({
      productId,
      name: data.name,
      quantitySold: data.qty,
      revenue: data.revenue.toFixed(2),
    }))
    .filter((p) => p.quantitySold > 0 || Number(p.revenue) > 0)
    .sort((a, b) => Number(b.revenue) - Number(a.revenue))
    .slice(0, 10);

  return {
    from: start.toISOString().slice(0, 10),
    to: end.toISOString().slice(0, 10),
    transactionCount: sales.length,
    returnsCount: returns.length,
    grossRevenue: grossRevenue.toFixed(2),
    returnsAmount: returnsAmount.toFixed(2),
    revenue: revenue.toFixed(2),
    cost: netCost.toFixed(2),
    grossProfit: grossProfit.toFixed(2),
    taxTotal: tax.toFixed(2),
    discountTotal: discounts.toFixed(2),
    averageTicket: sales.length > 0 ? revenue.div(sales.length).toFixed(2) : '0.00',
    topProducts,
  };
}

/** Daily series for dashboard mountain/area charts (default last 14 days). */
export async function getSalesTrend(tenantId: string, days = 14, branchId?: string) {
  const dayCount = Math.min(Math.max(days, 7), 90);
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (dayCount - 1));

  const localDateKey = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  const [sales, returns] = await Promise.all([
    prisma.sale.findMany({
      where: {
        tenantId,
        status: 'COMPLETED',
        createdAt: { gte: start, lte: end },
        ...(branchId ? { branchId } : {}),
      },
      select: { grandTotal: true, createdAt: true },
    }),
    prisma.saleReturn.findMany({
      where: {
        tenantId,
        createdAt: { gte: start, lte: end },
        ...(branchId ? { sale: { branchId } } : {}),
      },
      select: { totalAmount: true, createdAt: true },
    }),
  ]);

  const byDay = new Map<string, { sales: number; transactions: number; returns: number }>();
  for (let i = 0; i < dayCount; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    byDay.set(localDateKey(d), { sales: 0, transactions: 0, returns: 0 });
  }

  for (const s of sales) {
    const row = byDay.get(localDateKey(s.createdAt));
    if (!row) continue;
    row.sales += Number(s.grandTotal);
    row.transactions += 1;
  }

  for (const r of returns) {
    const row = byDay.get(localDateKey(r.createdAt));
    if (!row) continue;
    row.returns += Number(r.totalAmount);
  }

  const series = [...byDay.entries()].map(([date, row]) => {
    const net = Math.max(0, row.sales - row.returns);
    return {
      date,
      sales: net.toFixed(2),
      grossSales: row.sales.toFixed(2),
      transactions: row.transactions,
      returns: row.returns.toFixed(2),
    };
  });

  const totalSales = series.reduce((sum, d) => sum + parseFloat(d.sales), 0);
  const totalGrossSales = series.reduce((sum, d) => sum + parseFloat(d.grossSales), 0);
  const totalTx = series.reduce((sum, d) => sum + d.transactions, 0);
  const totalReturns = series.reduce((sum, d) => sum + parseFloat(d.returns), 0);
  const mid = Math.floor(series.length / 2);
  const firstHalf = series.slice(0, mid).reduce((sum, d) => sum + parseFloat(d.sales), 0);
  const secondHalf = series.slice(mid).reduce((sum, d) => sum + parseFloat(d.sales), 0);
  const growthPct =
    firstHalf > 0 ? ((secondHalf - firstHalf) / firstHalf) * 100 : secondHalf > 0 ? 100 : 0;

  return {
    from: localDateKey(start),
    to: localDateKey(end),
    days: dayCount,
    totalSales: totalSales.toFixed(2),
    totalGrossSales: totalGrossSales.toFixed(2),
    totalTransactions: totalTx,
    totalReturns: totalReturns.toFixed(2),
    growthPct: Math.round(growthPct * 10) / 10,
    series,
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
