import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';

import { IconChart, IconUsers, IconWallet, IconAlert } from '@/components/icons';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { PageLoader } from '@/components/ui/Spinner';
import { StatCard } from '@/components/ui/StatCard';
import { feeBadgeVariant } from '@/features/admin/admin-utils';
import { api } from '@/lib/api-client';
import { useAuth } from '@/lib/auth';

export function AdminDashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const { data, isLoading } = useQuery({
    queryKey: ['admin-dashboard'],
    queryFn: () => api.admin.dashboard(),
  });

  if (isLoading || !data) return <PageLoader />;

  const overdueCount = data.feeStatus.find((f) => f.status === 'OVERDUE')?.count ?? 0;

  return (
    <div>
      <PageHeader
        title={`Hello, ${user?.fullName?.split(' ')[0] ?? 'Admin'}`}
        subtitle="Platform overview — clients, fees, and sales team"
        action={<Button onClick={() => navigate('/admin/clients')}>+ New client account</Button>}
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Total clients"
          value={data.totals.tenants}
          icon={<IconUsers className="h-5 w-5" />}
          accent="brand"
          trend={`${data.totals.activeTenants} active`}
        />
        <StatCard
          label="Client users"
          value={data.totals.clientUsers}
          icon={<IconChart className="h-5 w-5" />}
          accent="info"
          trend={`${data.totals.activeClientUsers} active`}
        />
        <StatCard
          label="Overdue fees"
          value={overdueCount}
          icon={<IconAlert className="h-5 w-5" />}
          accent="warning"
        />
        <StatCard
          label="Sales reps"
          value={data.totals.salesReps}
          icon={<IconWallet className="h-5 w-5" />}
          accent="accent"
        />
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Link
          to="/admin/clients"
          className="rounded-2xl border border-border bg-surface p-4 shadow-[var(--shadow-card)] transition hover:border-brand-300 hover:shadow-[var(--shadow-card-hover)]"
        >
          <p className="text-sm font-semibold text-text">Manage clients</p>
          <p className="mt-1 text-xs text-text-muted">Create shop accounts, set tiers & features</p>
        </Link>
        <Link
          to="/admin/sales-reps"
          className="rounded-2xl border border-border bg-surface p-4 shadow-[var(--shadow-card)] transition hover:border-brand-300 hover:shadow-[var(--shadow-card-hover)]"
        >
          <p className="text-sm font-semibold text-text">Sales reps</p>
          <p className="mt-1 text-xs text-text-muted">Track who brought each client</p>
        </Link>
        <Link
          to="/admin/account/password"
          className="rounded-2xl border border-border bg-surface p-4 shadow-[var(--shadow-card)] transition hover:border-brand-300 hover:shadow-[var(--shadow-card-hover)]"
        >
          <p className="text-sm font-semibold text-text">Your password</p>
          <p className="mt-1 text-xs text-text-muted">Change admin login (stored in database)</p>
        </Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card padding="lg">
          <CardHeader title="Fee status" subtitle="Billing health across all clients" />
          <div className="space-y-2">
            {data.feeStatus.map((f) => (
              <div
                key={f.status}
                className="flex items-center justify-between rounded-xl bg-surface-muted px-4 py-3"
              >
                <Badge variant={feeBadgeVariant(f.status)}>{f.status}</Badge>
                <span className="text-lg font-semibold text-text">{f.count}</span>
              </div>
            ))}
          </div>
        </Card>

        <Card padding="lg">
          <CardHeader title="Sales rep performance" subtitle="Clients acquired per rep" />
          {data.salesRepPerformance.length === 0 ? (
            <p className="text-sm text-text-muted">No clients assigned to sales reps yet.</p>
          ) : (
            <div className="space-y-2">
              {data.salesRepPerformance.map((r) => (
                <div
                  key={r.salesRepId ?? r.salesRepName}
                  className="flex items-center justify-between rounded-xl border border-border px-4 py-3"
                >
                  <span className="font-medium text-text">{r.salesRepName}</span>
                  <Badge variant="brand">{r.clientCount} clients</Badge>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <Card padding="lg" className="mt-6">
        <CardHeader
          title="Recent clients"
          subtitle="Latest shops on the platform"
          action={
            <Link
              to="/admin/clients"
              className="text-sm font-semibold text-brand-700 hover:underline"
            >
              View all
            </Link>
          }
        />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs font-semibold uppercase text-text-muted">
                <th className="pb-3 pr-4">Client</th>
                <th className="pb-3 pr-4">Tier</th>
                <th className="pb-3 pr-4">Status</th>
                <th className="pb-3 pr-4">Fee</th>
                <th className="pb-3 pr-4">Users</th>
                <th className="pb-3">Sales rep</th>
              </tr>
            </thead>
            <tbody>
              {data.recentTenants.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-text-muted">
                    No clients yet.{' '}
                    <Link
                      to="/admin/clients"
                      className="font-medium text-brand-700 hover:underline"
                    >
                      Create your first client
                    </Link>
                  </td>
                </tr>
              ) : (
                data.recentTenants.map((t) => (
                  <tr
                    key={t.id}
                    className="border-b border-border/50 transition hover:bg-surface-muted/50"
                  >
                    <td className="py-3 pr-4">
                      <Link
                        to={`/admin/clients/${t.id}`}
                        className="font-medium text-brand-700 hover:underline"
                      >
                        {t.name}
                      </Link>
                      <p className="text-xs text-text-muted">{t.slug}</p>
                    </td>
                    <td className="py-3 pr-4">{t.tier}</td>
                    <td className="py-3 pr-4">
                      <Badge variant={t.isActive ? 'success' : 'danger'}>
                        {t.isActive ? 'Active' : 'Inactive'}
                      </Badge>
                    </td>
                    <td className="py-3 pr-4">
                      <Badge variant={feeBadgeVariant(t.feeStatus)}>{t.feeStatus}</Badge>
                      {t.monthlyFee && (
                        <p className="text-xs text-text-muted">Rs {t.monthlyFee}/mo</p>
                      )}
                    </td>
                    <td className="py-3 pr-4">{t.userCount}</td>
                    <td className="py-3">{t.acquiredBy?.name ?? '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
