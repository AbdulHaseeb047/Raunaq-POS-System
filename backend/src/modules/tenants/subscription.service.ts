import type { Tenant, TenantFeeStatus, TenantTier } from '@prisma/client';
import {
  getEffectivePlan,
  getSubscriptionDaysRemaining,
  type EffectivePlanResult,
  type TenantPlanInput,
} from '@pos/shared';

import { ForbiddenError, UnauthorizedError } from '../core/errors.js';
import { prisma } from '../core/prisma.js';
import { writeAuditLog } from '../audit/audit.service.js';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function computeSubscriptionEndsAt(start: Date, days: number): Date {
  return new Date(start.getTime() + days * MS_PER_DAY);
}

export { getSubscriptionDaysRemaining };

export function toPlanInput(tenant: Tenant): TenantPlanInput {
  return {
    tier: tenant.tier as TenantPlanInput['tier'],
    trialPlanTier: (tenant.trialPlanTier ?? tenant.tier) as TenantPlanInput['trialPlanTier'],
    feeStatus: tenant.feeStatus,
    subscriptionStartAt: tenant.subscriptionStartAt,
    subscriptionEndsAt: tenant.subscriptionEndsAt,
    subscriptionDays: tenant.subscriptionDays,
    isActive: tenant.isActive,
    accessRevokedAt: tenant.accessRevokedAt,
    accessRevokeReason: tenant.accessRevokeReason,
  };
}

export function getTenantEffectivePlan(tenant: Tenant, now = new Date()): EffectivePlanResult {
  return getEffectivePlan(toPlanInput(tenant), now);
}

export function serializeSubscriptionFields(tenant: Tenant, now = new Date()) {
  const effective = getTenantEffectivePlan(tenant, now);

  const billingCycle = tenant.subscriptionDays >= 300 ? 'yearly' : 'monthly';

  return {
    trialPlanTier: tenant.trialPlanTier ?? tenant.tier,
    subscriptionStartAt: tenant.subscriptionStartAt?.toISOString() ?? null,
    subscriptionEndsAt: tenant.subscriptionEndsAt?.toISOString() ?? null,
    subscriptionDays: tenant.subscriptionDays,
    billingCycle,
    accessRevokedAt: tenant.accessRevokedAt?.toISOString() ?? null,
    accessRevokeReason: tenant.accessRevokeReason,
    daysRemaining: effective.daysRemaining,
    subscriptionExpired: effective.isSoftLocked,
    isTrialActive: effective.isTrialActive,
    isPaidActive: effective.isPaidActive,
    isSoftLocked: effective.isSoftLocked,
    effectivePlan: effective.effectivePlan,
    assignedPlan: effective.assignedPlan,
    trialPlan: effective.trialPlan,
    accessStatus: effective.accessStatus,
  };
}

async function revokeTenantRefreshTokens(tenantId: string): Promise<void> {
  const users = await prisma.user.findMany({
    where: { tenantId, deletedAt: null },
    select: { id: true },
  });
  const userIds = users.map((u) => u.id);
  if (userIds.length === 0) return;

  await prisma.refreshToken.updateMany({
    where: { userId: { in: userIds }, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

/** Mark fee overdue for ops visibility — does NOT hard-block portal access. */
async function applyAutoFeeOverdue(tenant: Tenant): Promise<TenantFeeStatus> {
  if (tenant.feeStatus !== 'ACTIVE' || !tenant.feeDueDate) {
    return tenant.feeStatus;
  }

  const today = startOfUtcDay(new Date());
  const due = startOfUtcDay(tenant.feeDueDate);
  if (today.getTime() <= due.getTime()) {
    return tenant.feeStatus;
  }

  await prisma.tenant.update({
    where: { id: tenant.id },
    data: { feeStatus: 'OVERDUE' },
  });

  return 'OVERDUE';
}

/**
 * Legacy hard-expiry removed. Subscription/trial end soft-locks to Starter via getEffectivePlan.
 * Kept as a no-op so the interval job does not deactivate shops.
 */
export async function processTenantSubscriptionExpiry(_tenantId: string): Promise<void> {
  // Soft-lock is computed at read time — no destructive update.
}

export async function processAllExpiredTenants(): Promise<number> {
  return 0;
}

export class TenantAccessBlockedError extends ForbiddenError {
  constructor(message: string, code: string) {
    super(message, code);
  }
}

/**
 * Hard-block ONLY for explicit admin revoke (or missing tenant).
 * Trial / paid window expiry → allow login (soft-lock handled by feature resolution).
 */
export async function assertTenantPortalAccess(
  tenantId: string,
  options: { forLogin?: boolean } = {},
): Promise<void> {
  const tenant = await prisma.tenant.findFirst({
    where: { id: tenantId, deletedAt: null },
  });

  if (!tenant) {
    const message = 'Shop account not found or has been removed';
    if (options.forLogin) throw new UnauthorizedError(message, 'TENANT_NOT_FOUND');
    throw new TenantAccessBlockedError(message, 'TENANT_NOT_FOUND');
  }

  await applyAutoFeeOverdue(tenant);

  // Hard block: only manual revoke. isActive=false without revoke is treated as revoked too.
  const manuallyRevoked = Boolean(tenant.accessRevokedAt);
  const inactiveBlocked = !tenant.isActive;

  if (manuallyRevoked || inactiveBlocked) {
    const message =
      tenant.accessRevokeReason ??
      'Portal access has been revoked for this shop. Contact your administrator.';
    if (options.forLogin) throw new UnauthorizedError(message, 'TENANT_ACCESS_REVOKED');
    throw new TenantAccessBlockedError(message, 'TENANT_ACCESS_REVOKED');
  }
}

export async function revokeTenantAccess(
  tenantId: string,
  reason: string,
  revokedById: string,
  ipAddress?: string,
): Promise<void> {
  const tenant = await prisma.tenant.findFirst({
    where: { id: tenantId, deletedAt: null },
  });
  if (!tenant) return;

  await prisma.tenant.update({
    where: { id: tenantId },
    data: {
      isActive: false,
      feeStatus: 'SUSPENDED',
      accessRevokedAt: new Date(),
      accessRevokeReason: reason,
    },
  });

  await revokeTenantRefreshTokens(tenantId);

  await writeAuditLog({
    tenantId,
    userId: revokedById,
    action: 'tenant.access_revoked',
    entityType: 'tenant',
    entityId: tenantId,
    metadata: { reason },
    ipAddress,
  });
}

export async function restoreTenantAccess(
  tenantId: string,
  input: {
    subscriptionStartAt?: Date;
    subscriptionDays?: number;
    feeStatus?: TenantFeeStatus;
    clearRevoke?: boolean;
    trialPlanTier?: TenantTier;
  },
  restoredById: string,
  ipAddress?: string,
): Promise<void> {
  const tenant = await prisma.tenant.findFirst({
    where: { id: tenantId, deletedAt: null },
  });
  if (!tenant) return;

  const start = input.subscriptionStartAt ?? new Date();
  const days = input.subscriptionDays ?? tenant.subscriptionDays ?? 30;
  const endsAt = computeSubscriptionEndsAt(start, days);

  await prisma.tenant.update({
    where: { id: tenantId },
    data: {
      isActive: true,
      feeStatus: input.feeStatus ?? 'ACTIVE',
      subscriptionStartAt: start,
      subscriptionEndsAt: endsAt,
      subscriptionDays: days,
      trialPlanTier: input.trialPlanTier ?? tenant.trialPlanTier ?? tenant.tier,
      accessRevokedAt: input.clearRevoke !== false ? null : undefined,
      accessRevokeReason: input.clearRevoke !== false ? null : undefined,
    },
  });

  await writeAuditLog({
    tenantId,
    userId: restoredById,
    action: 'tenant.access_restored',
    entityType: 'tenant',
    entityId: tenantId,
    metadata: {
      subscriptionStartAt: start.toISOString(),
      subscriptionEndsAt: endsAt.toISOString(),
      subscriptionDays: days,
      feeStatus: input.feeStatus ?? 'ACTIVE',
    },
    ipAddress,
  });
}

export function startSubscriptionInterval(logger: {
  info: (obj: unknown, msg?: string) => void;
}): NodeJS.Timeout {
  // Soft-lock needs no sweep; keep a light heartbeat for ops visibility.
  const run = () => {
    logger.info('Subscription soft-lock mode active (no auto hard-expire)');
  };
  run();
  return setInterval(run, 24 * 60 * 60 * 1000);
}
