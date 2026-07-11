import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';

import { IconBox, IconSale, IconWallet } from '@/components/icons';
import { Badge } from '@/components/ui/Badge';
import { Card, CardHeader } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { PageLoader } from '@/components/ui/Spinner';
import { QueryError } from '@/components/ui/QueryError';
import { StatCard } from '@/components/ui/StatCard';
import { api } from '@/lib/api-client';
import { useAuth } from '@/lib/auth';
import { formatMoney } from '@/lib/format';
import { FEATURES, hasFeature } from '@/lib/features';

export function DashboardPage() {
  const { user, branchId } = useAuth();

  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: () => api.settings.get(),
  });

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['dashboard', branchId],
    queryFn: () => api.reports.dashboard(branchId ?? undefined),
  });

  if (isLoading) return <PageLoader />;

  if (isError) {
    return (
      <div>
        <PageHeader title="Dashboard" subtitle="Your business overview for today" />
        <QueryError error={error} onRetry={() => void refetch()} />
      </div>
    );
  }

  const currency = settings?.currency ?? 'PKR';

  return (
    <div>
      <PageHeader
        title={`Hello, ${user?.fullName?.split(' ')[0] ?? 'there'}`}
        subtitle={settings?.businessName ?? 'Your business overview for today'}
        action={
          hasFeature(user, FEATURES.BILLING_CREATE_SALE) ? (
            <Link to="/sale">
              <span className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm shadow-brand-600/25 transition-colors hover:bg-brand-700 min-h-[44px]">
                <IconSale className="h-4 w-4" />
                New sale
              </span>
            </Link>
          ) : undefined
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Today's sales"
          value={formatMoney(data?.todaySalesTotal ?? '0', currency)}
          icon={<IconSale className="h-5 w-5" />}
          accent="brand"
        />
        <StatCard
          label="Transactions"
          value={data?.todayTransactionCount ?? 0}
          icon={<IconBox className="h-5 w-5" />}
          accent="info"
        />
        <StatCard
          label="Outstanding udhaar"
          value={formatMoney(data?.outstandingUdhaar ?? '0', currency)}
          icon={<IconWallet className="h-5 w-5" />}
          accent="accent"
        />
        <StatCard
          label="Low stock items"
          value={data?.lowStockAlerts?.length ?? 0}
          icon={<IconBox className="h-5 w-5" />}
          accent="warning"
        />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Low stock alerts" subtitle="Products below threshold" />
          {(data?.lowStockAlerts?.length ?? 0) === 0 ? (
            <p className="text-sm text-text-muted">All stock levels look good.</p>
          ) : (
            <ul className="space-y-2">
              {data?.lowStockAlerts.map((item) => (
                <li
                  key={item.id}
                  className="flex items-center justify-between rounded-xl bg-amber-50/60 px-4 py-3 text-sm"
                >
                  <span className="font-medium text-text">{item.name}</span>
                  <Badge variant="warning">
                    {item.stockQuantity} / {item.lowStockThreshold}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader
            title="Quick links"
            subtitle="Jump to common tasks"
          />
          <div className="grid gap-2 sm:grid-cols-2">
            {hasFeature(user, FEATURES.BILLING_CREATE_SALE) && (
              <Link
                to="/sale"
                className="rounded-xl border border-border bg-brand-50/50 px-4 py-4 text-sm font-semibold text-brand-800 transition-colors hover:bg-brand-100"
              >
                Open POS →
              </Link>
            )}
            {hasFeature(user, FEATURES.CUSTOMERS_VIEW) && (
              <Link
                to="/customers"
                className="rounded-xl border border-border px-4 py-4 text-sm font-semibold text-text transition-colors hover:bg-surface-muted"
              >
                Customers →
              </Link>
            )}
            {hasFeature(user, FEATURES.REPORTS_VIEW) && (
              <Link
                to="/reports"
                className="rounded-xl border border-border px-4 py-4 text-sm font-semibold text-text transition-colors hover:bg-surface-muted"
              >
                Reports →
              </Link>
            )}
            {hasFeature(user, FEATURES.INVENTORY_VIEW) && (
              <Link
                to="/inventory"
                className="rounded-xl border border-border px-4 py-4 text-sm font-semibold text-text transition-colors hover:bg-surface-muted"
              >
                Inventory →
              </Link>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
