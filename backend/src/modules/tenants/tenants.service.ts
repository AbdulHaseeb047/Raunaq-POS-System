import { z } from 'zod';

import { TENANT_TIERS, SHIPPED_FEATURE_KEYS } from '@pos/shared';
import type { FeatureKey } from '@pos/shared';

import { ConflictError, NotFoundError, ValidationError } from '../core/errors.js';
import { hashPassword } from '../auth/auth.service.js';
import { prisma } from '../core/prisma.js';
import { applyTierPreset, getTenantFeatures, setTenantFeatures } from '../permissions/permissions.service.js';
import { writeAuditLog } from '../audit/audit.service.js';
import { ensureBusinessSettings } from '../settings/settings.service.js';
import { createDefaultBranch } from '../core/branch.js';
import { ensureMiscProduct } from '../billing/misc-product.js';
import {
  computeSubscriptionEndsAt,
  restoreTenantAccess,
  revokeTenantAccess,
  serializeSubscriptionFields,
} from './subscription.service.js';

export const createTenantSchema = z.object({
  name: z.string().min(1).max(255),
  slug: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9-]+$/, 'Slug must be lowercase alphanumeric with hyphens'),
  tier: z.enum([
    TENANT_TIERS.STARTER,
    TENANT_TIERS.STANDARD,
    TENANT_TIERS.PRO,
    TENANT_TIERS.ENTERPRISE,
  ]),
  adminEmail: z.string().email(),
  adminPassword: z.string().min(8),
  adminFullName: z.string().min(1).max(255),
  acquiredById: z.string().uuid().optional().nullable(),
  feeStatus: z.enum(['TRIAL', 'ACTIVE', 'OVERDUE', 'SUSPENDED']).optional(),
  monthlyFee: z.number().nonnegative().optional().nullable(),
  feeDueDate: z.string().optional().nullable(),
  featureKeys: z.array(z.string()).min(1).optional(),
  subscriptionStartAt: z.string().datetime().optional(),
  subscriptionDays: z.number().int().min(1).max(365).optional(),
  trialPlanTier: z
    .enum([TENANT_TIERS.STARTER, TENANT_TIERS.STANDARD, TENANT_TIERS.PRO, TENANT_TIERS.ENTERPRISE])
    .optional(),
});

export const updateTenantSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  tier: z
    .enum([TENANT_TIERS.STARTER, TENANT_TIERS.STANDARD, TENANT_TIERS.PRO, TENANT_TIERS.ENTERPRISE])
    .optional(),
  trialPlanTier: z
    .enum([TENANT_TIERS.STARTER, TENANT_TIERS.STANDARD, TENANT_TIERS.PRO, TENANT_TIERS.ENTERPRISE])
    .optional()
    .nullable(),
  feeStatus: z.enum(['TRIAL', 'ACTIVE', 'OVERDUE', 'SUSPENDED']).optional(),
  monthlyFee: z.number().nonnegative().optional().nullable(),
  feeDueDate: z.string().optional().nullable(),
  acquiredById: z.string().uuid().optional().nullable(),
  subscriptionStartAt: z.string().datetime().optional().nullable(),
  subscriptionDays: z.number().int().min(1).max(365).optional(),
  /** When true with a tier change, reset TenantFeature rows to that plan's defaults. */
  resetFeaturesToPlan: z.boolean().optional(),
});

export const revokeTenantAccessSchema = z.object({
  reason: z.string().min(1).max(500).optional(),
});

export const restoreTenantAccessSchema = z.object({
  subscriptionStartAt: z.string().datetime().optional(),
  subscriptionDays: z.number().int().min(1).max(365).optional(),
  feeStatus: z.enum(['TRIAL', 'ACTIVE', 'OVERDUE', 'SUSPENDED']).optional(),
});

export const setTenantFeaturesSchema = z.object({
  featureKeys: z.array(z.string()).min(1, 'At least one feature must remain enabled'),
});

export type CreateTenantInput = z.infer<typeof createTenantSchema>;
export type UpdateTenantInput = z.infer<typeof updateTenantSchema>;

export async function listTenants(page = 1, pageSize = 20) {
  const skip = (page - 1) * pageSize;

  const [data, total] = await prisma.$transaction([
    prisma.tenant.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: 'desc' },
      skip,
      take: pageSize,
      include: {
        tenantFeatures: { select: { featureKey: true } },
        acquiredBy: { select: { id: true, fullName: true } },
        _count: { select: { users: true } },
      },
    }),
    prisma.tenant.count({ where: { deletedAt: null } }),
  ]);

  return {
    data: data.map((t) => ({
      id: t.id,
      name: t.name,
      slug: t.slug,
      tier: t.tier,
      isActive: t.isActive,
      featureCount: t.tenantFeatures.length,
      userCount: t._count.users,
      feeStatus: t.feeStatus,
      monthlyFee: t.monthlyFee?.toFixed(2) ?? null,
      feeDueDate: t.feeDueDate?.toISOString().slice(0, 10) ?? null,
      acquiredBy: t.acquiredBy ? { id: t.acquiredBy.id, name: t.acquiredBy.fullName } : null,
      createdAt: t.createdAt.toISOString(),
      ...serializeSubscriptionFields(t),
    })),
    meta: {
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    },
  };
}

export async function getTenantById(tenantId: string) {
  const tenant = await prisma.tenant.findFirst({
    where: { id: tenantId, deletedAt: null },
    include: {
      tenantFeatures: { select: { featureKey: true } },
      acquiredBy: { select: { id: true, fullName: true, email: true } },
    },
  });

  if (!tenant) {
    throw new NotFoundError('Tenant not found');
  }

  return {
    id: tenant.id,
    name: tenant.name,
    slug: tenant.slug,
    tier: tenant.tier,
    isActive: tenant.isActive,
    features: tenant.tenantFeatures.map((f) => f.featureKey),
    feeStatus: tenant.feeStatus,
    monthlyFee: tenant.monthlyFee?.toFixed(2) ?? null,
    feeDueDate: tenant.feeDueDate?.toISOString().slice(0, 10) ?? null,
    acquiredBy: tenant.acquiredBy
      ? { id: tenant.acquiredBy.id, name: tenant.acquiredBy.fullName, email: tenant.acquiredBy.email }
      : null,
    createdAt: tenant.createdAt.toISOString(),
    updatedAt: tenant.updatedAt.toISOString(),
    ...serializeSubscriptionFields(tenant),
  };
}

export async function createTenant(input: CreateTenantInput, createdById: string) {
  const existing = await prisma.tenant.findFirst({
    where: { slug: input.slug, deletedAt: null },
  });
  if (existing) {
    throw new ConflictError('Tenant slug already exists');
  }

  const subscriptionDays = input.subscriptionDays ?? 30;
  const subscriptionStartAt = input.subscriptionStartAt ? new Date(input.subscriptionStartAt) : new Date();
  const subscriptionEndsAt = computeSubscriptionEndsAt(subscriptionStartAt, subscriptionDays);

  const tenant = await prisma.$transaction(async (tx) => {
    const created = await tx.tenant.create({
      data: {
        name: input.name,
        slug: input.slug,
        tier: input.tier,
        trialPlanTier: input.trialPlanTier ?? input.tier,
        feeStatus: input.feeStatus ?? 'TRIAL',
        monthlyFee: input.monthlyFee ?? null,
        feeDueDate: input.feeDueDate ? new Date(input.feeDueDate) : null,
        acquiredById: input.acquiredById ?? null,
        subscriptionStartAt,
        subscriptionEndsAt,
        subscriptionDays,
      },
    });

    await tx.user.create({
      data: {
        tenantId: created.id,
        email: input.adminEmail.toLowerCase(),
        passwordHash: await hashPassword(input.adminPassword),
        fullName: input.adminFullName,
        role: 'CLIENT_ADMIN',
      },
    });

    return created;
  });

  if (input.featureKeys && input.featureKeys.length > 0) {
    const allowed = new Set(SHIPPED_FEATURE_KEYS);
    const keys = [...new Set(input.featureKeys.filter((k) => allowed.has(k as FeatureKey)))] as FeatureKey[];
    if (keys.length === 0) {
      throw new ValidationError('At least one valid feature must be selected');
    }
    await setTenantFeatures(tenant.id, keys, createdById);
  } else {
    await applyTierPreset(tenant.id, input.tier, createdById);
  }
  await ensureBusinessSettings(tenant.id, input.name);
  await createDefaultBranch(tenant.id, input.name);
  await ensureMiscProduct(tenant.id);

  return getTenantById(tenant.id);
}

export async function updateTenant(
  tenantId: string,
  input: UpdateTenantInput,
  updatedById?: string,
) {
  const tenant = await prisma.tenant.findFirst({
    where: { id: tenantId, deletedAt: null },
  });
  if (!tenant) {
    throw new NotFoundError('Tenant not found');
  }

  const subscriptionDays = input.subscriptionDays ?? tenant.subscriptionDays;
  let subscriptionStartAt = tenant.subscriptionStartAt;
  let subscriptionEndsAt = tenant.subscriptionEndsAt;

  if (input.subscriptionStartAt !== undefined) {
    subscriptionStartAt = input.subscriptionStartAt ? new Date(input.subscriptionStartAt) : null;
  }
  if (input.subscriptionStartAt !== undefined || input.subscriptionDays !== undefined) {
    if (subscriptionStartAt) {
      subscriptionEndsAt = computeSubscriptionEndsAt(subscriptionStartAt, subscriptionDays);
    } else {
      subscriptionEndsAt = null;
    }
  }

  await prisma.tenant.update({
    where: { id: tenantId },
    data: {
      name: input.name,
      tier: input.tier,
      trialPlanTier:
        input.trialPlanTier === undefined
          ? undefined
          : input.trialPlanTier ?? input.tier ?? tenant.tier,
      feeStatus: input.feeStatus,
      monthlyFee: input.monthlyFee,
      feeDueDate: input.feeDueDate ? new Date(input.feeDueDate) : input.feeDueDate === null ? null : undefined,
      acquiredById: input.acquiredById,
      subscriptionStartAt: input.subscriptionStartAt !== undefined ? subscriptionStartAt : undefined,
      subscriptionEndsAt: input.subscriptionStartAt !== undefined || input.subscriptionDays !== undefined ? subscriptionEndsAt : undefined,
      subscriptionDays: input.subscriptionDays,
    },
  });

  if (input.resetFeaturesToPlan && input.tier && updatedById) {
    await applyTierPreset(tenantId, input.tier, updatedById);
  }

  return getTenantById(tenantId);
}

export async function updateTenantFeatures(
  tenantId: string,
  featureKeys: FeatureKey[],
  enabledById: string,
  ipAddress?: string,
) {
  const tenant = await prisma.tenant.findFirst({
    where: { id: tenantId, deletedAt: null },
  });
  if (!tenant) {
    throw new NotFoundError('Tenant not found');
  }

  const previous = await getTenantFeatures(tenantId);

  const validKeys = await prisma.featureRegistry.findMany({
    where: { key: { in: featureKeys }, isActive: true },
    select: { key: true },
  });

  const allowed = new Set(SHIPPED_FEATURE_KEYS);
  const newKeys = validKeys
    .map((k) => k.key as FeatureKey)
    .filter((k) => allowed.has(k));

  if (newKeys.length === 0) {
    throw new ValidationError('At least one feature must remain enabled');
  }

  await setTenantFeatures(tenantId, newKeys, enabledById);

  await writeAuditLog({
    tenantId,
    userId: enabledById,
    action: 'tenant.features_updated',
    entityType: 'tenant',
    entityId: tenantId,
    metadata: { before: previous, after: newKeys },
    ipAddress,
  });

  return getTenantById(tenantId);
}

export async function revokeTenantPortalAccess(
  tenantId: string,
  reason: string,
  revokedById: string,
  ipAddress?: string,
) {
  const tenant = await prisma.tenant.findFirst({
    where: { id: tenantId, deletedAt: null },
  });
  if (!tenant) {
    throw new NotFoundError('Tenant not found');
  }

  await revokeTenantAccess(tenantId, reason, revokedById, ipAddress);
  return getTenantById(tenantId);
}

export async function restoreTenantPortalAccess(
  tenantId: string,
  input: {
    subscriptionStartAt?: string;
    subscriptionDays?: number;
    feeStatus?: 'TRIAL' | 'ACTIVE' | 'OVERDUE' | 'SUSPENDED';
  },
  restoredById: string,
  ipAddress?: string,
) {
  const tenant = await prisma.tenant.findFirst({
    where: { id: tenantId, deletedAt: null },
  });
  if (!tenant) {
    throw new NotFoundError('Tenant not found');
  }

  await restoreTenantAccess(
    tenantId,
    {
      subscriptionStartAt: input.subscriptionStartAt ? new Date(input.subscriptionStartAt) : new Date(),
      subscriptionDays: input.subscriptionDays ?? tenant.subscriptionDays ?? 30,
      feeStatus: input.feeStatus ?? 'ACTIVE',
      clearRevoke: true,
    },
    restoredById,
    ipAddress,
  );

  return getTenantById(tenantId);
}
