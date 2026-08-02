import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';

import { IconSale } from '@/components/icons';
import { Card } from '@/components/ui/Card';
import { ListSkeleton } from '@/components/ui/PageSkeleton';
import { PageHeader } from '@/components/ui/PageHeader';
import { QueryError } from '@/components/ui/QueryError';
import { Skeleton } from '@/components/ui/Skeleton';
import { api } from '@/lib/api-client';
import { useAuth } from '@/lib/auth';
import { formatMoney } from '@/lib/format';
import { FEATURES, hasFeature } from '@/lib/features';

import { SalesDashboard } from './SalesDashboard';

function formatQty(value: string) {
  const n = Number(value);
  if (!Number.isFinite(n)) return value;
  return n.toLocaleString('en-PK', { maximumFractionDigits: 3 });
}

export function DashboardPage() {
  const { user, branchId } = useAuth();

  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: () => api.settings.get(),
    staleTime: 5 * 60_000,
  });

  const { data, isLoading, isFetching, isError, error, refetch } = useQuery({
    queryKey: ['dashboard', branchId],
    queryFn: () => api.reports.dashboard(branchId ?? undefined),
    staleTime: 0,
    refetchOnMount: 'always',
  });

  if (isError) {
    return (
      <div>
        <PageHeader title="Dashboard" subtitle="Your business overview for today" />
        <QueryError error={error} onRetry={() => void refetch()} />
      </div>
    );
  }

  const currency = settings?.currency ?? 'PKR';
  const lowStockCount = data?.lowStockCount ?? data?.lowStockAlerts?.length ?? 0;
  const lowStockPreview = (data?.lowStockAlerts ?? []).slice(0, 5);
  const showLoading = isLoading || (isFetching && !data);

  return (
    <div>
      <PageHeader
        title={`Hello, ${user?.fullName?.split(' ')[0] ?? 'there'}`}
        subtitle={settings?.businessName ?? 'Your business overview for today'}
        action={
          hasFeature(user, FEATURES.BILLING_CREATE_SALE) ? (
            <Link to="/sale">
              <span className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm shadow-brand-600/25 transition-colors hover:bg-brand-700">
                <IconSale className="h-4 w-4" />
                New sale
              </span>
            </Link>
          ) : undefined
        }
      />

      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:p-6">
        {showLoading || !data ? (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <Skeleton className="h-28 rounded-xl" />
              <Skeleton className="h-28 rounded-xl" />
              <Skeleton className="h-28 rounded-xl" />
            </div>
            <Skeleton className="h-72 rounded-xl" />
            <div className="grid gap-4 lg:grid-cols-2">
              <Skeleton className="h-64 rounded-xl" />
              <Skeleton className="h-64 rounded-xl" />
            </div>
          </div>
        ) : (
          <SalesDashboard data={data} currency={currency} />
        )}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <div className="mb-3">
            <h3 className="text-base font-bold text-text">Products returned today</h3>
            <p className="text-sm text-text-muted">Refunds processed so far</p>
          </div>
          <div className="space-y-3">
            <div className="rounded-xl border border-border bg-surface-muted/60 px-4 py-3">
              <p className="text-xs font-medium uppercase tracking-wide text-text-muted">
                Amount returned
              </p>
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
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <h3 className="text-base font-bold text-text">Low stock alerts</h3>
              <p className="text-sm text-text-muted">Top 5 below threshold</p>
            </div>
            {lowStockCount > 0 && hasFeature(user, FEATURES.INVENTORY_VIEW) && (
              <Link
                to="/inventory?stock=low"
                className="shrink-0 rounded-lg bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-800 hover:bg-brand-100"
              >
                View all
              </Link>
            )}
          </div>
          {showLoading ? (
            <ListSkeleton rows={5} />
          ) : lowStockPreview.length === 0 ? (
            <p className="text-sm text-text-muted">All stock levels look good.</p>
          ) : (
            <ul className="space-y-2">
              {lowStockPreview.map((item) => (
                <li
                  key={item.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-50 px-4 py-3 text-sm"
                >
                  <span className="min-w-0 flex-1 font-medium text-text">{item.name}</span>
                  <div className="flex shrink-0 items-center gap-2 text-xs">
                    <span className="rounded-lg bg-amber-100 px-2.5 py-1 font-semibold text-amber-900">
                      Present {formatQty(item.stockQuantity)}
                    </span>
                    <span className="rounded-lg bg-white px-2.5 py-1 font-medium text-text-muted ring-1 ring-border">
                      Alert at {formatQty(item.lowStockThreshold)}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
