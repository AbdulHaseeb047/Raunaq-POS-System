export function feeBadgeVariant(status: string): 'default' | 'success' | 'warning' | 'danger' {
  if (status === 'ACTIVE') return 'success';
  if (status === 'TRIAL') return 'default';
  if (status === 'OVERDUE') return 'warning';
  return 'danger';
}

export function accessStatusBadgeVariant(
  status: string,
): 'default' | 'success' | 'warning' | 'danger' | 'brand' {
  if (status === 'active') return 'success';
  if (status === 'expiring_soon') return 'warning';
  if (status === 'payment_overdue') return 'warning';
  return 'danger';
}

export function accessStatusLabel(status: string): string {
  switch (status) {
    case 'active':
      return 'Access active';
    case 'expiring_soon':
      return 'Expiring soon';
    case 'expired':
      return 'Subscription ended';
    case 'revoked':
      return 'Access revoked';
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
