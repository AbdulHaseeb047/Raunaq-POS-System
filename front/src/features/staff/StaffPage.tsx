import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import type { FeatureKey } from '@pos/shared';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { PageHeader } from '@/components/ui/PageHeader';
import { PageLoader } from '@/components/ui/Spinner';
import { ApiError, api } from '@/lib/api-client';
import { useAuth } from '@/lib/auth';
import type { TenantUser } from '@/types/api';

export function StaffPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [featuresOpen, setFeaturesOpen] = useState<TenantUser | null>(null);
  const [form, setForm] = useState({ email: '', password: '', fullName: '' });
  const [selectedFeatures, setSelectedFeatures] = useState<string[]>([]);
  const [error, setError] = useState('');

  const tenantFeatureKeys = useMemo(() => new Set(user?.features ?? []), [user?.features]);

  const { data: users, isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: () => api.users.list(),
  });

  const { data: registry } = useQuery({
    queryKey: ['features'],
    queryFn: () => api.features.list(),
  });

  const createUser = useMutation({
    mutationFn: () =>
      api.users.create({
        email: form.email,
        password: form.password,
        fullName: form.fullName,
        featureKeys: selectedFeatures,
      }),
    onSuccess: () => {
      setCreateOpen(false);
      setForm({ email: '', password: '', fullName: '' });
      setError('');
      void queryClient.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Failed to create staff'),
  });

  const saveFeatures = useMutation({
    mutationFn: () => api.users.setFeatures(featuresOpen!.id, selectedFeatures),
    onSuccess: () => {
      setFeaturesOpen(null);
      setError('');
      void queryClient.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Failed to save permissions'),
  });

  if (isLoading) return <PageLoader />;

  const staffFeatures = (registry ?? []).filter((f) => tenantFeatureKeys.has(f.key as FeatureKey));

  return (
    <div>
      <PageHeader
        title="Staff"
        subtitle="Manage team members and permissions"
        action={<Button onClick={() => { setCreateOpen(true); setSelectedFeatures([]); setError(''); }}>Add staff</Button>}
      />

      <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-[var(--shadow-card)]">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-surface-muted text-left text-xs font-semibold uppercase text-text-muted">
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Features</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {(users?.data ?? []).map((u) => (
              <tr key={u.id} className="border-b border-border/60 hover:bg-brand-50/20">
                <td className="px-4 py-3 font-medium">{u.fullName}</td>
                <td className="px-4 py-3 text-text-muted">{u.email}</td>
                <td className="px-4 py-3">
                  <Badge variant={u.isActive ? 'success' : 'default'}>
                    {u.isActive ? 'Active' : 'Inactive'}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-text-muted">{u.features.length} enabled</td>
                <td className="px-4 py-3 text-right">
                  {u.role === 'STAFF' && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setFeaturesOpen(u);
                        setSelectedFeatures(u.features);
                      }}
                    >
                      Permissions
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {error && <p className="mb-3 rounded-xl bg-rose-50 px-4 py-3 text-sm text-danger">{error}</p>}

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Add staff member"
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button
              loading={createUser.isPending}
              disabled={!form.fullName || !form.email || form.password.length < 8}
              onClick={() => createUser.mutate()}
            >
              Create
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input label="Full name" value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} />
          <Input label="Email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <Input label="Password" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} hint="Minimum 8 characters" />
          {staffFeatures.length === 0 ? (
            <p className="text-sm text-amber-700">No assignable features on your plan. Upgrade tier or contact support.</p>
          ) : (
            <FeaturePicker features={staffFeatures} selected={selectedFeatures} onChange={setSelectedFeatures} />
          )}
        </div>
      </Modal>

      <Modal
        open={!!featuresOpen}
        onClose={() => setFeaturesOpen(null)}
        title={`Permissions — ${featuresOpen?.fullName}`}
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => setFeaturesOpen(null)}>Cancel</Button>
            <Button loading={saveFeatures.isPending} onClick={() => saveFeatures.mutate()}>Save</Button>
          </>
        }
      >
        <FeaturePicker features={staffFeatures} selected={selectedFeatures} onChange={setSelectedFeatures} />
      </Modal>
    </div>
  );
}

function FeaturePicker({
  features,
  selected,
  onChange,
}: {
  features: Array<{ key: string; label: string; module: string }>;
  selected: string[];
  onChange: (keys: string[]) => void;
}) {
  const byModule = features.reduce<Record<string, typeof features>>((acc, f) => {
    (acc[f.module] ??= []).push(f);
    return acc;
  }, {});

  const toggle = (key: string) => {
    onChange(selected.includes(key) ? selected.filter((k) => k !== key) : [...selected, key]);
  };

  return (
    <div className="max-h-64 space-y-4 overflow-y-auto">
      {Object.entries(byModule).map(([module, items]) => (
        <div key={module}>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">{module}</p>
          <div className="space-y-1">
            {items.map((f) => (
              <label
                key={f.key}
                className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 hover:bg-surface-muted"
              >
                <input
                  type="checkbox"
                  checked={selected.includes(f.key)}
                  onChange={() => toggle(f.key)}
                  className="h-4 w-4 rounded border-border text-brand-600"
                />
                <span className="text-sm">{f.label}</span>
              </label>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
