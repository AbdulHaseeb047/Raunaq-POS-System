import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getTierFeaturePreset, TENANT_TIERS, type TenantTier } from '@pos/shared';

import { Badge, Button, Card, Input, Modal, PageLoader, Select } from '@/components/ui';
import { ApiError, api, type TenantUser } from '@/lib/api';

type BillingCycle = 'monthly' | 'yearly';

const PLAN_PRICES: Record<TenantTier, { monthly: number; yearly: number }> = {
  [TENANT_TIERS.STARTER]: { monthly: 2500, yearly: 25000 },
  [TENANT_TIERS.STANDARD]: { monthly: 4500, yearly: 45000 },
  [TENANT_TIERS.PRO]: { monthly: 7500, yearly: 75000 },
};

function toLocalDateTime(value?: string | null): string {
  const date = value ? new Date(value) : new Date();
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function displayDate(value?: string | null): string {
  return value ? new Date(value).toLocaleString() : '—';
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.message : fallback;
}

function statusTone(status: string): 'default' | 'success' | 'warning' | 'danger' {
  if (['active', 'active_paid', 'trial_active'].includes(status)) return 'success';
  if (['expiring_soon', 'payment_overdue'].includes(status)) return 'warning';
  return 'danger';
}

function statusLabel(status: string): string {
  switch (status) {
    case 'trial_expired':
    case 'trial_expired_starter':
      return 'Trial expired (login blocked)';
    case 'subscription_expired':
    case 'subscription_expired_starter':
      return 'Subscription ended (login blocked)';
    case 'access_revoked':
      return 'Access revoked (blocked)';
    default:
      return status.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
  }
}

function isPortalOpen(tenant: {
  isActive: boolean;
  accessStatus?: string | null;
  isSoftLocked?: boolean;
}): boolean {
  if (!tenant.isActive) return false;
  if (tenant.isSoftLocked) return false;
  const status = tenant.accessStatus ?? '';
  return ![
    'access_revoked',
    'trial_expired',
    'subscription_expired',
    'trial_expired_starter',
    'subscription_expired_starter',
  ].includes(status);
}

export function TenantDetailPage() {
  const { tenantId = '' } = useParams<{ tenantId: string }>();
  const queryClient = useQueryClient();
  const [error, setError] = useState('');

  const [overview, setOverview] = useState({ name: '', acquiredById: '' });
  const [plan, setPlan] = useState({
    tier: TENANT_TIERS.STANDARD as string,
    billingCycle: 'monthly' as BillingCycle,
    fee: '4500',
    feeDueDate: '',
    subscriptionStartAt: toLocalDateTime(),
    subscriptionDays: '30',
  });
  const [extraFeatures, setExtraFeatures] = useState<string[]>([]);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const [revokeOpen, setRevokeOpen] = useState(false);
  const [revokeReason, setRevokeReason] = useState('');
  const [restoreOpen, setRestoreOpen] = useState(false);
  const [restoreDays, setRestoreDays] = useState('30');

  const [userOpen, setUserOpen] = useState(false);
  const [userForm, setUserForm] = useState({
    email: '',
    password: '',
    fullName: '',
    role: 'STAFF',
    featureKeys: [] as string[],
  });
  const [editUser, setEditUser] = useState<TenantUser | null>(null);
  const [editUserName, setEditUserName] = useState('');
  const [editUserActive, setEditUserActive] = useState(true);
  const [editUserFeatures, setEditUserFeatures] = useState<string[]>([]);
  const [passwordUser, setPasswordUser] = useState<TenantUser | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [mustChangePassword, setMustChangePassword] = useState(true);

  const { data: tenant, isLoading } = useQuery({
    queryKey: ['tenant', tenantId],
    queryFn: () => api.tenants.get(tenantId),
    enabled: Boolean(tenantId),
  });
  const { data: users } = useQuery({
    queryKey: ['tenant-users', tenantId],
    queryFn: () => api.tenants.users(tenantId),
    enabled: Boolean(tenantId),
  });
  const { data: registry } = useQuery({
    queryKey: ['features'],
    queryFn: () => api.features.list(),
  });
  const { data: salesReps } = useQuery({
    queryKey: ['sales-reps'],
    queryFn: () => api.admin.salesReps(),
  });

  useEffect(() => {
    if (!tenant) return;
    const tier = tenant.tier as TenantTier;
    const billingCycle: BillingCycle = tenant.subscriptionDays >= 300 ? 'yearly' : 'monthly';
    const preset = new Set<string>(getTierFeaturePreset(tier));
    setOverview({ name: tenant.name, acquiredById: tenant.acquiredBy?.id ?? '' });
    setPlan({
      tier,
      billingCycle,
      fee: tenant.monthlyFee ?? String(PLAN_PRICES[tier][billingCycle]),
      feeDueDate: tenant.feeDueDate ?? '',
      subscriptionStartAt: toLocalDateTime(tenant.subscriptionStartAt),
      subscriptionDays: String(tenant.subscriptionDays || 30),
    });
    setExtraFeatures(tenant.features.filter((key) => !preset.has(key)));
    setRestoreDays(String(tenant.subscriptionDays || 30));
  }, [tenant]);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['tenant', tenantId] });
    void queryClient.invalidateQueries({ queryKey: ['tenants'] });
    void queryClient.invalidateQueries({ queryKey: ['tenant-users', tenantId] });
  };

  const saveOverview = useMutation({
    mutationFn: () =>
      api.tenants.update(tenantId, {
        name: overview.name,
        acquiredById: overview.acquiredById || null,
      }),
    onSuccess: () => {
      setError('');
      invalidate();
    },
    onError: (err) => setError(errorMessage(err, 'Overview update failed')),
  });

  const selectedPlanFeatures = useMemo(
    () => [...new Set([...getTierFeaturePreset(plan.tier as TenantTier), ...extraFeatures])],
    [extraFeatures, plan.tier],
  );

  const savePlan = useMutation({
    mutationFn: async () => {
      const isTrial = tenant?.feeStatus === 'TRIAL';
      await api.tenants.update(tenantId, {
        tier: plan.tier,
        trialPlanTier: isTrial ? plan.tier : null,
        isTrial,
        feeStatus: isTrial ? 'TRIAL' : tenant?.feeStatus,
        monthlyFee: isTrial ? null : Number(plan.fee),
        feeDueDate: isTrial ? null : plan.feeDueDate || null,
        subscriptionStartAt: new Date(plan.subscriptionStartAt).toISOString(),
        subscriptionDays: isTrial
          ? Number(plan.subscriptionDays)
          : plan.billingCycle === 'yearly'
            ? 365
            : 30,
      });
      return api.tenants.setFeatures(tenantId, selectedPlanFeatures);
    },
    onSuccess: () => {
      setError('');
      invalidate();
    },
    onError: (err) => setError(errorMessage(err, 'Plan update failed')),
  });

  const convertToPaid = useMutation({
    mutationFn: () =>
      api.tenants.update(tenantId, {
        tier: plan.tier,
        trialPlanTier: null,
        isTrial: false,
        feeStatus: 'ACTIVE',
        monthlyFee: Number(plan.fee),
        feeDueDate: plan.feeDueDate || null,
        subscriptionStartAt: new Date().toISOString(),
        subscriptionDays: plan.billingCycle === 'yearly' ? 365 : 30,
      }),
    onSuccess: () => {
      setError('');
      invalidate();
    },
    onError: (err) => setError(errorMessage(err, 'Conversion failed')),
  });

  const revokeAccess = useMutation({
    mutationFn: () =>
      api.tenants.revokeAccess(
        tenantId,
        revokeReason.trim() || 'Access revoked by platform administrator',
      ),
    onSuccess: () => {
      setRevokeOpen(false);
      setRevokeReason('');
      setError('');
      invalidate();
    },
    onError: (err) => setError(errorMessage(err, 'Could not revoke portal access')),
  });

  const restoreAccess = useMutation({
    mutationFn: () =>
      api.tenants.restoreAccess(tenantId, {
        subscriptionDays: Number(restoreDays) || 30,
        feeStatus: tenant?.feeStatus === 'TRIAL' ? 'TRIAL' : 'ACTIVE',
      }),
    onSuccess: () => {
      setRestoreOpen(false);
      setError('');
      invalidate();
    },
    onError: (err) => setError(errorMessage(err, 'Could not restore portal access')),
  });

  const createUser = useMutation({
    mutationFn: () =>
      api.tenants.createUser(tenantId, {
        email: userForm.email,
        password: userForm.password,
        fullName: userForm.fullName,
        role: userForm.role,
        featureKeys: userForm.role === 'STAFF' ? userForm.featureKeys : undefined,
      }),
    onSuccess: () => {
      setUserOpen(false);
      setUserForm({ email: '', password: '', fullName: '', role: 'STAFF', featureKeys: [] });
      setError('');
      invalidate();
    },
    onError: (err) => setError(errorMessage(err, 'Failed to create user')),
  });

  const updateUser = useMutation({
    mutationFn: async () => {
      if (!editUser) return;
      await api.tenants.updateUser(tenantId, editUser.id, {
        fullName: editUserName,
        isActive: editUserActive,
      });
      if (editUser.role === 'STAFF') {
        await api.tenants.setUserFeatures(tenantId, editUser.id, editUserFeatures);
      }
    },
    onSuccess: () => {
      setEditUser(null);
      setError('');
      invalidate();
    },
    onError: (err) => setError(errorMessage(err, 'User update failed')),
  });

  const deleteUser = useMutation({
    mutationFn: (userId: string) => api.tenants.deleteUser(tenantId, userId),
    onSuccess: () => {
      setError('');
      invalidate();
    },
    onError: (err) => setError(errorMessage(err, 'User deletion failed')),
  });

  const setUserPassword = useMutation({
    mutationFn: () =>
      api.tenants.setUserPassword(tenantId, passwordUser!.id, {
        password: newPassword,
        mustChangePassword,
      }),
    onSuccess: () => {
      setPasswordUser(null);
      setNewPassword('');
      setMustChangePassword(true);
      setError('');
    },
    onError: (err) => setError(errorMessage(err, 'Password reset failed')),
  });

  if (isLoading || !tenant) return <PageLoader />;

  const isTrial = tenant.feeStatus === 'TRIAL';
  const portalOpen = isPortalOpen(tenant);
  const presetSet = new Set<string>(getTierFeaturePreset(plan.tier as TenantTier));
  const optionalFeatures = (registry ?? []).filter((feature) => !presetSet.has(feature.key));

  return (
    <div className="space-y-6">
      <div>
        <Link to="/clients" className="text-sm text-indigo-600 hover:underline">
          ← Back to clients
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold text-slate-900">{tenant.name}</h1>
          <Badge tone={statusTone(tenant.accessStatus)}>{statusLabel(tenant.accessStatus)}</Badge>
        </div>
        <p className="text-slate-500">
          /{tenant.slug} · {tenant.tier}
        </p>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
          <button type="button" className="ml-2 underline" onClick={() => setError('')}>
            Dismiss
          </button>
        </div>
      )}

      <Card title="Overview & access">
        <div className="grid gap-6 lg:grid-cols-[1fr_1.25fr]">
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-xs font-medium">Shop name</label>
              <Input
                value={overview.name}
                onChange={(event) => setOverview({ ...overview, name: event.target.value })}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium">Sales rep</label>
              <Select
                value={overview.acquiredById}
                onChange={(event) => setOverview({ ...overview, acquiredById: event.target.value })}
              >
                <option value="">None</option>
                {(salesReps ?? []).map((rep) => (
                  <option key={rep.id} value={rep.id}>
                    {rep.fullName}
                  </option>
                ))}
              </Select>
            </div>
            <Button
              disabled={saveOverview.isPending || !overview.name.trim()}
              onClick={() => saveOverview.mutate()}
            >
              Save overview
            </Button>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <p className="text-xs text-slate-500">Portal login</p>
                <p className="text-sm font-medium">{portalOpen ? 'Allowed' : 'Blocked'}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Access status</p>
                <p className="text-sm font-medium">{statusLabel(tenant.accessStatus)}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">
                  {isTrial ? 'Trial ends' : 'Subscription ends'}
                </p>
                <p className="text-sm font-medium">{displayDate(tenant.subscriptionEndsAt)}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Days remaining</p>
                <p className="text-sm font-medium">{tenant.daysRemaining ?? '—'}</p>
              </div>
            </div>
            {tenant.accessRevokeReason && (
              <p className="mt-3 rounded-lg bg-white px-3 py-2 text-sm text-slate-600">
                <strong>Reason:</strong> {tenant.accessRevokeReason}
              </p>
            )}
            <p className="mt-3 text-xs text-slate-500">
              When the end date passes, login is blocked automatically until you renew or restore
              access. Revoke is for manual cut-off before that date.
            </p>
            <div className="mt-4">
              {portalOpen ? (
                <Button variant="danger" onClick={() => setRevokeOpen(true)}>
                  Revoke portal access
                </Button>
              ) : (
                <Button onClick={() => setRestoreOpen(true)}>Restore portal access</Button>
              )}
            </div>
          </div>
        </div>
      </Card>

      <Card
        title="Plan & billing"
        action={<Badge tone={isTrial ? 'default' : 'success'}>{isTrial ? 'Trial' : 'Paid'}</Badge>}
      >
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="sm:col-span-2 lg:col-span-3">
              <label className="mb-2 block text-xs font-medium">Plan</label>
              <div className="grid gap-3 sm:grid-cols-3">
                {Object.values(TENANT_TIERS).map((tier) => {
                  const active = plan.tier === tier;
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
                        if (active) return;
                        const confirmed = window.confirm(
                          `Change this client to ${tier}? Included features will switch to the ${tier} preset and current advanced extras will be cleared.`,
                        );
                        if (!confirmed) return;
                        setPlan({
                          ...plan,
                          tier,
                          fee: String(PLAN_PRICES[tier][plan.billingCycle]),
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

            {isTrial ? (
              <>
                <div>
                  <label className="mb-1 block text-xs font-medium">Trial starts</label>
                  <Input
                    type="datetime-local"
                    value={plan.subscriptionStartAt}
                    onChange={(event) =>
                      setPlan({ ...plan, subscriptionStartAt: event.target.value })
                    }
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium">Trial duration (days)</label>
                  <Input
                    type="number"
                    min={1}
                    max={365}
                    value={plan.subscriptionDays}
                    onChange={(event) => setPlan({ ...plan, subscriptionDays: event.target.value })}
                  />
                </div>
              </>
            ) : (
              <>
                <div>
                  <label className="mb-1 block text-xs font-medium">Billing cycle</label>
                  <Select
                    value={plan.billingCycle}
                    onChange={(event) => {
                      const billingCycle = event.target.value as BillingCycle;
                      setPlan({
                        ...plan,
                        billingCycle,
                        fee: String(PLAN_PRICES[plan.tier as TenantTier][billingCycle]),
                      });
                    }}
                  >
                    <option value="monthly">Monthly</option>
                    <option value="yearly">Yearly</option>
                  </Select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium">
                    {plan.billingCycle === 'yearly' ? 'Yearly' : 'Monthly'} fee (Rs)
                  </label>
                  <Input
                    type="number"
                    min={0}
                    value={plan.fee}
                    onChange={(event) => setPlan({ ...plan, fee: event.target.value })}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium">Payment due date</label>
                  <Input
                    type="date"
                    value={plan.feeDueDate}
                    onChange={(event) => setPlan({ ...plan, feeDueDate: event.target.value })}
                  />
                </div>
                <div>
                  <p className="text-xs text-slate-500">Subscription started</p>
                  <p className="mt-2 text-sm font-medium">
                    {displayDate(tenant.subscriptionStartAt)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Subscription ends</p>
                  <p className="mt-2 text-sm font-medium">
                    {displayDate(tenant.subscriptionEndsAt)}
                  </p>
                </div>
              </>
            )}
          </div>

          {isTrial && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
              <p className="text-sm font-medium text-emerald-900">Convert to paid</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <Select
                  value={plan.billingCycle}
                  onChange={(event) => {
                    const billingCycle = event.target.value as BillingCycle;
                    setPlan({
                      ...plan,
                      billingCycle,
                      fee: String(PLAN_PRICES[plan.tier as TenantTier][billingCycle]),
                    });
                  }}
                >
                  <option value="monthly">Monthly</option>
                  <option value="yearly">Yearly</option>
                </Select>
                <Input
                  type="number"
                  min={0}
                  value={plan.fee}
                  onChange={(event) => setPlan({ ...plan, fee: event.target.value })}
                  placeholder="Fee (Rs)"
                />
                <Input
                  type="date"
                  value={plan.feeDueDate}
                  onChange={(event) => setPlan({ ...plan, feeDueDate: event.target.value })}
                />
              </div>
              <Button
                className="mt-3"
                disabled={convertToPaid.isPending || !plan.fee}
                onClick={() => convertToPaid.mutate()}
              >
                Convert to paid
              </Button>
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
                  All {plan.tier} preset features are included automatically. Add optional extras
                  below.
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {optionalFeatures.map((feature) => (
                    <label
                      key={feature.key}
                      className="flex items-start gap-2 rounded-lg px-2 py-1.5 hover:bg-slate-50"
                    >
                      <input
                        type="checkbox"
                        className="mt-1"
                        checked={extraFeatures.includes(feature.key)}
                        onChange={(event) =>
                          setExtraFeatures((current) =>
                            event.target.checked
                              ? [...current, feature.key]
                              : current.filter((key) => key !== feature.key),
                          )
                        }
                      />
                      <span className="text-sm">{feature.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>

          <Button disabled={savePlan.isPending} onClick={() => savePlan.mutate()}>
            Save plan & billing
          </Button>
        </div>
      </Card>

      <Card
        title="Users"
        action={
          <Button
            onClick={() => {
              setUserOpen(true);
              setError('');
            }}
          >
            Add user
          </Button>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase text-slate-500">
                <th className="pb-2">Name</th>
                <th className="pb-2">Email</th>
                <th className="pb-2">Role</th>
                <th className="pb-2">Status</th>
                <th className="pb-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {(users?.data ?? []).map((user) => (
                <tr key={user.id} className="border-b border-slate-50">
                  <td className="py-3 font-medium">{user.fullName}</td>
                  <td className="py-3">{user.email}</td>
                  <td className="py-3">{user.role}</td>
                  <td className="py-3">
                    <Badge tone={user.isActive ? 'success' : 'danger'}>
                      {user.isActive ? 'Active' : 'Inactive'}
                    </Badge>
                  </td>
                  <td className="py-3 text-right">
                    <div className="flex flex-wrap justify-end gap-2">
                      <Button
                        variant="secondary"
                        onClick={() => {
                          setEditUser(user);
                          setEditUserName(user.fullName);
                          setEditUserActive(user.isActive);
                          setEditUserFeatures(user.features);
                        }}
                      >
                        Edit
                      </Button>
                      <Button
                        variant="secondary"
                        onClick={() => {
                          setPasswordUser(user);
                          setNewPassword('');
                          setMustChangePassword(true);
                        }}
                      >
                        Password
                      </Button>
                      <Button
                        variant="danger"
                        disabled={deleteUser.isPending}
                        onClick={() => {
                          if (
                            window.confirm(
                              `Permanently delete ${user.fullName}? This cannot be undone.`,
                            )
                          ) {
                            deleteUser.mutate(user.id);
                          }
                        }}
                      >
                        Delete
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {(users?.data ?? []).length === 0 && (
            <p className="py-8 text-center text-sm text-slate-500">No users found.</p>
          )}
        </div>
      </Card>

      <Modal open={revokeOpen} title="Revoke portal access" onClose={() => setRevokeOpen(false)}>
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            All client users will be signed out and blocked until access is restored.
          </p>
          <div>
            <label className="mb-1 block text-xs font-medium">Reason (optional)</label>
            <textarea
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-500"
              rows={3}
              value={revokeReason}
              onChange={(event) => setRevokeReason(event.target.value)}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setRevokeOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              disabled={revokeAccess.isPending}
              onClick={() => revokeAccess.mutate()}
            >
              Revoke access
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={restoreOpen} title="Restore portal access" onClose={() => setRestoreOpen(false)}>
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            Reopen the portal and begin a new {isTrial ? 'trial' : 'subscription'} period today.
          </p>
          <div>
            <label className="mb-1 block text-xs font-medium">
              {isTrial ? 'Trial' : 'Subscription'} duration (days)
            </label>
            <Input
              type="number"
              min={1}
              max={365}
              value={restoreDays}
              onChange={(event) => setRestoreDays(event.target.value)}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setRestoreOpen(false)}>
              Cancel
            </Button>
            <Button disabled={restoreAccess.isPending} onClick={() => restoreAccess.mutate()}>
              Restore access
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={userOpen} title="Add client user" onClose={() => setUserOpen(false)}>
        <div className="space-y-3">
          <Input
            placeholder="Full name"
            value={userForm.fullName}
            onChange={(event) => setUserForm({ ...userForm, fullName: event.target.value })}
          />
          <Input
            type="email"
            placeholder="Email"
            value={userForm.email}
            onChange={(event) => setUserForm({ ...userForm, email: event.target.value })}
          />
          <Input
            type="password"
            placeholder="Password (min 8)"
            value={userForm.password}
            onChange={(event) => setUserForm({ ...userForm, password: event.target.value })}
          />
          <Select
            value={userForm.role}
            onChange={(event) =>
              setUserForm({ ...userForm, role: event.target.value, featureKeys: [] })
            }
          >
            <option value="STAFF">Staff</option>
            <option value="CLIENT_ADMIN">Client Admin</option>
          </Select>
          {userForm.role === 'STAFF' && (
            <FeatureCheckboxes
              available={tenant.features}
              registry={registry ?? []}
              selected={userForm.featureKeys}
              onChange={(featureKeys) => setUserForm({ ...userForm, featureKeys })}
            />
          )}
          <Button
            disabled={createUser.isPending}
            onClick={() => {
              if (
                !userForm.fullName.trim() ||
                !userForm.email.trim() ||
                userForm.password.length < 8
              ) {
                setError('Name, email, and a password of at least 8 characters are required');
                return;
              }
              createUser.mutate();
            }}
          >
            Create user
          </Button>
        </div>
      </Modal>

      <Modal open={editUser != null} title="Edit user" onClose={() => setEditUser(null)}>
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium">Full name</label>
            <Input value={editUserName} onChange={(event) => setEditUserName(event.target.value)} />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={editUserActive}
              onChange={(event) => setEditUserActive(event.target.checked)}
            />
            User can sign in
          </label>
          {editUser?.role === 'STAFF' && (
            <FeatureCheckboxes
              available={tenant.features}
              registry={registry ?? []}
              selected={editUserFeatures}
              onChange={setEditUserFeatures}
            />
          )}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setEditUser(null)}>
              Cancel
            </Button>
            <Button
              disabled={updateUser.isPending || !editUserName.trim()}
              onClick={() => updateUser.mutate()}
            >
              Save user
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={passwordUser != null}
        title="Set user password"
        onClose={() => setPasswordUser(null)}
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            Set a new password for <strong>{passwordUser?.fullName}</strong>. Existing sessions will
            be signed out.
          </p>
          <Input
            type="password"
            placeholder="New password (min 8)"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
          />
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={mustChangePassword}
              onChange={(event) => setMustChangePassword(event.target.checked)}
            />
            Require password change on next login
          </label>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setPasswordUser(null)}>
              Cancel
            </Button>
            <Button
              disabled={setUserPassword.isPending || newPassword.length < 8}
              onClick={() => setUserPassword.mutate()}
            >
              Set password
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function FeatureCheckboxes({
  available,
  registry,
  selected,
  onChange,
}: {
  available: string[];
  registry: { key: string; label: string }[];
  selected: string[];
  onChange: (features: string[]) => void;
}) {
  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase text-slate-500">Permissions</p>
      <div className="max-h-44 space-y-1 overflow-y-auto rounded-xl border border-slate-200 p-2">
        {available.map((key) => {
          const checked = selected.includes(key);
          const feature = registry.find((item) => item.key === key);
          return (
            <label key={key} className="flex items-center gap-2 rounded-lg px-2 py-1 text-sm">
              <input
                type="checkbox"
                checked={checked}
                onChange={() =>
                  onChange(checked ? selected.filter((item) => item !== key) : [...selected, key])
                }
              />
              {feature?.label ?? key}
            </label>
          );
        })}
      </div>
    </div>
  );
}
