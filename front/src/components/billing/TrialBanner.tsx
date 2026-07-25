import { useNavigate } from 'react-router-dom';

import { Button } from '@/components/ui/Button';
import { useAuth } from '@/lib/auth';

export function TrialBanner() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const entitlement = user?.planEntitlement;
  if (!entitlement?.isSoftLocked) return null;

  const planName = entitlement.assignedPlan ?? entitlement.trialPlan ?? 'your plan';
  const statusLabel =
    entitlement.accessStatus === 'trial_expired_starter'
      ? 'Your trial has ended'
      : 'Your subscription period has ended';

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-950 lg:px-6">
      <p>
        <span className="font-semibold">{statusLabel}</span>
        {' — '}
        you still have Starter access (sales & receipts). Upgrade to keep using{' '}
        <strong>{planName}</strong> features.
      </p>
      <Button size="sm" variant="secondary" onClick={() => navigate('/upgrade')}>
        Upgrade to continue
      </Button>
    </div>
  );
}
