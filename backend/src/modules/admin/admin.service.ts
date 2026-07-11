import { z } from 'zod';

import { prisma } from '../core/prisma.js';
import { ConflictError } from '../core/errors.js';
import { hashPassword } from '../auth/auth.service.js';

export async function getAdminDashboard() {
  const [tenantStats, userStats, feeStats, salesReps] = await Promise.all([
    prisma.tenant.groupBy({
      by: ['isActive'],
      where: { deletedAt: null },
      _count: { _all: true },
    }),
    prisma.user.groupBy({
      by: ['isActive'],
      where: { deletedAt: null, tenantId: { not: null } },
      _count: { _all: true },
    }),
    prisma.tenant.groupBy({
      by: ['feeStatus'],
      where: { deletedAt: null },
      _count: { _all: true },
    }),
    prisma.user.findMany({
      where: { tenantId: null, role: 'SUPER_ADMIN', isSalesRep: true, deletedAt: null },
      select: { id: true, fullName: true, email: true, isActive: true },
      orderBy: { fullName: 'asc' },
    }),
  ]);

  const totalTenants = tenantStats.reduce((s, r) => s + r._count._all, 0);
  const activeTenants = tenantStats.find((r) => r.isActive)?._count._all ?? 0;
  const totalClientUsers = userStats.reduce((s, r) => s + r._count._all, 0);
  const activeClientUsers = userStats.find((r) => r.isActive)?._count._all ?? 0;

  const clientsByRep = await prisma.tenant.groupBy({
    by: ['acquiredById'],
    where: { deletedAt: null, acquiredById: { not: null } },
    _count: { _all: true },
  });

  const repMap = new Map(salesReps.map((r) => [r.id, r]));
  const repPerformance = clientsByRep.map((row) => {
    const rep = row.acquiredById ? repMap.get(row.acquiredById) : null;
    return {
      salesRepId: row.acquiredById,
      salesRepName: rep?.fullName ?? 'Unknown',
      clientCount: row._count._all,
    };
  });

  const recentTenants = await prisma.tenant.findMany({
    where: { deletedAt: null },
    orderBy: { createdAt: 'desc' },
    take: 8,
    include: {
      acquiredBy: { select: { id: true, fullName: true } },
      _count: { select: { users: true } },
    },
  });

  return {
    totals: {
      tenants: totalTenants,
      activeTenants,
      inactiveTenants: totalTenants - activeTenants,
      clientUsers: totalClientUsers,
      activeClientUsers,
      salesReps: salesReps.length,
    },
    feeStatus: feeStats.map((f) => ({ status: f.feeStatus, count: f._count._all })),
    salesRepPerformance: repPerformance,
    recentTenants: recentTenants.map((t) => ({
      id: t.id,
      name: t.name,
      slug: t.slug,
      tier: t.tier,
      isActive: t.isActive,
      feeStatus: t.feeStatus,
      monthlyFee: t.monthlyFee?.toFixed(2) ?? null,
      userCount: t._count.users,
      acquiredBy: t.acquiredBy ? { id: t.acquiredBy.id, name: t.acquiredBy.fullName } : null,
      createdAt: t.createdAt.toISOString(),
    })),
  };
}

export async function listSalesReps() {
  return prisma.user.findMany({
    where: { tenantId: null, role: 'SUPER_ADMIN', isSalesRep: true, deletedAt: null },
    select: {
      id: true,
      email: true,
      fullName: true,
      isActive: true,
      createdAt: true,
      _count: { select: { tenantsAcquired: true } },
    },
    orderBy: { fullName: 'asc' },
  }).then((rows) =>
    rows.map((r) => ({
      id: r.id,
      email: r.email,
      fullName: r.fullName,
      isActive: r.isActive,
      clientCount: r._count.tenantsAcquired,
      createdAt: r.createdAt.toISOString(),
    })),
  );
}

export const createSalesRepSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  fullName: z.string().min(1).max(255),
});

export async function createSalesRep(input: z.infer<typeof createSalesRepSchema>) {
  const existing = await prisma.user.findFirst({
    where: { email: input.email.toLowerCase(), tenantId: null, deletedAt: null },
  });
  if (existing) {
    throw new ConflictError('Email already in use');
  }

  const user = await prisma.user.create({
    data: {
      email: input.email.toLowerCase(),
      passwordHash: await hashPassword(input.password),
      fullName: input.fullName,
      role: 'SUPER_ADMIN',
      tenantId: null,
      isSalesRep: true,
      mustChangePassword: true,
    },
  });

  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    isActive: user.isActive,
    clientCount: 0,
    createdAt: user.createdAt.toISOString(),
  };
}
