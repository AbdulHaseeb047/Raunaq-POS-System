import type { FeatureKey, TenantTier } from '@pos/shared';
import { FEATURES, USER_ROLES, getEffectivePlan, getTierFeaturePreset } from '@pos/shared';
import type { UserRole } from '@pos/shared';

import { ValidationError } from '../core/errors.js';
import { prisma } from '../core/prisma.js';
import { toPlanInput } from '../tenants/subscription.service.js';

const ALL_FEATURE_KEYS = Object.values(FEATURES) as FeatureKey[];

/**
 * Resolve features for a user.
 * Soft-locked tenants get Starter features only (ignores custom overrides).
 * Active trial/paid uses stored TenantFeature rows (plan defaults + admin overrides).
 */
export async function resolveUserFeatures(
  userId: string,
  role: string,
  tenantId: string | null,
): Promise<FeatureKey[]> {
  if (role === USER_ROLES.SUPER_ADMIN) {
    return ALL_FEATURE_KEYS;
  }

  if (!tenantId) {
    return [];
  }

  const tenantKeys = await resolveTenantEffectiveFeatureKeys(tenantId);

  if (role === USER_ROLES.CLIENT_ADMIN) {
    return tenantKeys;
  }

  const staffFeatures = await prisma.staffFeature.findMany({
    where: { userId },
    select: { featureKey: true },
  });
  const tenantSet = new Set(tenantKeys);

  return staffFeatures
    .map((f) => f.featureKey as FeatureKey)
    .filter((key) => tenantSet.has(key));
}

export async function resolveTenantEffectiveFeatureKeys(tenantId: string): Promise<FeatureKey[]> {
  const tenant = await prisma.tenant.findFirst({
    where: { id: tenantId, deletedAt: null },
  });
  if (!tenant) return [];

  const effective = getEffectivePlan(toPlanInput(tenant));
  if (effective.isAccessRevoked) return [];

  // Soft-lock: Starter only — ignore per-client overrides above Starter.
  if (effective.isSoftLocked) {
    return effective.featureKeys;
  }

  const stored = await getTenantFeatures(tenantId);
  if (stored.length === 0) {
    return effective.featureKeys;
  }

  // Plan entitlement is the floor while trial/paid is active. Stale TenantFeature
  // rows (from before plan expansions) must not hide brands/suppliers/etc.
  // Keep any extra stored keys outside the plan for legacy admin grants.
  const planKeys = effective.featureKeys;
  const storedSet = new Set(stored);
  const missingFromPlan = planKeys.filter((k) => !storedSet.has(k));
  if (missingFromPlan.length === 0) {
    return stored;
  }
  return [...new Set([...stored, ...planKeys])];
}

export async function getTenantFeatures(tenantId: string): Promise<FeatureKey[]> {
  const rows = await prisma.tenantFeature.findMany({
    where: { tenantId },
    select: { featureKey: true },
  });
  return rows.map((r) => r.featureKey as FeatureKey);
}

export async function setTenantFeatures(
  tenantId: string,
  featureKeys: FeatureKey[],
  enabledById: string,
): Promise<void> {
  const unique = [...new Set(featureKeys)];

  await prisma.$transaction(async (tx) => {
    await tx.tenantFeature.deleteMany({ where: { tenantId } });

    if (unique.length > 0) {
      await tx.tenantFeature.createMany({
        data: unique.map((featureKey) => ({
          tenantId,
          featureKey,
          enabledById,
        })),
      });
    }
  });
}

export async function applyTierPreset(
  tenantId: string,
  tier: string,
  enabledById: string,
): Promise<FeatureKey[]> {
  const keys = getTierFeaturePreset(tier as TenantTier);
  await setTenantFeatures(tenantId, keys, enabledById);
  return keys;
}

export async function setStaffFeatures(
  userId: string,
  featureKeys: FeatureKey[],
  grantedById: string,
  tenantId: string,
): Promise<void> {
  const tenantKeys = new Set(await resolveTenantEffectiveFeatureKeys(tenantId));
  const valid = featureKeys.filter((k) => tenantKeys.has(k));

  await prisma.$transaction(async (tx) => {
    await tx.staffFeature.deleteMany({ where: { userId } });

    if (valid.length > 0) {
      await tx.staffFeature.createMany({
        data: valid.map((featureKey) => ({
          userId,
          featureKey,
          grantedById,
        })),
      });
    }
  });
}

export function userHasFeature(userFeatures: FeatureKey[], required: FeatureKey): boolean {
  return userFeatures.includes(required);
}

export function userHasAnyFeature(userFeatures: FeatureKey[], required: FeatureKey[]): boolean {
  return required.some((f) => userFeatures.includes(f));
}

export function assertStaffFeaturesSubset(
  requested: FeatureKey[],
  tenantFeatures: FeatureKey[],
): void {
  const tenantSet = new Set(tenantFeatures);
  const invalid = requested.filter((f) => !tenantSet.has(f));
  if (invalid.length > 0) {
    throw new ValidationError(`Staff features must be enabled for this shop: ${invalid.join(', ')}`);
  }
}

export type { UserRole };
