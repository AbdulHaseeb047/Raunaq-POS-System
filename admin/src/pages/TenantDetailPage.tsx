import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { TENANT_TIERS } from '@pos/shared';

import { Badge, Button, Card, Input, Modal, PageLoader, Select } from '@/components/ui';
import { ApiError, api } from '@/lib/api';

export function TenantDetailPage() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const queryClient = useQueryClient();
  const [userOpen, setUserOpen] = useState(false);
  const [userForm, setUserForm] = useState({ email: '', password: '', fullName: '' });
  const [selectedFeatures, setSelectedFeatures] = useState<string[]>([]);
  const [error, setError] = useState('');

  const { data: tenant, isLoading } = useQuery({
    queryKey: ['tenant', tenantId],
    queryFn: () => api.tenants.get(tenantId!),
    enabled: !!tenantId,
  });

  const { data: registry } = useQuery({ queryKey: ['features'], queryFn: () => api.features.list() });
  const { data: salesReps } = useQuery({ queryKey: ['sales-reps'], queryFn: () => api.admin.salesReps() });
  const { data: users } = useQuery({
    queryKey: ['tenant-users', tenantId],
    queryFn: () => api.tenants.users(tenantId!),
    enabled: !!tenantId,
  });

  const tenantFeatureSet = useMemo(() => new Set(tenant?.features ?? []), [tenant?.features]);

  const [edit, setEdit] = useState({
    name: '',
    tier: '',
    isActive: true,
    feeStatus: 'TRIAL',
    monthlyFee: '',
    feeDueDate: '',
    acquiredById: '',
  });

  const syncEdit = () => {
    if (!tenant) return;
    setEdit({
      name: tenant.name,
      tier: tenant.tier,
      isActive: tenant.isActive,
      feeStatus: tenant.feeStatus,
      monthlyFee: tenant.monthlyFee ?? '',
      feeDueDate: tenant.feeDueDate ?? '',
      acquiredById: tenant.acquiredBy?.id ?? '',
    });
  };

  const updateTenant = useMutation({
    mutationFn: () =>
      api.tenants.update(tenantId!, {
        name: edit.name,
        tier: edit.tier,
        isActive: edit.isActive,
        feeStatus: edit.feeStatus,
        monthlyFee: edit.monthlyFee ? Number(edit.monthlyFee) : null,
        feeDueDate: edit.feeDueDate || null,
        acquiredById: edit.acquiredById || null,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['tenant', tenantId] });
      void queryClient.invalidateQueries({ queryKey: ['tenants'] });
      setError('');
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Update failed'),
  });

  const saveFeatures = useMutation({
    mutationFn: (keys: string[]) => api.tenants.setFeatures(tenantId!, keys),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['tenant', tenantId] }),
  });

  const createUser = useMutation({
    mutationFn: () =>
      api.tenants.createUser(tenantId!, {
        email: userForm.email,
        password: userForm.password,
        fullName: userForm.fullName,
        featureKeys: selectedFeatures,
      }),
    onSuccess: () => {
      setUserOpen(false);
      setUserForm({ email: '', password: '', fullName: '' });
      setSelectedFeatures([]);
      void queryClient.invalidateQueries({ queryKey: ['tenant-users', tenantId] });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Failed to create user'),
  });

  if (isLoading || !tenant) return <PageLoader />;

  const groupedFeatures = (registry ?? []).reduce<Record<string, NonNullable<typeof registry>>>((acc, f) => {
    (acc[f.module] ??= []).push(f);
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <div>
        <Link to="/clients" className="text-sm text-indigo-600 hover:underline">← Back to clients</Link>
        <h1 className="mt-2 text-2xl font-bold">{tenant.name}</h1>
        <p className="text-slate-500">{tenant.slug} · {tenant.tier}</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Client settings">
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium">Name</label>
              <Input value={edit.name || tenant.name} onChange={(e) => { syncEdit(); setEdit((x) => ({ ...x, name: e.target.value })); }} onFocus={syncEdit} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium">Tier</label>
                <Select value={edit.tier || tenant.tier} onChange={(e) => { syncEdit(); setEdit((x) => ({ ...x, tier: e.target.value })); }} onFocus={syncEdit}>
                  {Object.values(TENANT_TIERS).map((t) => <option key={t} value={t}>{t}</option>)}
                </Select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium">Account status</label>
                <Select value={edit.isActive ? 'active' : 'inactive'} onChange={(e) => { syncEdit(); setEdit((x) => ({ ...x, isActive: e.target.value === 'active' })); }} onFocus={syncEdit}>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium">Fee status</label>
                <Select value={edit.feeStatus || tenant.feeStatus} onChange={(e) => { syncEdit(); setEdit((x) => ({ ...x, feeStatus: e.target.value })); }} onFocus={syncEdit}>
                  {['TRIAL', 'ACTIVE', 'OVERDUE', 'SUSPENDED'].map((s) => <option key={s} value={s}>{s}</option>)}
                </Select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium">Monthly fee</label>
                <Input type="number" value={edit.monthlyFee} onFocus={syncEdit} onChange={(e) => { syncEdit(); setEdit((x) => ({ ...x, monthlyFee: e.target.value })); }} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium">Fee due date</label>
                <Input type="date" value={edit.feeDueDate} onFocus={syncEdit} onChange={(e) => { syncEdit(); setEdit((x) => ({ ...x, feeDueDate: e.target.value })); }} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium">Sales rep</label>
                <Select value={edit.acquiredById} onFocus={syncEdit} onChange={(e) => { syncEdit(); setEdit((x) => ({ ...x, acquiredById: e.target.value })); }}>
                  <option value="">None</option>
                  {(salesReps ?? []).map((r) => <option key={r.id} value={r.id}>{r.fullName}</option>)}
                </Select>
              </div>
            </div>
            {error && <p className="text-sm text-rose-600">{error}</p>}
            <Button onClick={() => updateTenant.mutate()} disabled={updateTenant.isPending}>Save changes</Button>
          </div>
        </Card>

        <Card title="Enabled features" action={<Badge>{tenant.features.length} active</Badge>}>
          <div className="max-h-96 space-y-4 overflow-y-auto">
            {Object.entries(groupedFeatures).map(([module, items]) => (
              <div key={module}>
                <p className="mb-2 text-xs font-semibold uppercase text-slate-500">{module}</p>
                <div className="space-y-1">
                  {items!.map((f) => {
                    const on = tenantFeatureSet.has(f.key);
                    return (
                      <label key={f.key} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-slate-50">
                        <input
                          type="checkbox"
                          checked={on}
                          onChange={() => {
                            const next = on
                              ? tenant.features.filter((k) => k !== f.key)
                              : [...tenant.features, f.key];
                            saveFeatures.mutate(next);
                          }}
                        />
                        <span className="text-sm">{f.label}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card
        title="Users"
        action={<Button onClick={() => { setUserOpen(true); setError(''); }}>Add user</Button>}
      >
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs uppercase text-slate-500">
              <th className="pb-2">Name</th>
              <th className="pb-2">Email</th>
              <th className="pb-2">Role</th>
              <th className="pb-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {(users?.data ?? tenant.users ?? []).map((u) => (
              <tr key={u.id} className="border-b border-slate-50">
                <td className="py-2 font-medium">{u.fullName}</td>
                <td className="py-2">{u.email}</td>
                <td className="py-2">{u.role}</td>
                <td className="py-2"><Badge tone={u.isActive ? 'success' : 'danger'}>{u.isActive ? 'Active' : 'Inactive'}</Badge></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Modal open={userOpen} title="Add client user" onClose={() => setUserOpen(false)}>
        <div className="space-y-3">
          <Input placeholder="Full name" value={userForm.fullName} onChange={(e) => setUserForm({ ...userForm, fullName: e.target.value })} />
          <Input type="email" placeholder="Email" value={userForm.email} onChange={(e) => setUserForm({ ...userForm, email: e.target.value })} />
          <Input type="password" placeholder="Password (min 8)" value={userForm.password} onChange={(e) => setUserForm({ ...userForm, password: e.target.value })} />
          <p className="text-xs font-semibold uppercase text-slate-500">Permissions</p>
          <div className="max-h-40 space-y-1 overflow-y-auto">
            {(registry ?? []).filter((f) => tenantFeatureSet.has(f.key)).map((f) => (
              <label key={f.key} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={selectedFeatures.includes(f.key)}
                  onChange={(e) =>
                    setSelectedFeatures((prev) =>
                      e.target.checked ? [...prev, f.key] : prev.filter((k) => k !== f.key),
                    )
                  }
                />
                {f.label}
              </label>
            ))}
          </div>
          {error && <p className="text-sm text-rose-600">{error}</p>}
          <Button
            onClick={() => {
              if (userForm.password.length < 8) {
                setError('Password must be at least 8 characters');
                return;
              }
              createUser.mutate();
            }}
            disabled={createUser.isPending}
          >
            Create user
          </Button>
        </div>
      </Modal>
    </div>
  );
}
