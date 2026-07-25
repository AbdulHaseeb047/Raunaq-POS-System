import { z } from 'zod';

import { USER_ROLES } from '@pos/shared';
import type { FeatureKey, UserRole } from '@pos/shared';

import { writeAuditLog } from '../audit/audit.service.js';
import { hashPassword } from '../auth/auth.service.js';
import { ConflictError, ForbiddenError, NotFoundError } from '../core/errors.js';
import { prisma } from '../core/prisma.js';
import {
  assertStaffFeaturesSubset,
  getTenantFeatures,
  setStaffFeatures,
} from '../permissions/permissions.service.js';

export const createUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  fullName: z.string().min(1).max(255),
  role: z.enum([USER_ROLES.STAFF, USER_ROLES.CLIENT_ADMIN]).default(USER_ROLES.STAFF),
  featureKeys: z.array(z.string()).optional(),
  branchId: z.string().uuid().optional().nullable(),
});

export const updateUserSchema = z.object({
  fullName: z.string().min(1).max(255).optional(),
  isActive: z.boolean().optional(),
  branchId: z.string().uuid().optional().nullable(),
});

export const setStaffFeaturesSchema = z.object({
  featureKeys: z.array(z.string()),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;

async function assertTenantBranch(tenantId: string, branchId: string): Promise<void> {
  const branch = await prisma.branch.findFirst({
    where: { id: branchId, tenantId, deletedAt: null, isActive: true },
  });
  if (!branch) {
    throw new NotFoundError('Branch not found');
  }
}

export async function listTenantUsers(tenantId: string, page = 1, pageSize = 20) {
  const skip = (page - 1) * pageSize;

  const [data, total] = await prisma.$transaction([
    prisma.user.findMany({
      where: { tenantId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      skip,
      take: pageSize,
      include: {
        staffFeatures: { select: { featureKey: true } },
      },
    }),
    prisma.user.count({ where: { tenantId, deletedAt: null } }),
  ]);

  return {
    data: data.map((u) => ({
      id: u.id,
      email: u.email,
      fullName: u.fullName,
      role: u.role,
      isActive: u.isActive,
      features: u.role === USER_ROLES.STAFF ? u.staffFeatures.map((f) => f.featureKey) : [],
      branchId: u.branchId,
      lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
      createdAt: u.createdAt.toISOString(),
    })),
    meta: { total, page, pageSize, totalPages: Math.ceil(total / pageSize) },
  };
}

export async function createTenantUser(
  tenantId: string,
  input: CreateUserInput,
  createdById: string,
  callerRole: UserRole,
) {
  if (input.role === USER_ROLES.CLIENT_ADMIN && callerRole !== USER_ROLES.SUPER_ADMIN) {
    throw new ForbiddenError('Only Super Admin can create Client Admin users');
  }

  const existing = await prisma.user.findFirst({
    where: { tenantId, email: input.email.toLowerCase(), deletedAt: null },
  });
  if (existing) {
    throw new ConflictError('Email already in use for this tenant');
  }

  if (input.branchId) {
    await assertTenantBranch(tenantId, input.branchId);
  }

  const user = await prisma.user.create({
    data: {
      tenantId,
      email: input.email.toLowerCase(),
      passwordHash: await hashPassword(input.password),
      fullName: input.fullName,
      role: input.role,
      branchId: input.branchId ?? null,
      mustChangePassword: false,
    },
  });

  if (input.role === USER_ROLES.STAFF && input.featureKeys && input.featureKeys.length > 0) {
    const tenantFeatures = await getTenantFeatures(tenantId);
    const requested = input.featureKeys as FeatureKey[];
    assertStaffFeaturesSubset(requested, tenantFeatures);
    await setStaffFeatures(user.id, requested, createdById, tenantId);
  }

  const withFeatures = await prisma.user.findUnique({
    where: { id: user.id },
    include: { staffFeatures: { select: { featureKey: true } } },
  });

  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    role: user.role,
    isActive: user.isActive,
    features: withFeatures?.staffFeatures.map((f) => f.featureKey) ?? [],
    branchId: user.branchId,
    createdAt: user.createdAt.toISOString(),
  };
}

export async function updateTenantUser(
  tenantId: string,
  userId: string,
  input: z.infer<typeof updateUserSchema>,
) {
  const user = await prisma.user.findFirst({
    where: { id: userId, tenantId, deletedAt: null },
  });
  if (!user) {
    throw new NotFoundError('User not found');
  }

  if (input.branchId) {
    await assertTenantBranch(tenantId, input.branchId);
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: {
      fullName: input.fullName,
      isActive: input.isActive,
      branchId: input.branchId,
    },
    include: { staffFeatures: { select: { featureKey: true } } },
  });

  if (input.isActive === false) {
    await prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  return {
    id: updated.id,
    email: updated.email,
    fullName: updated.fullName,
    role: updated.role,
    isActive: updated.isActive,
    features: updated.staffFeatures.map((f) => f.featureKey),
    branchId: updated.branchId,
    createdAt: updated.createdAt.toISOString(),
  };
}

export async function updateUserFeatures(
  tenantId: string,
  userId: string,
  featureKeys: FeatureKey[],
  grantedById: string,
  ipAddress?: string,
) {
  const user = await prisma.user.findFirst({
    where: { id: userId, tenantId, deletedAt: null, role: USER_ROLES.STAFF },
  });
  if (!user) {
    throw new NotFoundError('Staff user not found');
  }

  const previous = await prisma.staffFeature.findMany({
    where: { userId },
    select: { featureKey: true },
  });

  const tenantFeatures = await getTenantFeatures(tenantId);
  assertStaffFeaturesSubset(featureKeys, tenantFeatures);
  await setStaffFeatures(userId, featureKeys, grantedById, tenantId);

  await writeAuditLog({
    tenantId,
    userId: grantedById,
    action: 'staff.features_updated',
    entityType: 'user',
    entityId: userId,
    metadata: {
      before: previous.map((p) => p.featureKey),
      after: featureKeys,
    },
    ipAddress,
  });

  return updateTenantUser(tenantId, userId, {});
}

export async function deleteTenantUser(
  tenantId: string,
  userId: string,
  deletedById: string,
  ipAddress?: string,
) {
  const user = await prisma.user.findFirst({
    where: { id: userId, tenantId, deletedAt: null },
  });
  if (!user) {
    throw new NotFoundError('User not found');
  }
  if (userId === deletedById) {
    throw new ForbiddenError('You cannot delete your own account');
  }

  if (user.role === USER_ROLES.CLIENT_ADMIN) {
    const otherActiveAdmins = await prisma.user.count({
      where: {
        tenantId,
        role: USER_ROLES.CLIENT_ADMIN,
        deletedAt: null,
        isActive: true,
        id: { not: userId },
      },
    });
    if (otherActiveAdmins === 0) {
      throw new ForbiddenError('Cannot delete the last active client admin for this shop');
    }
  }

  await prisma.refreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });

  await prisma.user.update({
    where: { id: userId },
    data: { deletedAt: new Date(), isActive: false },
  });

  await writeAuditLog({
    tenantId,
    userId: deletedById,
    action: 'user.deleted',
    entityType: 'user',
    entityId: userId,
    metadata: { email: user.email, fullName: user.fullName, role: user.role },
    ipAddress,
  });
}
