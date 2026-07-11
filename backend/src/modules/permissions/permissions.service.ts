import type { FeatureKey } from '@pos/shared';
import { FEATURES, USER_ROLES } from '@pos/shared';
import type { UserRole } from '@pos/shared';

import { ValidationError } from '../core/errors.js';
import { prisma } from '../core/prisma.js';

const ALL_FEATURE_KEYS = Object.values(FEATURES) as FeatureKey[];

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

  const tenantFeatures = await prisma.tenantFeature.findMany({
    where: { tenantId },
    select: { featureKey: true },
  });
  const tenantKeys = new Set(tenantFeatures.map((f) => f.featureKey as FeatureKey));

  if (role === USER_ROLES.CLIENT_ADMIN) {
    return [...tenantKeys];
  }

  const staffFeatures = await prisma.staffFeature.findMany({
    where: { userId },
    select: { featureKey: true },
  });

  return staffFeatures
    .map((f) => f.featureKey as FeatureKey)
    .filter((key) => tenantKeys.has(key));
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
  const presets = await prisma.tierPreset.findMany({
    where: { tier: tier as 'STARTER' | 'STANDARD' | 'PRO' | 'ENTERPRISE' },
    select: { featureKey: true },
  });

  const keys = presets.map((p) => p.featureKey as FeatureKey);
  await setTenantFeatures(tenantId, keys, enabledById);
  return keys;
}

export async function setStaffFeatures(
  userId: string,
  featureKeys: FeatureKey[],
  grantedById: string,
  tenantId: string,
): Promise<void> {
  const tenantKeys = new Set(await getTenantFeatures(tenantId));
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
