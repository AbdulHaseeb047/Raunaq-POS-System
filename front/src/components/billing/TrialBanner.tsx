import { useNavigate } from 'react-router-dom';

import { Button } from '@/components/ui/Button';
import { useAuth } from '@/lib/auth';

/** Shown only while still signed in near expiry; ended periods hard-block login. */
export function TrialBanner() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const entitlement = user?.planEntitlement;
  if (!entitlement || entitlement.isSoftLocked || entitlement.accessStatus !== 'expiring_soon') {
    return null;
  }

  const days = entitlement.daysRemaining;
  const isTrial = entitlement.isTrialActive;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-950 lg:px-6">
      <p>
        <span className="font-semibold">
          {isTrial ? 'Trial ending soon' : 'Subscription ending soon'}
        </span>
        {days != null ? ` — ${days} day(s) left.` : '.'} Renew on time to avoid losing access.
      </p>
      <Button size="sm" variant="secondary" onClick={() => navigate('/upgrade')}>
        {isTrial ? 'Convert to paid' : 'Renew / upgrade'}
      </Button>
    </div>
  );
}
