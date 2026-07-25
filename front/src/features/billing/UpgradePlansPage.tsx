import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';

import { Button } from '@/components/ui/Button';
import { useAuth } from '@/lib/auth';
import {
  billingCycleLabel,
  formatPkr,
  planLabel,
  PRICING_PLANS,
  relationToPlan,
  resolveBillingCycle,
  resolveDisplayPlan,
  type BillingCycle,
  type PlanId,
  type PricingPlan,
} from '@/lib/pricing-plans';
import { supportWhatsappUrl, UPGRADE_WHATSAPP_URL } from '@/lib/support';

type UpgradeLocationState = {
  fromFeature?: string;
};

export function UpgradePlansPage() {
  const { user } = useAuth();
  const location = useLocation();
  const fromFeature = (location.state as UpgradeLocationState | null)?.fromFeature;
  const entitlement = user?.planEntitlement;
  const currentPlan = resolveDisplayPlan(entitlement);
  const currentCycle = useMemo(
    () => resolveBillingCycle(entitlement?.subscriptionDays, entitlement?.billingCycle),
    [entitlement?.subscriptionDays, entitlement?.billingCycle],
  );
  const [cycle, setCycle] = useState<BillingCycle>(currentCycle);
  useEffect(() => {
    setCycle(currentCycle);
  }, [currentCycle]);
  const softLocked = Boolean(entitlement?.isSoftLocked);
  const upgradeUrl = entitlement?.upgradeUrl || UPGRADE_WHATSAPP_URL;

  const openWhatsAppForPlan = (plan: PricingPlan, intent: 'upgrade' | 'switch_cycle') => {
    const price = cycle === 'yearly' ? plan.yearlyPrice : plan.monthlyPrice;
    const period = cycle === 'yearly' ? 'year' : 'month';
    const url = supportWhatsappUrl(
      [
        intent === 'switch_cycle'
          ? `Hi, I'd like to switch my Raunaq POS billing to ${billingCycleLabel(cycle)} on the ${plan.name} plan.`
          : `Hi, I'd like to upgrade my Raunaq POS plan to ${plan.name} (${billingCycleLabel(cycle)}).`,
        `Selected plan: ${plan.name}`,
        `Billing cycle: ${billingCycleLabel(cycle)}`,
        `Price: ${formatPkr(price)}/${period}${plan.priceSuffix ? ` (${plan.priceSuffix})` : ''}`,
        `Current plan: ${planLabel(currentPlan)} (${billingCycleLabel(currentCycle)})`,
        fromFeature ? `Interested feature: ${fromFeature}` : null,
        user?.fullName ? `Name: ${user.fullName}` : null,
        user?.email ? `Email: ${user.email}` : null,
      ]
        .filter(Boolean)
        .join('\n'),
    );
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="mx-auto max-w-6xl">
      <div className="text-center">
        <h1 className="text-2xl font-bold tracking-tight text-brand-900 sm:text-3xl">
          Pricing Plans
        </h1>
        <p className="mx-auto mt-2 max-w-xl text-sm text-text-muted">
          Pick the feature depth your shop needs — upgrade anytime as you grow.
        </p>

        <div className="mt-5 inline-flex items-center rounded-full border border-border bg-surface p-1 shadow-sm">
          <CycleButton active={cycle === 'monthly'} onClick={() => setCycle('monthly')}>
            Monthly
            {currentCycle === 'monthly' && (
              <span className="ml-1.5 rounded-full bg-white/20 px-1.5 py-0.5 text-[10px] font-bold">
                Yours
              </span>
            )}
          </CycleButton>
          <CycleButton active={cycle === 'yearly'} onClick={() => setCycle('yearly')}>
            Yearly
            {currentCycle === 'yearly' ? (
              <span className="ml-1.5 rounded-full bg-white/20 px-1.5 py-0.5 text-[10px] font-bold">
                Yours
              </span>
            ) : (
              <span className="ml-1.5 rounded-full bg-brand-100 px-1.5 py-0.5 text-[10px] font-bold text-brand-800">
                Save
              </span>
            )}
          </CycleButton>
        </div>

        <p className="mt-3 text-xs text-text-muted">
          You&apos;re on{' '}
          <span className="font-semibold text-text">
            {planLabel(currentPlan)} · {billingCycleLabel(currentCycle)}
          </span>
          {softLocked ? ' (Starter features while subscription/trial is ended)' : ''}.
        </p>
        {fromFeature && (
          <p className="mt-2 text-xs font-medium text-brand-800">
            Unlock <span className="font-bold">{fromFeature}</span> by choosing a plan below — then
            continue on WhatsApp.
          </p>
        )}
      </div>

      {softLocked && (
        <div className="mx-auto mt-5 max-w-2xl rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-center text-sm text-amber-950">
          Your paid features are paused. Upgrade or renew to restore{' '}
          <strong>
            {planLabel(currentPlan)} ({billingCycleLabel(currentCycle)})
          </strong>{' '}
          access.
          <Button
            size="sm"
            variant="secondary"
            className="ml-3 mt-2 sm:mt-0"
            onClick={() => window.open(upgradeUrl, '_blank', 'noopener,noreferrer')}
          >
            Renew on WhatsApp
          </Button>
        </div>
      )}

      <div className="mt-8 grid gap-4 lg:grid-cols-3">
        {PRICING_PLANS.map((plan) => (
          <PlanCard
            key={plan.id}
            plan={plan}
            cycle={cycle}
            currentPlan={currentPlan}
            currentCycle={currentCycle}
            onUpgrade={() => openWhatsAppForPlan(plan, 'upgrade')}
            onSwitchCycle={() => openWhatsAppForPlan(plan, 'switch_cycle')}
          />
        ))}
      </div>

      <p className="mt-8 text-center text-xs text-text-muted">
        Questions about plans?{' '}
        <button
          type="button"
          className="font-semibold text-brand-700 underline-offset-2 hover:underline"
          onClick={() => window.open(UPGRADE_WHATSAPP_URL, '_blank', 'noopener,noreferrer')}
        >
          Chat with us on WhatsApp
        </button>
        .
      </p>
    </div>
  );
}

function CycleButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
        active ? 'bg-brand-700 text-white shadow-sm' : 'text-text-muted hover:text-text'
      }`}
    >
      {children}
    </button>
  );
}

function PlanCard({
  plan,
  cycle,
  currentPlan,
  currentCycle,
  onUpgrade,
  onSwitchCycle,
}: {
  plan: PricingPlan;
  cycle: BillingCycle;
  currentPlan: PlanId;
  currentCycle: BillingCycle;
  onUpgrade: () => void;
  onSwitchCycle: () => void;
}) {
  const relation = relationToPlan(currentPlan, plan.id);
  const isCurrentPlan = relation === 'current';
  const isActiveBilling = isCurrentPlan && cycle === currentCycle;
  const price = cycle === 'yearly' ? plan.yearlyPrice : plan.monthlyPrice;
  const period = cycle === 'yearly' ? '/year' : '/month';

  return (
    <article
      className={`relative flex flex-col rounded-3xl border bg-surface p-5 shadow-[var(--shadow-card)] sm:p-6 ${
        plan.popular
          ? 'border-brand-500 ring-2 ring-brand-500/20 lg:-mt-1 lg:mb-1'
          : 'border-border'
      } ${isActiveBilling ? 'bg-brand-50/40' : ''}`}
    >
      {plan.popular && (
        <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-brand-800 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-white">
          Most popular
        </span>
      )}

      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand-800">
            {plan.name}
          </p>
          {isCurrentPlan && (
            <span className="mt-1 inline-flex rounded-full bg-brand-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
              Your plan · {billingCycleLabel(currentCycle)}
            </span>
          )}
        </div>
      </div>

      <div className="mt-4">
        <p className="flex items-baseline gap-1">
          <span className="text-3xl font-bold tracking-tight text-text">{formatPkr(price)}</span>
          <span className="text-sm text-text-muted">{period}</span>
        </p>
        {plan.priceSuffix && (
          <p className="mt-0.5 text-[11px] font-medium text-text-muted">{plan.priceSuffix}</p>
        )}
        {cycle === 'yearly' && plan.yearlyNote && (
          <p className="mt-1 text-[11px] font-semibold text-brand-700">{plan.yearlyNote}</p>
        )}
      </div>

      <p className="mt-3 text-xs leading-relaxed text-text-muted">{plan.tagline}</p>

      <ul className="mt-5 flex-1 space-y-2">
        {plan.included.map((item) => (
          <li key={item} className="flex gap-2 text-xs text-text">
            <CheckIcon />
            <span>{item}</span>
          </li>
        ))}
        {plan.excluded.map((item) => (
          <li key={item} className="flex gap-2 text-xs text-text-muted/70">
            <DashIcon />
            <span>{item}</span>
          </li>
        ))}
      </ul>

      <div className="mt-6">
        {isActiveBilling ? (
          <Button className="w-full" variant="secondary" disabled>
            Current · {billingCycleLabel(currentCycle)}
          </Button>
        ) : isCurrentPlan ? (
          <Button className="w-full" variant="secondary" onClick={onSwitchCycle}>
            Switch to {billingCycleLabel(cycle)}
          </Button>
        ) : relation === 'upgrade' ? (
          <Button
            className="w-full"
            variant={plan.popular ? 'primary' : 'secondary'}
            onClick={onUpgrade}
          >
            Upgrade to {plan.name}
          </Button>
        ) : (
          <Button className="w-full" variant="ghost" disabled>
            Included in your plan
          </Button>
        )}
      </div>
    </article>
  );
}

function CheckIcon() {
  return (
    <svg
      className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand-600"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden
    >
      <path
        d="M3.5 8.5l3 3 6-7"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function DashIcon() {
  return (
    <svg
      className="mt-0.5 h-3.5 w-3.5 shrink-0 text-text-muted/50"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden
    >
      <path d="M4 8h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
