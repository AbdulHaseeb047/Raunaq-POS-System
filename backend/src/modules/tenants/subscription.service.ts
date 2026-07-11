import type { Tenant, TenantFeeStatus } from '@prisma/client';

import { ForbiddenError, UnauthorizedError } from '../core/errors.js';
import { prisma } from '../core/prisma.js';
import { writeAuditLog } from '../audit/audit.service.js';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function computeSubscriptionEndsAt(start: Date, days: number): Date {
  return new Date(start.getTime() + days * MS_PER_DAY);
}

export function getSubscriptionDaysRemaining(endsAt: Date | null | undefined, now = new Date()): number | null {
  if (!endsAt) return null;
  const diffMs = endsAt.getTime() - now.getTime();
  if (diffMs <= 0) return 0;
  return Math.ceil(diffMs / MS_PER_DAY);
}

export function serializeSubscriptionFields(tenant: Tenant, now = new Date()) {
  const daysRemaining = getSubscriptionDaysRemaining(tenant.subscriptionEndsAt, now);
  const subscriptionExpired =
    tenant.subscriptionEndsAt != null && now.getTime() >= tenant.subscriptionEndsAt.getTime();

  let accessStatus: 'active' | 'expiring_soon' | 'expired' | 'revoked' | 'payment_overdue' | 'suspended' =
    'active';

  if (!tenant.isActive || tenant.accessRevokedAt) {
    accessStatus = tenant.accessRevokeReason?.includes('Subscription') ? 'expired' : 'revoked';
  } else if (tenant.feeStatus === 'OVERDUE') {
    accessStatus = 'payment_overdue';
  } else if (tenant.feeStatus === 'SUSPENDED') {
    accessStatus = 'suspended';
  } else if (subscriptionExpired) {
    accessStatus = 'expired';
  } else if (daysRemaining != null && daysRemaining <= 7) {
    accessStatus = 'expiring_soon';
  }

  return {
    subscriptionStartAt: tenant.subscriptionStartAt?.toISOString() ?? null,
    subscriptionEndsAt: tenant.subscriptionEndsAt?.toISOString() ?? null,
    subscriptionDays: tenant.subscriptionDays,
    accessRevokedAt: tenant.accessRevokedAt?.toISOString() ?? null,
    accessRevokeReason: tenant.accessRevokeReason,
    daysRemaining,
    subscriptionExpired,
    accessStatus,
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

/** Expire subscription and revoke sessions when the 30-day window ends. */
export async function processTenantSubscriptionExpiry(tenantId: string): Promise<void> {
  const tenant = await prisma.tenant.findFirst({
    where: { id: tenantId, deletedAt: null },
  });
  if (!tenant?.subscriptionEndsAt || !tenant.isActive) return;

  if (new Date().getTime() < tenant.subscriptionEndsAt.getTime()) return;

  await prisma.tenant.update({
    where: { id: tenantId },
    data: {
      isActive: false,
      feeStatus: 'SUSPENDED',
      accessRevokedAt: new Date(),
      accessRevokeReason: 'Subscription period ended automatically after 30 days',
    },
  });

  await revokeTenantRefreshTokens(tenantId);
}

export async function processAllExpiredTenants(): Promise<number> {
  const now = new Date();
  const expired = await prisma.tenant.findMany({
    where: {
      deletedAt: null,
      isActive: true,
      subscriptionEndsAt: { lte: now },
    },
    select: { id: true },
  });

  for (const t of expired) {
    await processTenantSubscriptionExpiry(t.id);
  }

  return expired.length;
}

export class TenantAccessBlockedError extends ForbiddenError {
  constructor(message: string, code: string) {
    super(message, code);
  }
}

export async function assertTenantPortalAccess(
  tenantId: string,
  options: { forLogin?: boolean } = {},
): Promise<void> {
  await processTenantSubscriptionExpiry(tenantId);

  const tenant = await prisma.tenant.findFirst({
    where: { id: tenantId, deletedAt: null },
  });

  if (!tenant) {
    const message = 'Shop account not found or has been removed';
    if (options.forLogin) throw new UnauthorizedError(message, 'TENANT_NOT_FOUND');
    throw new TenantAccessBlockedError(message, 'TENANT_NOT_FOUND');
  }

  const feeStatus = await applyAutoFeeOverdue(tenant);

  if (!tenant.isActive || tenant.accessRevokedAt) {
    const message =
      tenant.accessRevokeReason ??
      'Portal access has been revoked for this shop. Contact your administrator.';
    const code = tenant.accessRevokeReason?.includes('Subscription')
      ? 'SUBSCRIPTION_EXPIRED'
      : 'TENANT_ACCESS_REVOKED';
    if (options.forLogin) throw new UnauthorizedError(message, code);
    throw new TenantAccessBlockedError(message, code);
  }

  if (feeStatus === 'OVERDUE') {
    const message = 'Payment is overdue. Portal access is suspended until payment is received.';
    if (options.forLogin) throw new UnauthorizedError(message, 'PAYMENT_OVERDUE');
    throw new TenantAccessBlockedError(message, 'PAYMENT_OVERDUE');
  }

  if (feeStatus === 'SUSPENDED') {
    const message = 'This shop account is suspended. Contact your administrator.';
    if (options.forLogin) throw new UnauthorizedError(message, 'TENANT_SUSPENDED');
    throw new TenantAccessBlockedError(message, 'TENANT_SUSPENDED');
  }

  if (tenant.subscriptionEndsAt && new Date().getTime() >= tenant.subscriptionEndsAt.getTime()) {
    const message = 'Your 30-day subscription period has ended. Contact your administrator to renew.';
    if (options.forLogin) throw new UnauthorizedError(message, 'SUBSCRIPTION_EXPIRED');
    throw new TenantAccessBlockedError(message, 'SUBSCRIPTION_EXPIRED');
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

export function startSubscriptionInterval(logger: { info: (obj: unknown, msg?: string) => void }): NodeJS.Timeout {
  const run = () => {
    void processAllExpiredTenants()
      .then((count) => {
        if (count > 0) logger.info({ count }, 'Auto-expired tenant subscriptions');
      })
      .catch((err) => logger.info({ err }, 'Subscription expiry sweep failed'));
  };

  run();
  return setInterval(run, 15 * 60 * 1000);
}
