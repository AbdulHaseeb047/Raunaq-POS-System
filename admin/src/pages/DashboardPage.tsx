import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';

import { Badge, Card, PageLoader, StatCard } from '@/components/ui';
import { api } from '@/lib/api';

function feeTone(status: string): 'default' | 'success' | 'warning' | 'danger' {
  if (status === 'ACTIVE') return 'success';
  if (status === 'TRIAL') return 'default';
  if (status === 'OVERDUE') return 'warning';
  return 'danger';
}

export function DashboardPage() {
  const { data, isLoading } = useQuery({ queryKey: ['admin-dashboard'], queryFn: () => api.admin.dashboard() });

  if (isLoading || !data) return <PageLoader />;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Platform Dashboard</h1>
        <p className="text-slate-500">Overview of clients, users, fees, and sales performance</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total clients" value={data.totals.tenants} sub={`${data.totals.activeTenants} active`} />
        <StatCard label="Client users" value={data.totals.clientUsers} sub={`${data.totals.activeClientUsers} active`} />
        <StatCard label="Inactive clients" value={data.totals.inactiveTenants} />
        <StatCard label="Sales reps" value={data.totals.salesReps} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Fee status breakdown">
          <div className="space-y-3">
            {data.feeStatus.map((f) => (
              <div key={f.status} className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3">
                <Badge tone={feeTone(f.status)}>{f.status}</Badge>
                <span className="text-lg font-semibold">{f.count}</span>
              </div>
            ))}
          </div>
        </Card>

        <Card title="Sales rep performance">
          {data.salesRepPerformance.length === 0 ? (
            <p className="text-sm text-slate-500">No clients assigned to sales reps yet.</p>
          ) : (
            <div className="space-y-2">
              {data.salesRepPerformance.map((r) => (
                <div key={r.salesRepId ?? r.salesRepName} className="flex items-center justify-between rounded-xl border border-slate-100 px-4 py-3">
                  <span className="font-medium">{r.salesRepName}</span>
                  <span className="text-sm text-slate-500">{r.clientCount} clients</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <Card title="Recent clients" action={<Link to="/clients" className="text-sm font-medium text-indigo-600 hover:underline">View all</Link>}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase text-slate-500">
                <th className="pb-3 pr-4">Client</th>
                <th className="pb-3 pr-4">Tier</th>
                <th className="pb-3 pr-4">Status</th>
                <th className="pb-3 pr-4">Fee</th>
                <th className="pb-3 pr-4">Users</th>
                <th className="pb-3">Sales rep</th>
              </tr>
            </thead>
            <tbody>
              {data.recentTenants.map((t) => (
                <tr key={t.id} className="border-b border-slate-50">
                  <td className="py-3 pr-4">
                    <Link to={`/clients/${t.id}`} className="font-medium text-indigo-600 hover:underline">{t.name}</Link>
                    <p className="text-xs text-slate-400">{t.slug}</p>
                  </td>
                  <td className="py-3 pr-4">{t.tier}</td>
                  <td className="py-3 pr-4">
                    <Badge tone={t.isActive ? 'success' : 'danger'}>{t.isActive ? 'Active' : 'Inactive'}</Badge>
                  </td>
                  <td className="py-3 pr-4">
                    <Badge tone={feeTone(t.feeStatus)}>{t.feeStatus}</Badge>
                    {t.monthlyFee && <p className="text-xs text-slate-400">Rs {t.monthlyFee}/mo</p>}
                  </td>
                  <td className="py-3 pr-4">{t.userCount}</td>
                  <td className="py-3">{t.acquiredBy?.name ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
