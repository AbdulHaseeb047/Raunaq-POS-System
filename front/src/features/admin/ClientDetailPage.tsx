import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { FEATURE_REGISTRY, TENANT_TIERS } from '@pos/shared';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { CollapsibleSection } from '@/components/ui/CollapsibleSection';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { PageHeader } from '@/components/ui/PageHeader';
import { Select } from '@/components/ui/Select';
import { PageLoader } from '@/components/ui/Spinner';
import { FeaturePicker } from '@/features/admin/FeaturePicker';
import {
  accessStatusBadgeVariant,
  accessStatusLabel,
  feeBadgeVariant,
  toDatetimeLocalValue,
} from '@/features/admin/admin-utils';
import { ApiError, api } from '@/lib/api-client';
import type { TenantDetail, TenantUser } from '@/types/api';

const feeStatusOptions = ['TRIAL', 'ACTIVE', 'OVERDUE', 'SUSPENDED'].map((s) => ({
  value: s,
  label: s,
}));

const tierOptions = Object.values(TENANT_TIERS).map((t) => ({ value: t, label: t }));

function accessAccent(status: TenantDetail['accessStatus']): 'default' | 'warning' | 'danger' {
  if (status === 'active' || status === 'expiring_soon') return 'default';
  if (status === 'payment_overdue') return 'warning';
  return 'danger';
}

export function ClientDetailPage() {
  const { tenantId = '' } = useParams();
  const queryClient = useQueryClient();

  const [form, setForm] = useState({
    name: '',
    tier: TENANT_TIERS.STANDARD as string,
    feeStatus: 'TRIAL',
    monthlyFee: '',
    feeDueDate: '',
    subscriptionStartAt: toDatetimeLocalValue(),
    subscriptionDays: '30',
  });
  const [featureKeys, setFeatureKeys] = useState<string[]>([]);
  const [actionError, setActionError] = useState('');

  const [revokeOpen, setRevokeOpen] = useState(false);
  const [revokeReason, setRevokeReason] = useState('');

  const [restoreOpen, setRestoreOpen] = useState(false);
  const [restoreDays, setRestoreDays] = useState('30');

  const [userModal, setUserModal] = useState<{ user: TenantUser; activate: boolean } | null>(null);
  const [deleteUserModal, setDeleteUserModal] = useState<TenantUser | null>(null);
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);

  const [newUser, setNewUser] = useState({
    email: '',
    password: '',
    fullName: '',
    role: 'STAFF',
    featureKeys: [] as string[],
  });

  const { data: tenant, isLoading } = useQuery({
    queryKey: ['tenant', tenantId],
    queryFn: () => api.platform.getTenant(tenantId),
    enabled: Boolean(tenantId),
  });

  const { data: usersData } = useQuery({
    queryKey: ['tenant-users', tenantId],
    queryFn: () => api.platform.listTenantUsers(tenantId),
    enabled: Boolean(tenantId),
  });

  const { data: salesReps } = useQuery({
    queryKey: ['sales-reps'],
    queryFn: () => api.admin.salesReps(),
  });

  useEffect(() => {
    if (!tenant) return;
    setForm({
      name: tenant.name,
      tier: tenant.tier,
      feeStatus: tenant.feeStatus,
      monthlyFee: tenant.monthlyFee ?? '',
      feeDueDate: tenant.feeDueDate ?? '',
      subscriptionStartAt: toDatetimeLocalValue(tenant.subscriptionStartAt),
      subscriptionDays: String(tenant.subscriptionDays ?? 30),
    });
    setFeatureKeys(tenant.features);
    setRestoreDays(String(tenant.subscriptionDays ?? 30));
  }, [tenant]);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['tenant', tenantId] });
    void queryClient.invalidateQueries({ queryKey: ['tenants'] });
    void queryClient.invalidateQueries({ queryKey: ['tenant-users', tenantId] });
  };

  const saveSettings = useMutation({
    mutationFn: () =>
      api.platform.updateTenant(tenantId, {
        name: form.name,
        tier: form.tier,
        feeStatus: form.feeStatus,
        monthlyFee: form.monthlyFee ? Number(form.monthlyFee) : null,
        feeDueDate: form.feeDueDate || null,
        subscriptionStartAt: new Date(form.subscriptionStartAt).toISOString(),
        subscriptionDays: Number(form.subscriptionDays),
      }),
    onSuccess: invalidate,
    onError: (e) => setActionError(e instanceof ApiError ? e.message : 'Save failed'),
  });

  const saveFeatures = useMutation({
    mutationFn: () => api.platform.setTenantFeatures(tenantId, featureKeys),
    onSuccess: invalidate,
    onError: (e) => setActionError(e instanceof ApiError ? e.message : 'Feature update failed'),
  });

  const revokeAccess = useMutation({
    mutationFn: (reason: string) => api.platform.revokeTenantAccess(tenantId, reason),
    onSuccess: () => {
      setRevokeOpen(false);
      setRevokeReason('');
      setActionError('');
      invalidate();
    },
    onError: (e) =>
      setActionError(e instanceof ApiError ? e.message : 'Could not revoke access. Restart the API server if this persists.'),
  });

  const restoreAccess = useMutation({
    mutationFn: () =>
      api.platform.restoreTenantAccess(tenantId, {
        subscriptionDays: Number(restoreDays) || 30,
        feeStatus: 'ACTIVE',
      }),
    onSuccess: () => {
      setRestoreOpen(false);
      setActionError('');
      invalidate();
    },
    onError: (e) => setActionError(e instanceof ApiError ? e.message : 'Restore failed'),
  });

  const createUser = useMutation({
    mutationFn: () =>
      api.platform.createTenantUser(tenantId, {
        ...newUser,
        featureKeys: newUser.role === 'STAFF' ? newUser.featureKeys : undefined,
      }),
    onSuccess: () => {
      setNewUser({ email: '', password: '', fullName: '', role: 'STAFF', featureKeys: [] });
      invalidate();
    },
    onError: (e) => setActionError(e instanceof ApiError ? e.message : 'Create user failed'),
  });

  const toggleUser = useMutation({
    mutationFn: ({ userId, isActive }: { userId: string; isActive: boolean }) =>
      api.platform.updateTenantUser(tenantId, userId, { isActive }),
    onSuccess: () => {
      setUserModal(null);
      invalidate();
    },
    onError: (e) => setActionError(e instanceof ApiError ? e.message : 'User update failed'),
  });

  const deleteUser = useMutation({
    mutationFn: (userId: string) => api.platform.deleteTenantUser(tenantId, userId),
    onSuccess: () => {
      setDeleteUserModal(null);
      setExpandedUserId(null);
      invalidate();
    },
    onError: (e) => setActionError(e instanceof ApiError ? e.message : 'Delete user failed'),
  });

  const assignSalesRep = useMutation({
    mutationFn: (acquiredById: string | null) =>
      api.platform.updateTenant(tenantId, { acquiredById: acquiredById || null }),
    onSuccess: invalidate,
  });

  const portalOpen = tenant?.isActive && tenant.accessStatus !== 'revoked' && tenant.accessStatus !== 'expired';

  if (isLoading || !tenant) return <PageLoader />;

  const accessSummary = `${accessStatusLabel(tenant.accessStatus)}${
    tenant.daysRemaining != null && portalOpen ? ` · ${tenant.daysRemaining} day(s) left` : ''
  }`;

  return (
    <div className="space-y-6">
      <PageHeader
        title={tenant.name}
        subtitle={`/${tenant.slug} · ${tenant.tier}`}
        action={
          <Link to="/admin/clients" className="text-sm font-medium text-brand-700 hover:underline">
            ← All clients
          </Link>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={accessStatusBadgeVariant(tenant.accessStatus)}>
          {accessStatusLabel(tenant.accessStatus)}
        </Badge>
        <Badge variant={feeBadgeVariant(tenant.feeStatus)}>{tenant.feeStatus}</Badge>
        {tenant.daysRemaining != null && portalOpen && (
          <span className="text-sm text-text-muted">{tenant.daysRemaining} day(s) remaining</span>
        )}
      </div>

      {actionError && (
        <div className="rounded-xl border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger">
          {actionError}
          <button type="button" className="ml-2 underline" onClick={() => setActionError('')}>
            Dismiss
          </button>
        </div>
      )}

      <CollapsibleSection
        title="Portal access"
        summary={accessSummary}
        defaultOpen={!portalOpen}
        accent={accessAccent(tenant.accessStatus)}
      >
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <p className="text-xs text-text-muted">Subscription start</p>
              <p className="text-sm font-medium">
                {tenant.subscriptionStartAt
                  ? new Date(tenant.subscriptionStartAt).toLocaleString()
                  : '—'}
              </p>
            </div>
            <div>
              <p className="text-xs text-text-muted">Subscription ends</p>
              <p className="text-sm font-medium">
                {tenant.subscriptionEndsAt
                  ? new Date(tenant.subscriptionEndsAt).toLocaleString()
                  : '—'}
              </p>
            </div>
            <div>
              <p className="text-xs text-text-muted">Period</p>
              <p className="text-sm font-medium">{tenant.subscriptionDays} days</p>
            </div>
            <div>
              <p className="text-xs text-text-muted">Portal login</p>
              <p className="text-sm font-medium">{portalOpen ? 'Allowed' : 'Blocked'}</p>
            </div>
          </div>

          {tenant.accessRevokeReason && (
            <p className="rounded-lg bg-surface-muted px-3 py-2 text-sm text-text-muted">
              <span className="font-medium text-text">Reason: </span>
              {tenant.accessRevokeReason}
            </p>
          )}

          <p className="text-xs text-text-muted">
            Revoking ends all shop logins immediately and invalidates active sessions. After 30 days,
            access auto-expires unless you restore it.
          </p>

          <div className="flex flex-wrap gap-2">
            {portalOpen ? (
              <Button variant="danger" onClick={() => setRevokeOpen(true)}>
                Revoke portal access
              </Button>
            ) : (
              <Button variant="accent" onClick={() => setRestoreOpen(true)}>
                Restore access & renew subscription
              </Button>
            )}
          </div>
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Shop settings" summary={`${form.name} · ${form.tier}`} defaultOpen={false}>
        <div className="grid gap-4 md:grid-cols-2">
          <Input label="Shop name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <Select
            label="Tier"
            value={form.tier}
            onChange={(e) => setForm({ ...form, tier: e.target.value })}
            options={tierOptions}
          />
          <Select
            label="Fee status"
            value={form.feeStatus}
            onChange={(e) => setForm({ ...form, feeStatus: e.target.value })}
            options={feeStatusOptions}
          />
          <Input
            label="Monthly fee (Rs)"
            type="number"
            min={0}
            value={form.monthlyFee}
            onChange={(e) => setForm({ ...form, monthlyFee: e.target.value })}
          />
          <Input
            label="Fee due date"
            type="date"
            value={form.feeDueDate}
            onChange={(e) => setForm({ ...form, feeDueDate: e.target.value })}
          />
          <Input
            label="Subscription start"
            type="datetime-local"
            value={form.subscriptionStartAt}
            onChange={(e) => setForm({ ...form, subscriptionStartAt: e.target.value })}
          />
          <Input
            label="Subscription days"
            type="number"
            min={1}
            max={365}
            value={form.subscriptionDays}
            onChange={(e) => setForm({ ...form, subscriptionDays: e.target.value })}
          />
          <Select
            label="Sales rep"
            value={tenant.acquiredBy?.id ?? ''}
            onChange={(e) => assignSalesRep.mutate(e.target.value || null)}
            options={[
              { value: '', label: '— None —' },
              ...(salesReps ?? []).map((r) => ({ value: r.id, label: r.fullName })),
            ]}
          />
        </div>
        <div className="mt-4">
          <Button loading={saveSettings.isPending} onClick={() => saveSettings.mutate()}>
            Save settings
          </Button>
        </div>
      </CollapsibleSection>

      <CollapsibleSection
        title="POS features"
        summary={`${featureKeys.length} of ${FEATURE_REGISTRY.length} enabled`}
        defaultOpen={false}
      >
        <FeaturePicker
          features={FEATURE_REGISTRY}
          selected={featureKeys}
          onChange={setFeatureKeys}
          minFeatures={1}
        />
        <div className="mt-4">
          <Button loading={saveFeatures.isPending} onClick={() => saveFeatures.mutate()}>
            Save features
          </Button>
        </div>
      </CollapsibleSection>

      <CollapsibleSection
        title="Users"
        summary={`${usersData?.data.length ?? 0} account(s)`}
        defaultOpen={true}
      >
        <div className="space-y-2">
          {(usersData?.data ?? []).length === 0 && (
            <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-text-muted">
              No users yet. Add the first account below.
            </p>
          )}
          {(usersData?.data ?? []).map((u) => {
            const expanded = expandedUserId === u.id;
            return (
              <div
                key={u.id}
                className="overflow-hidden rounded-xl border border-border bg-white"
              >
                <button
                  type="button"
                  className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-surface-muted/50"
                  onClick={() => setExpandedUserId(expanded ? null : u.id)}
                >
                  <span className="text-text-muted">{expanded ? '▾' : '▸'}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-text">{u.fullName}</span>
                      <Badge variant={u.isActive ? 'success' : 'danger'}>
                        {u.isActive ? 'Active' : 'Deactivated'}
                      </Badge>
                      <span className="text-xs text-text-muted">{u.role}</span>
                    </div>
                    <p className="truncate text-xs text-text-muted">{u.email}</p>
                  </div>
                  <div className="flex shrink-0 gap-1" onClick={(e) => e.stopPropagation()}>
                    {u.isActive ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-amber-700 hover:bg-amber-50"
                        onClick={() => setUserModal({ user: u, activate: false })}
                      >
                        Deactivate
                      </Button>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-brand-700"
                        onClick={() => setUserModal({ user: u, activate: true })}
                      >
                        Restore
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-danger hover:bg-rose-50"
                      onClick={() => setDeleteUserModal(u)}
                    >
                      Delete
                    </Button>
                  </div>
                </button>
                {expanded && (
                  <div className="border-t border-border bg-surface-muted/30 px-4 py-3 text-sm">
                    <div className="grid gap-2 sm:grid-cols-2">
                      <div>
                        <p className="text-xs text-text-muted">Last login</p>
                        <p>{u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString() : 'Never'}</p>
                      </div>
                      <div>
                        <p className="text-xs text-text-muted">Created</p>
                        <p>{new Date(u.createdAt).toLocaleDateString()}</p>
                      </div>
                    </div>
                    {u.role === 'STAFF' && (
                      <div className="mt-3">
                        <p className="text-xs font-medium text-text-muted">Enabled features</p>
                        {u.features.length === 0 ? (
                          <p className="mt-1 text-xs text-text-muted">No features assigned</p>
                        ) : (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {u.features.map((key) => {
                              const def = FEATURE_REGISTRY.find((f) => f.key === key);
                              return (
                                <Badge key={key} variant="default">
                                  {def?.label ?? key}
                                </Badge>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}
                    {u.role === 'CLIENT_ADMIN' && (
                      <p className="mt-3 text-xs text-text-muted">
                        Client admins inherit all features enabled for this shop.
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="mt-4 rounded-xl border border-dashed border-border bg-surface-muted/40 p-4">
          <p className="mb-3 text-sm font-semibold text-text">Add user</p>
          <div className="grid gap-3 md:grid-cols-2">
            <Input
              label="Full name"
              value={newUser.fullName}
              onChange={(e) => setNewUser({ ...newUser, fullName: e.target.value })}
            />
            <Input
              label="Email"
              type="email"
              value={newUser.email}
              onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
            />
            <Input
              label="Password (min 8 characters)"
              type="password"
              value={newUser.password}
              onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
            />
            <Select
              label="Role"
              value={newUser.role}
              onChange={(e) => setNewUser({ ...newUser, role: e.target.value, featureKeys: [] })}
              options={[
                { value: 'STAFF', label: 'Staff' },
                { value: 'CLIENT_ADMIN', label: 'Client Admin' },
              ]}
            />
          </div>
          {newUser.role === 'STAFF' && tenant.features.length > 0 && (
            <div className="mt-3">
              <p className="mb-2 text-xs font-medium text-text-muted">Staff features (from tenant plan)</p>
              <div className="flex flex-wrap gap-2">
                {tenant.features.map((key) => {
                  const def = FEATURE_REGISTRY.find((f) => f.key === key);
                  const checked = newUser.featureKeys.includes(key);
                  return (
                    <label
                      key={key}
                      className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-border bg-surface px-2 py-1 text-xs"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() =>
                          setNewUser({
                            ...newUser,
                            featureKeys: checked
                              ? newUser.featureKeys.filter((k) => k !== key)
                              : [...newUser.featureKeys, key],
                          })
                        }
                      />
                      {def?.label ?? key}
                    </label>
                  );
                })}
              </div>
            </div>
          )}
          <Button
            className="mt-3"
            loading={createUser.isPending}
            onClick={() => {
              if (newUser.password.length < 8) {
                setActionError('Password must be at least 8 characters');
                return;
              }
              if (!newUser.fullName.trim() || !newUser.email.trim()) {
                setActionError('Name and email are required');
                return;
              }
              setActionError('');
              createUser.mutate();
            }}
          >
            Create user
          </Button>
        </div>
      </CollapsibleSection>

      <Modal
        open={revokeOpen}
        onClose={() => setRevokeOpen(false)}
        title="Revoke portal access"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setRevokeOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              loading={revokeAccess.isPending}
              onClick={() =>
                revokeAccess.mutate(revokeReason.trim() || 'Access revoked by platform administrator')
              }
            >
              Revoke access
            </Button>
          </>
        }
      >
        <p className="mb-3 text-sm text-text-muted">
          All users at <strong className="text-text">{tenant.name}</strong> will be logged out and
          unable to sign in until you restore access.
        </p>
        <label className="block space-y-1">
          <span className="text-xs font-medium text-text">Reason (optional)</span>
          <textarea
            className="w-full rounded-xl border border-border bg-white px-3 py-2 text-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
            rows={3}
            placeholder="e.g. Payment not received"
            value={revokeReason}
            onChange={(e) => setRevokeReason(e.target.value)}
          />
        </label>
      </Modal>

      <Modal
        open={restoreOpen}
        onClose={() => setRestoreOpen(false)}
        title="Restore portal access"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setRestoreOpen(false)}>
              Cancel
            </Button>
            <Button variant="accent" loading={restoreAccess.isPending} onClick={() => restoreAccess.mutate()}>
              Restore access
            </Button>
          </>
        }
      >
        <p className="mb-3 text-sm text-text-muted">
          Reactivates the shop portal and starts a new subscription period from today.
        </p>
        <Input
          label="Subscription days"
          type="number"
          min={1}
          max={365}
          value={restoreDays}
          onChange={(e) => setRestoreDays(e.target.value)}
        />
      </Modal>

      <Modal
        open={userModal != null}
        onClose={() => setUserModal(null)}
        title={userModal?.activate ? 'Restore user access' : 'Deactivate user'}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setUserModal(null)}>
              Cancel
            </Button>
            <Button
              variant={userModal?.activate ? 'primary' : 'danger'}
              loading={toggleUser.isPending}
              onClick={() => {
                if (!userModal) return;
                toggleUser.mutate({ userId: userModal.user.id, isActive: userModal.activate });
              }}
            >
              {userModal?.activate ? 'Restore user' : 'Deactivate user'}
            </Button>
          </>
        }
      >
        {userModal && (
          <p className="text-sm text-text-muted">
            {userModal.activate ? (
              <>
                Allow <strong className="text-text">{userModal.user.fullName}</strong> (
                {userModal.user.email}) to sign in again?
              </>
            ) : (
              <>
                Deactivate <strong className="text-text">{userModal.user.fullName}</strong> (
                {userModal.user.email})? They will be logged out immediately and cannot sign in until
                restored.
              </>
            )}
          </p>
        )}
      </Modal>

      <ConfirmDialog
        open={deleteUserModal != null}
        onClose={() => setDeleteUserModal(null)}
        onConfirm={() => {
          if (deleteUserModal) deleteUser.mutate(deleteUserModal.id);
        }}
        title="Delete user permanently"
        message={
          deleteUserModal ? (
            <>
              Permanently remove <strong className="text-text">{deleteUserModal.fullName}</strong> (
              {deleteUserModal.email})? This cannot be undone. They will lose all access immediately.
            </>
          ) : null
        }
        confirmLabel="Delete user"
        loading={deleteUser.isPending}
      />
    </div>
  );
}
