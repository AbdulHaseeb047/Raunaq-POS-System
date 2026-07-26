import type { FeatureKey } from '@pos/shared';
import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';

import { useAuth } from '@/lib/auth';
import { featureLabel, hasFeature } from '@/lib/features';

type FeatureGateProps = {
  feature: FeatureKey;
  children?: ReactNode;
  featureLabel?: string;
  className?: string;
};

/** Locked features redirect to the pricing / upgrade page. */
export function FeatureGate({ feature, children, featureLabel: labelOverride }: FeatureGateProps) {
  const { user } = useAuth();
  if (hasFeature(user, feature)) {
    return <>{children}</>;
  }
  return (
    <Navigate
      to="/upgrade"
      replace
      state={{ fromFeature: labelOverride ?? featureLabel(feature) }}
    />
  );
}
