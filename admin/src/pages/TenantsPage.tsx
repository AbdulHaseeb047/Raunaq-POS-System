import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { getTierFeaturePreset, TENANT_TIERS, type TenantTier } from '@pos/shared';

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
  isTrial: true,
  billingCycle: 'monthly' as 'monthly' | 'yearly',
  fee: '4500',
  feeDueDate: '',
  subscriptionStartAt: new Date().toISOString().slice(0, 16),
  subscriptionDays: '30',
};

const PLAN_PRICES: Record<TenantTier, { monthly: number; yearly: number }> = {
  [TENANT_TIERS.STARTER]: { monthly: 2500, yearly: 25000 },
  [TENANT_TIERS.STANDARD]: { monthly: 4500, yearly: 45000 },
  [TENANT_TIERS.PRO]: { monthly: 7500, yearly: 75000 },
};

function priceFor(tier: TenantTier, cycle: 'monthly' | 'yearly'): string {
  return String(PLAN_PRICES[tier][cycle]);
}

export function TenantsPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [extraFeatures, setExtraFeatures] = useState<string[]>([]);
  const [error, setError] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['tenants', page],
    queryFn: () => api.tenants.list(page, 20),
  });

  const { data: salesReps } = useQuery({
    queryKey: ['sales-reps'],
    queryFn: () => api.admin.salesReps(),
  });
  const { data: registry } = useQuery({
    queryKey: ['features'],
    queryFn: () => api.features.list(),
  });

  const openCreate = () => {
    setForm(emptyForm);
    setExtraFeatures([]);
    setShowAdvanced(false);
    setError('');
    setCreateOpen(true);
  };

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
        isTrial: form.isTrial,
        feeStatus: form.isTrial ? 'TRIAL' : 'ACTIVE',
        monthlyFee: form.isTrial ? null : Number(form.fee),
        feeDueDate: form.isTrial ? null : form.feeDueDate || null,
        featureKeys: [
          ...new Set([...getTierFeaturePreset(form.tier as TenantTier), ...extraFeatures]),
        ],
        ...(form.isTrial
          ? {
              subscriptionStartAt: new Date(form.subscriptionStartAt).toISOString(),
              subscriptionDays: Number(form.subscriptionDays),
              trialPlanTier: form.tier,
            }
          : {
              subscriptionDays: form.billingCycle === 'yearly' ? 365 : 30,
            }),
      }),
    onSuccess: () => {
      setCreateOpen(false);
      setForm(emptyForm);
      setExtraFeatures([]);
      setShowAdvanced(false);
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
        <Button onClick={openCreate}>+ New client</Button>
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
                  <Badge tone={t.isActive ? 'success' : 'danger'}>
                    {t.isActive ? 'Active' : 'Inactive'}
                  </Badge>
                </td>
                <td className="px-4 py-3">
                  <Badge tone={feeTone(t.feeStatus)}>{t.feeStatus}</Badge>
                  {t.monthlyFee && <p className="text-xs text-slate-400">Rs {t.monthlyFee}</p>}
                </td>
                <td className="px-4 py-3">{t.userCount}</td>
                <td className="px-4 py-3">{t.acquiredBy?.name ?? '—'}</td>
                <td className="px-4 py-3 text-right">
                  <Link
                    to={`/clients/${t.id}`}
                    className="font-medium text-indigo-600 hover:underline"
                  >
                    Manage
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {data && data.meta.totalPages > 1 && (
        <div className="flex gap-2">
          <Button variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            Previous
          </Button>
          <span className="flex items-center text-sm text-slate-500">
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

      <Modal open={createOpen} title="Create new client" onClose={() => setCreateOpen(false)}>
        <div className="space-y-4">
          <div>
            <p className="text-sm font-semibold text-slate-900">Client & plan</p>
            <p className="text-xs text-slate-500">
              Pick a plan pack, then choose whether this account starts as a trial or paid client.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium">Shop name</label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium">Slug (URL id)</label>
              <Input
                value={form.slug}
                placeholder="my-shop"
                onChange={(e) =>
                  setForm({
                    ...form,
                    slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''),
                  })
                }
              />
            </div>
          </div>
          <div>
            <label className="mb-2 block text-xs font-medium">Plan</label>
            <div className="grid gap-3 sm:grid-cols-3">
              {Object.values(TENANT_TIERS).map((tier) => {
                const active = form.tier === tier;
                return (
                  <button
                    key={tier}
                    type="button"
                    className={`rounded-xl border p-3 text-left transition ${
                      active
                        ? 'border-indigo-600 bg-indigo-50 ring-1 ring-indigo-600'
                        : 'border-slate-200 hover:border-indigo-300'
                    }`}
                    onClick={() => {
                      setForm({
                        ...form,
                        tier,
                        fee: priceFor(tier, form.billingCycle),
                      });
                      setExtraFeatures([]);
                    }}
                  >
                    <span className="block font-semibold">{tier}</span>
                    <span className="mt-1 block text-xs text-slate-500">
                      {getTierFeaturePreset(tier).length} included features
                    </span>
                    <span className="mt-2 block text-sm font-semibold text-indigo-700">
                      Rs {PLAN_PRICES[tier].monthly.toLocaleString('en-PK')} / month
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium">Sales rep</label>
            <Select
              value={form.acquiredById}
              onChange={(e) => setForm({ ...form, acquiredById: e.target.value })}
            >
              <option value="">None</option>
              {(salesReps ?? []).map((r) => (
                <option key={r.id} value={r.id}>
                  {r.fullName}
                </option>
              ))}
            </Select>
          </div>
          <label className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
            <input
              type="checkbox"
              checked={form.isTrial}
              onChange={(e) => setForm({ ...form, isTrial: e.target.checked })}
            />
            <div>
              <p className="text-sm font-medium">Start as a trial</p>
              <p className="text-xs text-slate-500">
                Turn this off to create a paid subscription immediately.
              </p>
            </div>
          </label>

          {form.isTrial ? (
            <div className="grid gap-4 rounded-xl border border-indigo-100 bg-indigo-50/50 p-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium">Trial starts</label>
                <Input
                  type="datetime-local"
                  value={form.subscriptionStartAt}
                  onChange={(e) => setForm({ ...form, subscriptionStartAt: e.target.value })}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium">Trial duration (days)</label>
                <Input
                  type="number"
                  min={1}
                  max={365}
                  value={form.subscriptionDays}
                  onChange={(e) => setForm({ ...form, subscriptionDays: e.target.value })}
                />
              </div>
            </div>
          ) : (
            <div className="grid gap-4 rounded-xl border border-emerald-100 bg-emerald-50/50 p-3 sm:grid-cols-3">
              <div>
                <label className="mb-1 block text-xs font-medium">Billing cycle</label>
                <Select
                  value={form.billingCycle}
                  onChange={(e) => {
                    const billingCycle = e.target.value as 'monthly' | 'yearly';
                    setForm({
                      ...form,
                      billingCycle,
                      fee: priceFor(form.tier as TenantTier, billingCycle),
                    });
                  }}
                >
                  <option value="monthly">Monthly</option>
                  <option value="yearly">Yearly</option>
                </Select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium">
                  {form.billingCycle === 'yearly' ? 'Yearly' : 'Monthly'} fee (Rs)
                </label>
                <Input
                  type="number"
                  min={0}
                  value={form.fee}
                  onChange={(e) => setForm({ ...form, fee: e.target.value })}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium">Payment due date</label>
                <Input
                  type="date"
                  value={form.feeDueDate}
                  onChange={(e) => setForm({ ...form, feeDueDate: e.target.value })}
                />
              </div>
            </div>
          )}

          <div className="rounded-xl border border-slate-200">
            <button
              type="button"
              className="flex w-full items-center justify-between px-3 py-2 text-left text-sm font-medium"
              onClick={() => setShowAdvanced((value) => !value)}
            >
              Advanced feature extras
              <span className="text-slate-400">{showAdvanced ? '−' : '+'}</span>
            </button>
            {showAdvanced && (
              <div className="border-t border-slate-200 p-3">
                <p className="mb-3 text-xs text-slate-500">
                  The {form.tier} preset is always included. Select only extra features to add.
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {(registry ?? [])
                    .filter(
                      (feature) =>
                        !getTierFeaturePreset(form.tier as TenantTier).includes(
                          feature.key as never,
                        ),
                    )
                    .map((feature) => (
                      <label
                        key={feature.key}
                        className="flex items-start gap-2 rounded-lg px-2 py-1.5 hover:bg-slate-50"
                      >
                        <input
                          type="checkbox"
                          className="mt-1"
                          checked={extraFeatures.includes(feature.key)}
                          onChange={(e) =>
                            setExtraFeatures((current) =>
                              e.target.checked
                                ? [...current, feature.key]
                                : current.filter((key) => key !== feature.key),
                            )
                          }
                        />
                        <span>
                          <span className="block text-sm">{feature.label}</span>
                          {feature.description && (
                            <span className="block text-xs text-slate-400">
                              {feature.description}
                            </span>
                          )}
                        </span>
                      </label>
                    ))}
                </div>
              </div>
            )}
          </div>

          <hr className="border-slate-200" />
          <p className="text-xs font-semibold uppercase text-slate-500">
            Owner account (POS login)
          </p>
          <div>
            <label className="mb-1 block text-xs font-medium">Full name</label>
            <Input
              value={form.adminFullName}
              onChange={(e) => setForm({ ...form, adminFullName: e.target.value })}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium">Email</label>
            <Input
              type="email"
              value={form.adminEmail}
              onChange={(e) => setForm({ ...form, adminEmail: e.target.value })}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium">Password (min 8 chars)</label>
            <Input
              type="password"
              value={form.adminPassword}
              onChange={(e) => setForm({ ...form, adminPassword: e.target.value })}
            />
          </div>
          {error && <p className="text-sm text-rose-600">{error}</p>}
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
                if (!form.name.trim() || !form.slug.trim() || !form.adminFullName.trim()) {
                  setError('Shop name, slug, and owner name are required');
                  return;
                }
                if (
                  form.isTrial &&
                  (!form.subscriptionStartAt || Number(form.subscriptionDays) < 1)
                ) {
                  setError('Enter a valid trial start and duration');
                  return;
                }
                if (!form.isTrial && (!form.fee || Number(form.fee) < 0)) {
                  setError('Enter a valid subscription fee');
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
