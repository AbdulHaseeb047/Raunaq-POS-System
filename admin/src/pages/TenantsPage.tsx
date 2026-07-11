import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { TENANT_TIERS } from '@pos/shared';

import { Badge, Button, Input, Modal, PageLoader, Select } from '@/components/ui';
import { ApiError, api } from '@/lib/api';

function feeTone(status: string): 'default' | 'success' | 'warning' | 'danger' {
  if (status === 'ACTIVE') return 'success';
  if (status === 'TRIAL') return 'default';
  if (status === 'OVERDUE') return 'warning';
  return 'danger';
}

const emptyForm = {
  name: '',
  slug: '',
  tier: TENANT_TIERS.STANDARD as string,
  adminEmail: '',
  adminPassword: '',
  adminFullName: '',
  acquiredById: '',
  feeStatus: 'TRIAL',
  monthlyFee: '',
  feeDueDate: '',
};

export function TenantsPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['tenants', page],
    queryFn: () => api.tenants.list(page, 20),
  });

  const { data: salesReps } = useQuery({
    queryKey: ['sales-reps'],
    queryFn: () => api.admin.salesReps(),
  });

  const createTenant = useMutation({
    mutationFn: () =>
      api.tenants.create({
        name: form.name,
        slug: form.slug.toLowerCase().replace(/\s+/g, '-'),
        tier: form.tier,
        adminEmail: form.adminEmail,
        adminPassword: form.adminPassword,
        adminFullName: form.adminFullName,
        acquiredById: form.acquiredById || null,
        feeStatus: form.feeStatus,
        monthlyFee: form.monthlyFee ? Number(form.monthlyFee) : null,
        feeDueDate: form.feeDueDate || null,
      }),
    onSuccess: () => {
      setCreateOpen(false);
      setForm(emptyForm);
      setError('');
      void queryClient.invalidateQueries({ queryKey: ['tenants'] });
      void queryClient.invalidateQueries({ queryKey: ['admin-dashboard'] });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Failed to create client'),
  });

  if (isLoading) return <PageLoader />;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Clients</h1>
          <p className="text-slate-500">Create and manage POS client accounts</p>
        </div>
        <Button onClick={() => { setCreateOpen(true); setError(''); }}>+ New client</Button>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-slate-50 text-left text-xs uppercase text-slate-500">
              <th className="px-4 py-3">Client</th>
              <th className="px-4 py-3">Tier</th>
              <th className="px-4 py-3">Account</th>
              <th className="px-4 py-3">Fee</th>
              <th className="px-4 py-3">Users</th>
              <th className="px-4 py-3">Sales rep</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {(data?.data ?? []).map((t) => (
              <tr key={t.id} className="border-b border-slate-50">
                <td className="px-4 py-3">
                  <p className="font-medium">{t.name}</p>
                  <p className="text-xs text-slate-400">{t.slug}</p>
                </td>
                <td className="px-4 py-3">{t.tier}</td>
                <td className="px-4 py-3">
                  <Badge tone={t.isActive ? 'success' : 'danger'}>{t.isActive ? 'Active' : 'Inactive'}</Badge>
                </td>
                <td className="px-4 py-3">
                  <Badge tone={feeTone(t.feeStatus)}>{t.feeStatus}</Badge>
                  {t.monthlyFee && <p className="text-xs text-slate-400">Rs {t.monthlyFee}</p>}
                </td>
                <td className="px-4 py-3">{t.userCount}</td>
                <td className="px-4 py-3">{t.acquiredBy?.name ?? '—'}</td>
                <td className="px-4 py-3 text-right">
                  <Link to={`/clients/${t.id}`} className="font-medium text-indigo-600 hover:underline">Manage</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {data && data.meta.totalPages > 1 && (
        <div className="flex gap-2">
          <Button variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
          <span className="flex items-center text-sm text-slate-500">Page {page} of {data.meta.totalPages}</span>
          <Button variant="secondary" disabled={page >= data.meta.totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
        </div>
      )}

      <Modal open={createOpen} title="Create new client" onClose={() => setCreateOpen(false)}>
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium">Shop name</label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium">Slug (URL id)</label>
              <Input
                value={form.slug}
                placeholder="my-shop"
                onChange={(e) => setForm({ ...form, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })}
              />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium">Tier</label>
              <Select value={form.tier} onChange={(e) => setForm({ ...form, tier: e.target.value })}>
                {Object.values(TENANT_TIERS).map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium">Sales rep</label>
              <Select value={form.acquiredById} onChange={(e) => setForm({ ...form, acquiredById: e.target.value })}>
                <option value="">None</option>
                {(salesReps ?? []).map((r) => (
                  <option key={r.id} value={r.id}>{r.fullName}</option>
                ))}
              </Select>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-medium">Fee status</label>
              <Select value={form.feeStatus} onChange={(e) => setForm({ ...form, feeStatus: e.target.value })}>
                {['TRIAL', 'ACTIVE', 'OVERDUE', 'SUSPENDED'].map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium">Monthly fee (Rs)</label>
              <Input type="number" value={form.monthlyFee} onChange={(e) => setForm({ ...form, monthlyFee: e.target.value })} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium">Fee due date</label>
              <Input type="date" value={form.feeDueDate} onChange={(e) => setForm({ ...form, feeDueDate: e.target.value })} />
            </div>
          </div>
          <hr />
          <p className="text-xs font-semibold uppercase text-slate-500">Owner account (POS login)</p>
          <div>
            <label className="mb-1 block text-xs font-medium">Full name</label>
            <Input value={form.adminFullName} onChange={(e) => setForm({ ...form, adminFullName: e.target.value })} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium">Email</label>
            <Input type="email" value={form.adminEmail} onChange={(e) => setForm({ ...form, adminEmail: e.target.value })} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium">Password (min 8 chars)</label>
            <Input type="password" value={form.adminPassword} onChange={(e) => setForm({ ...form, adminPassword: e.target.value })} />
          </div>
          {error && <p className="text-sm text-rose-600">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button
              disabled={createTenant.isPending}
              onClick={() => {
                if (form.adminPassword.length < 8) {
                  setError('Password must be at least 8 characters');
                  return;
                }
                createTenant.mutate();
              }}
            >
              {createTenant.isPending ? 'Creating…' : 'Create client'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
