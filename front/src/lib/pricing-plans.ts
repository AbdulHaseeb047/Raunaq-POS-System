import { TENANT_TIERS, type TenantTier } from '@pos/shared';

export type PlanId = 'STARTER' | 'STANDARD' | 'PRO';

export type PricingPlan = {
  id: PlanId;
  name: string;
  tagline: string;
  monthlyPrice: number;
  yearlyPrice: number;
  yearlyNote?: string;
  priceSuffix?: string;
  popular?: boolean;
  included: string[];
  excluded: string[];
};

export const PRICING_PLANS: PricingPlan[] = [
  {
    id: 'STARTER',
    name: 'Starter',
    tagline: 'Core billing for a single counter. Best for small shops just getting started with digital billing.',
    monthlyPrice: 2500,
    yearlyPrice: 25000,
    included: [
      'Sales register (cart, barcode, search)',
      'Cash Sale / Full Udhaar / Split Udhaar',
      'Sales history (view only)',
      'Void sale & partial returns',
      'Stock tracking + low-stock alerts',
      'Basic receipt print',
    ],
    excluded: [
      'Discounts & held bills',
      'Staff accounts (1 owner login only)',
      'Brands, suppliers & receipt branding',
    ],
  },
  {
    id: 'STANDARD',
    name: 'Standard',
    tagline:
      'Everything growing shops need — held bills, discounts, staff accounts, full udhaar ledger and reports.',
    monthlyPrice: 4500,
    yearlyPrice: 45000,
    yearlyNote: '2 months free on yearly',
    popular: true,
    included: [
      'Everything in Starter',
      'Held bills (park / resume)',
      'Discounts (rules + override permission)',
      'Brands, suppliers & categories',
      'Staff accounts & role permissions',
      'Receipt branding (logo, header, footer)',
      'Full udhaar ledger + statements',
      'Sales & growth reports, CSV import/export',
    ],
    excluded: ['Multi-branch / FBR invoicing'],
  },
  {
    id: 'PRO',
    name: 'Pro',
    tagline:
      'For multi-branch operations that need FBR invoicing, priority support and unlimited catalog size.',
    monthlyPrice: 7500,
    yearlyPrice: 75000,
    priceSuffix: 'per location',
    included: [
      'Everything in Standard',
      'Multi-branch switcher & access',
      'FBR invoice / QR fields (Pakistan)',
      'Unlimited products & staff logins',
      'Priority support',
      'Staff performance & udhaar aging reports',
      'Cloud hosting + daily auto backups',
    ],
    excluded: [],
  },
];

const PLAN_RANK: Record<PlanId, number> = {
  STARTER: 1,
  STANDARD: 2,
  PRO: 3,
};

export function toPlanId(tier?: string | null): PlanId {
  if (tier === TENANT_TIERS.STANDARD) return 'STANDARD';
  if (tier === TENANT_TIERS.PRO || tier === TENANT_TIERS.ENTERPRISE) return 'PRO';
  return 'STARTER';
}

export function planLabel(tier?: string | null): string {
  const id = toPlanId(tier);
  return PRICING_PLANS.find((p) => p.id === id)?.name ?? 'Starter';
}

export function comparePlans(a: PlanId, b: PlanId): number {
  return PLAN_RANK[a] - PLAN_RANK[b];
}

export function formatPkr(amount: number): string {
  return `${amount.toLocaleString('en-PK')} Rs`;
}

export type PlanRelation = 'current' | 'upgrade' | 'included';
export type BillingCycle = 'monthly' | 'yearly';

/**
 * Infer billing cycle from subscription window length.
 * Yearly packs are ~365 days; monthly / short trials map to monthly.
 */
export function resolveBillingCycle(
  subscriptionDays?: number | null,
  billingCycle?: BillingCycle | null,
): BillingCycle {
  if (billingCycle === 'monthly' || billingCycle === 'yearly') return billingCycle;
  if (subscriptionDays != null && subscriptionDays >= 300) return 'yearly';
  return 'monthly';
}

export function billingCycleLabel(cycle: BillingCycle): string {
  return cycle === 'yearly' ? 'Yearly' : 'Monthly';
}

export function relationToPlan(current: PlanId, target: PlanId): PlanRelation {
  const diff = comparePlans(target, current);
  if (diff === 0) return 'current';
  if (diff > 0) return 'upgrade';
  return 'included';
}

/** Prefer assigned/paid plan for “your plan”; fall back to effective. */
export function resolveDisplayPlan(entitlement?: {
  assignedPlan?: string;
  trialPlan?: string;
  effectivePlan?: string;
  tier?: string;
} | null): PlanId {
  return toPlanId(
    entitlement?.assignedPlan ??
      entitlement?.trialPlan ??
      entitlement?.effectivePlan ??
      entitlement?.tier,
  );
}

export function isTenantTier(value: string): value is TenantTier {
  return Object.values(TENANT_TIERS).includes(value as TenantTier);
}
