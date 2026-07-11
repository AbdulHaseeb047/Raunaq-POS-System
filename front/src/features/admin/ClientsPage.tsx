import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { getTierFeaturePreset, FEATURE_REGISTRY, TENANT_TIERS, type TenantTier } from '@pos/shared';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { PageHeader } from '@/components/ui/PageHeader';
import { Select } from '@/components/ui/Select';
import { PageLoader } from '@/components/ui/Spinner';
import { FeaturePicker } from '@/features/admin/FeaturePicker';
import { feeBadgeVariant, accessStatusBadgeVariant, accessStatusLabel, toDatetimeLocalValue } from '@/features/admin/admin-utils';
import { ApiError, api } from '@/lib/api-client';

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
  subscriptionStartAt: toDatetimeLocalValue(),
  subscriptionDays: '30',
};

const feeStatusOptions = ['TRIAL', 'ACTIVE', 'OVERDUE', 'SUSPENDED'].map((s) => ({
  value: s,
  label: s,
}));

const tierOptions = Object.values(TENANT_TIERS).map((t) => ({ value: t, label: t }));

export function ClientsPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [selectedFeatures, setSelectedFeatures] = useState<string[]>(
    () => getTierFeaturePreset(TENANT_TIERS.STANDARD),
  );
  const [error, setError] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['tenants', page],
    queryFn: () => api.platform.listTenants(page, 20),
  });

  const { data: salesReps } = useQuery({
    queryKey: ['sales-reps'],
    queryFn: () => api.admin.salesReps(),
  });

  const openCreate = () => {
    setForm(emptyForm);
    setSelectedFeatures(getTierFeaturePreset(TENANT_TIERS.STANDARD));
    setError('');
    setCreateOpen(true);
  };

  const createTenant = useMutation({
    mutationFn: () =>
      api.platform.createTenant({
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
        featureKeys: selectedFeatures,
        subscriptionStartAt: new Date(form.subscriptionStartAt).toISOString(),
        subscriptionDays: Number(form.subscriptionDays) || 30,
      }),
    onSuccess: () => {
      setCreateOpen(false);
      setForm(emptyForm);
      setSelectedFeatures(getTierFeaturePreset(TENANT_TIERS.STANDARD));
      setError('');
      void queryClient.invalidateQueries({ queryKey: ['tenants'] });
      void queryClient.invalidateQueries({ queryKey: ['admin-dashboard'] });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Failed to create client'),
  });

  const salesRepOptions = [
    { value: '', label: 'None' },
    ...(salesReps ?? []).map((r) => ({ value: r.id, label: r.fullName })),
  ];

  if (isLoading) return <PageLoader />;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Clients"
        subtitle="Create shop accounts and choose exactly which POS features they can use"
        action={<Button onClick={openCreate}>+ New client</Button>}
      />

      <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-[var(--shadow-card)]">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-surface-muted text-left text-xs uppercase text-text-muted">
              <th className="px-4 py-3">Client</th>
              <th className="px-4 py-3">Tier</th>
              <th className="px-4 py-3">Features</th>
              <th className="px-4 py-3">Account</th>
              <th className="px-4 py-3">Subscription</th>
              <th className="px-4 py-3">Fee</th>
              <th className="px-4 py-3">Users</th>
              <th className="px-4 py-3">Sales rep</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {(data?.data ?? []).length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-12 text-center text-text-muted">
                  No clients yet. Click <strong className="text-text">+ New client</strong> to create a shop account.
                </td>
              </tr>
            ) : (
              (data?.data ?? []).map((t) => (
                <tr key={t.id} className="border-b border-border/50">
                  <td className="px-4 py-3">
                    <p className="font-medium">{t.name}</p>
                    <p className="text-xs text-text-muted">{t.slug}</p>
                  </td>
                  <td className="px-4 py-3">{t.tier}</td>
                  <td className="px-4 py-3">
                    <Badge variant="brand">{t.featureCount} enabled</Badge>
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={t.isActive ? 'success' : 'danger'}>{t.isActive ? 'Active' : 'Inactive'}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={accessStatusBadgeVariant(t.accessStatus)}>
                      {accessStatusLabel(t.accessStatus)}
                    </Badge>
                    {t.daysRemaining != null && t.isActive && (
                      <p className="text-xs text-text-muted">{t.daysRemaining} day(s) left</p>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={feeBadgeVariant(t.feeStatus)}>{t.feeStatus}</Badge>
                    {t.monthlyFee && <p className="text-xs text-text-muted">Rs {t.monthlyFee}</p>}
                  </td>
                  <td className="px-4 py-3">{t.userCount}</td>
                  <td className="px-4 py-3">{t.acquiredBy?.name ?? '—'}</td>
                  <td className="px-4 py-3 text-right">
                    <Link to={`/admin/clients/${t.id}`} className="font-medium text-brand-700 hover:underline">
                      Manage
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {data && data.meta.totalPages > 1 && (
        <div className="flex gap-2">
          <Button variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            Previous
          </Button>
          <span className="flex items-center text-sm text-text-muted">
            Page {page} of {data.meta.totalPages}
          </span>
          <Button variant="secondary" disabled={page >= data.meta.totalPages} onClick={() => setPage((p) => p + 1)}>
            Next
          </Button>
        </div>
      )}

      <Modal open={createOpen} title="Create new client" onClose={() => setCreateOpen(false)} size="lg">
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Shop name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <Input
              label="Slug (URL id)"
              value={form.slug}
              placeholder="my-shop"
              onChange={(e) => setForm({ ...form, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Select
              label="Tier (loads default features — you can customize below)"
              value={form.tier}
              options={tierOptions}
              onChange={(e) => {
                const tier = e.target.value as TenantTier;
                setForm({ ...form, tier });
                setSelectedFeatures(getTierFeaturePreset(tier));
              }}
            />
            <Select
              label="Sales rep"
              value={form.acquiredById}
              options={salesRepOptions}
              onChange={(e) => setForm({ ...form, acquiredById: e.target.value })}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <Select
              label="Fee status"
              value={form.feeStatus}
              options={feeStatusOptions}
              onChange={(e) => setForm({ ...form, feeStatus: e.target.value })}
            />
            <Input
              label="Monthly fee (Rs)"
              type="number"
              value={form.monthlyFee}
              onChange={(e) => setForm({ ...form, monthlyFee: e.target.value })}
            />
            <Input
              label="Fee due date"
              type="date"
              value={form.feeDueDate}
              onChange={(e) => setForm({ ...form, feeDueDate: e.target.value })}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Subscription start"
              type="datetime-local"
              value={form.subscriptionStartAt}
              onChange={(e) => setForm({ ...form, subscriptionStartAt: e.target.value })}
            />
            <Input
              label="Access period (days)"
              type="number"
              min={1}
              max={365}
              value={form.subscriptionDays}
              onChange={(e) => setForm({ ...form, subscriptionDays: e.target.value })}
            />
          </div>
          <p className="text-xs text-text-muted">
            Portal access ends automatically after {form.subscriptionDays || 30} day(s) from the start date/time above.
          </p>

          <FeaturePicker
              features={FEATURE_REGISTRY}
              selected={selectedFeatures}
              onChange={setSelectedFeatures}
              minFeatures={1}
            />

          <hr />
          <p className="text-xs font-semibold uppercase text-text-muted">Owner account (POS login)</p>
          <Input label="Full name" value={form.adminFullName} onChange={(e) => setForm({ ...form, adminFullName: e.target.value })} />
          <Input label="Email" type="email" value={form.adminEmail} onChange={(e) => setForm({ ...form, adminEmail: e.target.value })} />
          <Input
            label="Password (min 8 chars)"
            type="password"
            value={form.adminPassword}
            onChange={(e) => setForm({ ...form, adminPassword: e.target.value })}
          />
          {error && <p className="text-sm text-danger">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={createTenant.isPending}
              onClick={() => {
                if (form.adminPassword.length < 8) {
                  setError('Password must be at least 8 characters');
                  return;
                }
                if (selectedFeatures.length === 0) {
                  setError('Select at least one feature for this client');
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
