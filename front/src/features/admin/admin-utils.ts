export function feeBadgeVariant(status: string): 'default' | 'success' | 'warning' | 'danger' {
  if (status === 'ACTIVE') return 'success';
  if (status === 'TRIAL') return 'default';
  if (status === 'OVERDUE') return 'warning';
  return 'danger';
}

export function accessStatusBadgeVariant(
  status: string,
): 'default' | 'success' | 'warning' | 'danger' | 'brand' {
  if (status === 'active_paid' || status === 'trial_active' || status === 'active')
    return 'success';
  if (status === 'expiring_soon') return 'warning';
  if (status === 'trial_expired' || status === 'trial_expired_starter') return 'danger';
  if (status === 'subscription_expired' || status === 'subscription_expired_starter')
    return 'danger';
  if (status === 'access_revoked' || status === 'revoked' || status === 'expired') return 'danger';
  if (status === 'payment_overdue') return 'warning';
  return 'danger';
}

export function accessStatusLabel(status: string): string {
  switch (status) {
    case 'active':
    case 'active_paid':
      return 'Active paid';
    case 'trial_active':
      return 'In trial';
    case 'expiring_soon':
      return 'Expiring soon';
    case 'trial_expired':
    case 'trial_expired_starter':
      return 'Trial expired (login blocked)';
    case 'subscription_expired':
    case 'subscription_expired_starter':
    case 'expired':
      return 'Subscription ended (login blocked)';
    case 'access_revoked':
    case 'revoked':
      return 'Access revoked (blocked)';
    case 'payment_overdue':
      return 'Payment overdue';
    case 'suspended':
      return 'Suspended';
    default:
      return status;
  }
}

export function toDatetimeLocalValue(iso?: string | null): string {
  const d = iso ? new Date(iso) : new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
