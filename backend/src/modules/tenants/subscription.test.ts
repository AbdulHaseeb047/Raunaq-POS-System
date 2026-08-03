import { describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  process.env.JWT_SECRET = 'test-jwt-secret';
  process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';
  process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
});

import { FEATURES, TENANT_TIERS, getEffectivePlan } from '@pos/shared';

import { createTenantSchema, updateTenantSchema } from './tenants.service.js';

const now = new Date('2026-08-03T12:00:00.000Z');
const future = new Date('2026-09-03T12:00:00.000Z');
const past = new Date('2026-07-03T12:00:00.000Z');

describe('SaaS tenant plans', () => {
  it('exposes exactly Starter, Standard, and Pro', () => {
    expect(Object.values(TENANT_TIERS)).toEqual(['STARTER', 'STANDARD', 'PRO']);
    expect(
      createTenantSchema.safeParse({
        name: 'Legacy shop',
        slug: 'legacy-shop',
        tier: 'ENTERPRISE',
        adminEmail: 'owner@example.com',
        adminPassword: 'password1',
        adminFullName: 'Owner',
      }).success,
    ).toBe(false);
  });

  it('allows a paid client with no trial plan', () => {
    expect(
      createTenantSchema.safeParse({
        name: 'Paid shop',
        slug: 'paid-shop',
        tier: TENANT_TIERS.STANDARD,
        isTrial: false,
        feeStatus: 'ACTIVE',
        trialPlanTier: null,
        adminEmail: 'paid@example.com',
        adminPassword: 'password1',
        adminFullName: 'Paid Owner',
      }).success,
    ).toBe(true);

    expect(updateTenantSchema.safeParse({ isTrial: false, trialPlanTier: null }).success).toBe(
      true,
    );
  });

  it('uses the selected plan while a trial is active', () => {
    const result = getEffectivePlan(
      {
        tier: TENANT_TIERS.STARTER,
        trialPlanTier: TENANT_TIERS.PRO,
        feeStatus: 'TRIAL',
        subscriptionStartAt: now,
        subscriptionEndsAt: future,
        isActive: true,
      },
      now,
    );

    expect(result.isTrialActive).toBe(true);
    expect(result.effectivePlan).toBe(TENANT_TIERS.PRO);
    expect(result.featureKeys).toContain(FEATURES.MULTI_BRANCH_ACCESS);
  });

  it('uses the paid plan and hard-blocks an expired subscription', () => {
    const active = getEffectivePlan(
      {
        tier: TENANT_TIERS.STANDARD,
        trialPlanTier: null,
        feeStatus: 'ACTIVE',
        subscriptionEndsAt: future,
        isActive: true,
      },
      now,
    );
    const expired = getEffectivePlan(
      {
        tier: TENANT_TIERS.PRO,
        trialPlanTier: null,
        feeStatus: 'ACTIVE',
        subscriptionEndsAt: past,
        isActive: true,
      },
      now,
    );

    expect(active.isPaidActive).toBe(true);
    expect(active.effectivePlan).toBe(TENANT_TIERS.STANDARD);
    expect(expired.isSoftLocked).toBe(true);
    expect(expired.accessStatus).toBe('subscription_expired');
    expect(expired.featureKeys).toEqual([]);
  });

  it('hard-blocks an expired trial with convert-to-paid status', () => {
    const expired = getEffectivePlan(
      {
        tier: TENANT_TIERS.STARTER,
        trialPlanTier: TENANT_TIERS.PRO,
        feeStatus: 'TRIAL',
        subscriptionEndsAt: past,
        isActive: true,
      },
      now,
    );

    expect(expired.isSoftLocked).toBe(true);
    expect(expired.accessStatus).toBe('trial_expired');
    expect(expired.featureKeys).toEqual([]);
  });

  it('returns no features when portal access is revoked', () => {
    const result = getEffectivePlan(
      {
        tier: TENANT_TIERS.PRO,
        feeStatus: 'ACTIVE',
        subscriptionEndsAt: future,
        isActive: false,
        accessRevokedAt: now,
      },
      now,
    );

    expect(result.isAccessRevoked).toBe(true);
    expect(result.featureKeys).toEqual([]);
  });
});
