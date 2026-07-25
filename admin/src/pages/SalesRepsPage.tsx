import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { Badge, Button, Card, Input, Modal, PageLoader } from '@/components/ui';
import { ApiError, api } from '@/lib/api';

export function SalesRepsPage() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ email: '', password: '', fullName: '' });
  const [error, setError] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['sales-reps'],
    queryFn: () => api.admin.salesReps(),
  });

  const createRep = useMutation({
    mutationFn: () => api.admin.createSalesRep(form),
    onSuccess: () => {
      setOpen(false);
      setForm({ email: '', password: '', fullName: '' });
      setError('');
      void queryClient.invalidateQueries({ queryKey: ['sales-reps'] });
      void queryClient.invalidateQueries({ queryKey: ['admin-dashboard'] });
    },
    onError: (err) =>
      setError(err instanceof ApiError ? err.message : 'Failed to create sales rep'),
  });

  if (isLoading) return <PageLoader />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Sales Representatives</h1>
          <p className="text-slate-500">Track which rep brought each client</p>
        </div>
        <Button
          onClick={() => {
            setOpen(true);
            setError('');
          }}
        >
          + Add sales rep
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {(data ?? []).map((r) => (
          <Card key={r.id}>
            <div className="flex items-start justify-between">
              <div>
                <p className="font-semibold">{r.fullName}</p>
                <p className="text-sm text-slate-500">{r.email}</p>
              </div>
              <Badge tone={r.isActive ? 'success' : 'danger'}>
                {r.isActive ? 'Active' : 'Inactive'}
              </Badge>
            </div>
            <p className="mt-4 text-2xl font-bold text-indigo-600">{r.clientCount}</p>
            <p className="text-xs text-slate-500">clients acquired</p>
          </Card>
        ))}
      </div>

      <Modal open={open} title="New sales representative" onClose={() => setOpen(false)}>
        <div className="space-y-3">
          <Input
            placeholder="Full name"
            value={form.fullName}
            onChange={(e) => setForm({ ...form, fullName: e.target.value })}
          />
          <Input
            type="email"
            placeholder="Email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
          <Input
            type="password"
            placeholder="Temporary password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
          />
          {error && <p className="text-sm text-rose-600">{error}</p>}
          <Button
            disabled={createRep.isPending}
            onClick={() => {
              if (form.password.length < 8) {
                setError('Password must be at least 8 characters');
                return;
              }
              createRep.mutate();
            }}
          >
            Create
          </Button>
        </div>
      </Modal>
    </div>
  );
}
