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
import {
  feeBadgeVariant,
  accessStatusBadgeVariant,
  accessStatusLabel,
  toDatetimeLocalValue,
} from '@/features/admin/admin-utils';
import { ApiError, api } from '@/lib/api-client';
import { PRICING_PLANS, type BillingCycle } from '@/lib/pricing-plans';

const emptyForm = {
  name: '',
  slug: '',
  tier: TENANT_TIERS.STANDARD as string,
  adminEmail: '',
  adminPassword: '',
  adminFullName: '',
  acquiredById: '',
  isTrial: true,
  billingCycle: 'monthly' as BillingCycle,
  feeStatus: 'TRIAL',
  monthlyFee: '4500',
  feeDueDate: '',
  subscriptionStartAt: toDatetimeLocalValue(),
  subscriptionDays: '30',
};

function planPrice(tier: string, cycle: BillingCycle): string {
  const plan = PRICING_PLANS.find((item) => item.id === tier);
  return String(cycle === 'yearly' ? (plan?.yearlyPrice ?? 0) : (plan?.monthlyPrice ?? 0));
}

export function ClientsPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [selectedFeatures, setSelectedFeatures] = useState<string[]>(() =>
    getTierFeaturePreset(TENANT_TIERS.STANDARD),
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
        isTrial: form.isTrial,
        feeStatus: form.isTrial ? 'TRIAL' : 'ACTIVE',
        monthlyFee: form.monthlyFee ? Number(form.monthlyFee) : null,
        feeDueDate: form.feeDueDate || null,
        featureKeys: selectedFeatures,
        subscriptionStartAt: new Date(form.subscriptionStartAt).toISOString(),
        subscriptionDays: form.isTrial
          ? Number(form.subscriptionDays) || 30
          : form.billingCycle === 'yearly'
            ? 365
            : 30,
        trialPlanTier: form.isTrial ? form.tier : null,
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
  const selectedPreset = getTierFeaturePreset(form.tier as TenantTier);
  const presetSet = new Set<string>(selectedPreset);
  const extraFeatures = selectedFeatures.filter((key) => !presetSet.has(key));
  const optionalFeatureDefinitions = FEATURE_REGISTRY.filter(
    (feature) => !presetSet.has(feature.key),
  );

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
                  No clients yet. Click <strong className="text-text">+ New client</strong> to
                  create a shop account.
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
                    <Badge variant={t.isActive ? 'success' : 'danger'}>
                      {t.isActive ? 'Active' : 'Inactive'}
                    </Badge>
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
                    <Link
                      to={`/admin/clients/${t.id}`}
                      className="font-medium text-brand-700 hover:underline"
                    >
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
          <Button
            variant="secondary"
            disabled={page >= data.meta.totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </div>
      )}

      <Modal
        open={createOpen}
        title="Create new client"
        onClose={() => setCreateOpen(false)}
        size="lg"
      >
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Shop name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
            <Input
              label="Slug (URL id)"
              value={form.slug}
              placeholder="my-shop"
              onChange={(e) =>
                setForm({ ...form, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })
              }
            />
          </div>
          <section className="space-y-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">Plan</p>
              <p className="text-sm text-text-muted">
                Included features are enabled automatically and cannot be removed.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              {PRICING_PLANS.map((plan) => {
                const active = form.tier === plan.id;
                return (
                  <button
                    key={plan.id}
                    type="button"
                    onClick={() => {
                      const tier = plan.id as TenantTier;
                      setForm({
                        ...form,
                        tier,
                        monthlyFee: planPrice(tier, form.billingCycle),
                      });
                      setSelectedFeatures(getTierFeaturePreset(tier));
                    }}
                    className={`rounded-xl border p-3 text-left transition ${
                      active
                        ? 'border-brand-600 bg-brand-50 ring-1 ring-brand-600'
                        : 'border-border bg-white hover:border-brand-300'
                    }`}
                  >
                    <span className="block font-semibold">{plan.name}</span>
                    <span className="mt-1 block text-xs text-text-muted">{plan.tagline}</span>
                    <span className="mt-2 block text-sm font-semibold text-brand-700">
                      Rs {plan.monthlyPrice.toLocaleString('en-PK')} / month
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="rounded-xl border border-border bg-surface-muted/30 p-4">
            <p className="text-sm font-semibold">Access type</p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setForm({ ...form, isTrial: true, feeStatus: 'TRIAL' })}
                className={`rounded-lg border px-3 py-2 text-sm font-medium ${
                  form.isTrial ? 'border-brand-600 bg-brand-50 text-brand-800' : 'border-border'
                }`}
              >
                Trial
              </button>
              <button
                type="button"
                onClick={() =>
                  setForm({
                    ...form,
                    isTrial: false,
                    feeStatus: 'ACTIVE',
                    monthlyFee: planPrice(form.tier, form.billingCycle),
                  })
                }
                className={`rounded-lg border px-3 py-2 text-sm font-medium ${
                  !form.isTrial ? 'border-brand-600 bg-brand-50 text-brand-800' : 'border-border'
                }`}
              >
                Paid subscription
              </button>
            </div>
          </section>

          {form.isTrial ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="Trial starts"
                type="datetime-local"
                value={form.subscriptionStartAt}
                onChange={(e) => setForm({ ...form, subscriptionStartAt: e.target.value })}
              />
              <Input
                label="Trial length (days)"
                type="number"
                min={1}
                max={365}
                value={form.subscriptionDays}
                onChange={(e) => setForm({ ...form, subscriptionDays: e.target.value })}
              />
            </div>
          ) : (
            <>
              <div className="grid gap-4 sm:grid-cols-3">
                <Select
                  label="Billing cycle"
                  value={form.billingCycle}
                  options={[
                    { value: 'monthly', label: 'Monthly' },
                    { value: 'yearly', label: 'Yearly' },
                  ]}
                  onChange={(e) => {
                    const billingCycle = e.target.value as BillingCycle;
                    setForm({
                      ...form,
                      billingCycle,
                      monthlyFee: planPrice(form.tier, billingCycle),
                    });
                  }}
                />
                <Input
                  label="Agreed fee (Rs)"
                  type="number"
                  min={0}
                  value={form.monthlyFee}
                  onChange={(e) => setForm({ ...form, monthlyFee: e.target.value })}
                />
                <Input
                  label="Next payment due"
                  type="date"
                  value={form.feeDueDate}
                  onChange={(e) => setForm({ ...form, feeDueDate: e.target.value })}
                />
              </div>
              <Input
                label="Subscription starts"
                type="datetime-local"
                value={form.subscriptionStartAt}
                onChange={(e) => setForm({ ...form, subscriptionStartAt: e.target.value })}
              />
            </>
          )}

          <Select
            label="Sales rep"
            value={form.acquiredById}
            options={salesRepOptions}
            onChange={(e) => setForm({ ...form, acquiredById: e.target.value })}
          />

          <div className="rounded-xl border border-border p-3">
            <p className="text-sm font-semibold">
              {selectedPreset.length} features included with {form.tier}
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {FEATURE_REGISTRY.filter((feature) => presetSet.has(feature.key)).map((feature) => (
                <Badge key={feature.key} variant="default">
                  {feature.label}
                </Badge>
              ))}
            </div>
            {optionalFeatureDefinitions.length > 0 && (
              <details className="mt-3">
                <summary className="cursor-pointer text-sm font-semibold text-brand-700">
                  Advanced feature overrides ({extraFeatures.length})
                </summary>
                <div className="mt-3">
                  <FeaturePicker
                    features={optionalFeatureDefinitions}
                    selected={extraFeatures}
                    onChange={(extras) => setSelectedFeatures([...selectedPreset, ...extras])}
                    minFeatures={0}
                  />
                </div>
              </details>
            )}
          </div>

          <hr />
          <p className="text-xs font-semibold uppercase text-text-muted">
            Shop owner account (POS login)
          </p>
          <p className="rounded-xl border border-brand-200 bg-brand-50/50 px-3 py-2 text-xs text-brand-900">
            Enter the <strong>client shop owner’s</strong> email and a temporary password — not your
            Raunaq admin login. Share these with the shop so they can open the POS.
          </p>
          <Input
            label="Owner full name"
            value={form.adminFullName}
            onChange={(e) => setForm({ ...form, adminFullName: e.target.value })}
          />
          <Input
            label="Owner email (their POS login)"
            type="email"
            value={form.adminEmail}
            onChange={(e) => setForm({ ...form, adminEmail: e.target.value })}
          />
          <Input
            label="Temporary password (min 8 chars)"
            type="password"
            value={form.adminPassword}
            onChange={(e) => setForm({ ...form, adminPassword: e.target.value })}
            hint="Set any password for the shop owner — they should change it after first login"
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
