import { FEATURES, TENANT_TIERS, type FeatureKey, type TenantTier } from './features.js';
import { getTierFeaturePreset, normalizePlanTier } from './feature-registry.js';

export type PlanAccessStatus =
  | 'trial_active'
  | 'active_paid'
  | 'expiring_soon'
  | 'trial_expired'
  | 'subscription_expired'
  /** @deprecated Prefer trial_expired — kept for older clients */
  | 'trial_expired_starter'
  /** @deprecated Prefer subscription_expired — kept for older clients */
  | 'subscription_expired_starter'
  | 'access_revoked';

export interface TenantPlanInput {
  tier: TenantTier;
  trialPlanTier?: TenantTier | null;
  feeStatus: string;
  subscriptionStartAt?: Date | string | null;
  subscriptionEndsAt?: Date | string | null;
  subscriptionDays?: number | null;
  isActive: boolean;
  accessRevokedAt?: Date | string | null;
  accessRevokeReason?: string | null;
}

export interface EffectivePlanResult {
  /** Features the shop can use right now. */
  effectivePlan: TenantTier;
  /** Paid / assigned plan on the tenant record. */
  assignedPlan: TenantTier;
  /** Plan granted during trial (defaults to assigned plan). */
  trialPlan: TenantTier;
  isTrialActive: boolean;
  isPaidActive: boolean;
  isSoftLocked: boolean;
  isAccessRevoked: boolean;
  accessStatus: PlanAccessStatus;
  daysRemaining: number | null;
  subscriptionEndsAt: string | null;
  trialStartAt: string | null;
  featureKeys: FeatureKey[];
}

function toDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function getSubscriptionDaysRemaining(
  endsAt: Date | string | null | undefined,
  now = new Date(),
): number | null {
  const end = toDate(endsAt);
  if (!end) return null;
  const diffMs = end.getTime() - now.getTime();
  if (diffMs <= 0) return 0;
  return Math.ceil(diffMs / MS_PER_DAY);
}

/**
 * Single source of truth for plan + trial/paid window.
 * - Trial / paid window active → assigned trial or paid plan features
 * - Window ended → no features; portal must hard-block login (pay / convert)
 * - Manual revoke → blocked (caller must reject login)
 *
 * `isSoftLocked` means the period ended and payment/conversion is required
 * (legacy name; access is hard-blocked, not Starter fallback).
 */
export function getEffectivePlan(tenant: TenantPlanInput, now = new Date()): EffectivePlanResult {
  const assignedPlan = normalizePlanTier(tenant.tier);
  const trialPlan = normalizePlanTier(tenant.trialPlanTier ?? tenant.tier);
  const endsAt = toDate(tenant.subscriptionEndsAt);
  const startAt = toDate(tenant.subscriptionStartAt);
  const daysRemaining = getSubscriptionDaysRemaining(endsAt, now);
  const windowOpen = endsAt != null && now.getTime() < endsAt.getTime();
  // ACTIVE with no end date = open-ended paid access (seed / legacy rows).
  const paidWindowOk = endsAt == null || windowOpen;
  const isAccessRevoked = Boolean(tenant.accessRevokedAt) || tenant.isActive === false;

  if (isAccessRevoked) {
    return {
      effectivePlan: TENANT_TIERS.STARTER,
      assignedPlan,
      trialPlan,
      isTrialActive: false,
      isPaidActive: false,
      isSoftLocked: false,
      isAccessRevoked: true,
      accessStatus: 'access_revoked',
      daysRemaining: 0,
      subscriptionEndsAt: endsAt?.toISOString() ?? null,
      trialStartAt: startAt?.toISOString() ?? null,
      featureKeys: [],
    };
  }

  const isTrialActive = tenant.feeStatus === 'TRIAL' && windowOpen;
  // OVERDUE is ops visibility only — access follows the subscription end date.
  const isPaidActive =
    (tenant.feeStatus === 'ACTIVE' || tenant.feeStatus === 'OVERDUE') && paidWindowOk;

  if (isTrialActive || isPaidActive) {
    const plan = isTrialActive ? trialPlan : assignedPlan;
    let accessStatus: PlanAccessStatus = isTrialActive ? 'trial_active' : 'active_paid';
    if (daysRemaining != null && daysRemaining <= 7) {
      accessStatus = 'expiring_soon';
    }
    return {
      effectivePlan: plan,
      assignedPlan,
      trialPlan,
      isTrialActive,
      isPaidActive,
      isSoftLocked: false,
      isAccessRevoked: false,
      accessStatus,
      daysRemaining,
      subscriptionEndsAt: endsAt?.toISOString() ?? null,
      trialStartAt: startAt?.toISOString() ?? null,
      featureKeys: getTierFeaturePreset(plan),
    };
  }

  // Period ended: no product access until admin renews / converts to paid.
  const wasTrial = tenant.feeStatus === 'TRIAL';
  return {
    effectivePlan: TENANT_TIERS.STARTER,
    assignedPlan,
    trialPlan,
    isTrialActive: false,
    isPaidActive: false,
    isSoftLocked: true,
    isAccessRevoked: false,
    accessStatus: wasTrial ? 'trial_expired' : 'subscription_expired',
    daysRemaining: 0,
    subscriptionEndsAt: endsAt?.toISOString() ?? null,
    trialStartAt: startAt?.toISOString() ?? null,
    featureKeys: [],
  };
}

export function effectiveHasFeature(
  tenant: TenantPlanInput,
  feature: FeatureKey,
  now = new Date(),
): boolean {
  const result = getEffectivePlan(tenant, now);
  if (result.isAccessRevoked) return false;
  return result.featureKeys.includes(feature);
}

export { FEATURES };
