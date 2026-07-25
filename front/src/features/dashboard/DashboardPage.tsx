import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';

import { IconBox, IconSale, IconWallet } from '@/components/icons';
import { Badge } from '@/components/ui/Badge';
import { Card, CardHeader } from '@/components/ui/Card';
import { MountainChart } from '@/components/ui/MountainChart';
import { PageHeader } from '@/components/ui/PageHeader';
import { PageLoader } from '@/components/ui/Spinner';
import { QueryError } from '@/components/ui/QueryError';
import { StatCard } from '@/components/ui/StatCard';
import { api } from '@/lib/api-client';
import { useAuth } from '@/lib/auth';
import { formatMoney } from '@/lib/format';
import { FEATURES, hasFeature } from '@/lib/features';

function shortDay(isoDate: string) {
  const d = new Date(`${isoDate}T12:00:00`);
  return d.toLocaleDateString('en-PK', { day: 'numeric', month: 'short' });
}

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

  const { data: trend, isLoading: trendLoading } = useQuery({
    queryKey: ['sales-trend', branchId],
    queryFn: () => api.reports.salesTrend(14, branchId ?? undefined),
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
  const salesSeries =
    trend?.series.map((p) => ({ label: shortDay(p.date), value: parseFloat(p.sales) })) ?? [];
  const txSeries =
    trend?.series.map((p) => ({ label: shortDay(p.date), value: p.transactions })) ?? [];
  const returnsSeries =
    trend?.series.map((p) => ({ label: shortDay(p.date), value: parseFloat(p.returns) })) ?? [];

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

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
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
          label="Returns today"
          value={formatMoney(data?.todayReturnsAmount ?? '0', currency)}
          icon={<IconWallet className="h-5 w-5" />}
          accent="info"
          trend={
            (data?.todayReturnsCount ?? 0) > 0
              ? `${data?.todayReturnsCount} return${(data?.todayReturnsCount ?? 0) === 1 ? '' : 's'}`
              : undefined
          }
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

      <div className="mt-6">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-base font-bold text-text">Shop growth</h2>
            <p className="text-sm text-text-muted">Last 14 days — sales, traffic, and returns</p>
          </div>
          {trend && (
            <p className="text-sm font-semibold text-brand-700">
              {trend.growthPct >= 0 ? '+' : ''}
              {trend.growthPct}% vs prior half of period
            </p>
          )}
        </div>

        {trendLoading ? (
          <PageLoader />
        ) : (
          <div className="grid gap-4 lg:grid-cols-3">
            <MountainChart
              title="Sales revenue"
              subtitle={`${formatMoney(trend?.totalSales ?? '0', currency)} total`}
              data={salesSeries}
              color="#059669"
              formatValue={(n) => formatMoney(n, currency)}
            />
            <MountainChart
              title="Transactions"
              subtitle={`${trend?.totalTransactions ?? 0} bills`}
              data={txSeries}
              color="#0284c7"
              formatValue={(n) => String(Math.round(n))}
            />
            <MountainChart
              title="Returns"
              subtitle={`${formatMoney(trend?.totalReturns ?? '0', currency)} refunded`}
              data={returnsSeries}
              color="#ea580c"
              formatValue={(n) => formatMoney(n, currency)}
            />
          </div>
        )}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Products returned today" subtitle="Refunds processed so far" />
          <div className="space-y-3">
            <div className="rounded-xl border border-border bg-surface-muted/60 px-4 py-3">
              <p className="text-xs font-medium uppercase tracking-wide text-text-muted">Amount returned</p>
              <p className="mt-1 text-2xl font-bold text-brand-800">
                {formatMoney(data?.todayReturnsAmount ?? '0', currency)}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-border px-4 py-3">
                <p className="text-xs text-text-muted">Return slips</p>
                <p className="mt-1 text-xl font-bold text-text">{data?.todayReturnsCount ?? 0}</p>
              </div>
              <div className="rounded-xl border border-border px-4 py-3">
                <p className="text-xs text-text-muted">Units returned</p>
                <p className="mt-1 text-xl font-bold text-text">
                  {Number(data?.todayReturnedUnits ?? 0).toLocaleString('en-PK', {
                    maximumFractionDigits: 2,
                  })}
                </p>
              </div>
            </div>
            {hasFeature(user, FEATURES.BILLING_CREATE_SALE) && (
              <Link
                to="/sales"
                className="inline-flex text-sm font-semibold text-brand-700 hover:underline"
              >
                Open sales history →
              </Link>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="Low stock alerts" subtitle="Products below threshold" />
          {(data?.lowStockAlerts?.length ?? 0) === 0 ? (
            <p className="text-sm text-text-muted">All stock levels look good.</p>
          ) : (
            <ul className="space-y-2">
              {data?.lowStockAlerts.map((item) => (
                <li
                  key={item.id}
                  className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3 text-sm"
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
      </div>
    </div>
  );
}
