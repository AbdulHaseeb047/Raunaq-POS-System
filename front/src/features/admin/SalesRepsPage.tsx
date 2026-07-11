import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { PageLoader } from '@/components/ui/Spinner';
import { ApiError, api } from '@/lib/api-client';

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
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Failed to create sales rep'),
  });

  if (isLoading) return <PageLoader />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text">Sales Representatives</h1>
          <p className="text-text-muted">Track which rep brought each client</p>
        </div>
        <Button onClick={() => { setOpen(true); setError(''); }}>+ Add sales rep</Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {(data ?? []).map((r) => (
          <Card key={r.id} padding="lg">
            <div className="flex items-start justify-between">
              <div>
                <p className="font-semibold">{r.fullName}</p>
                <p className="text-sm text-text-muted">{r.email}</p>
              </div>
              <Badge variant={r.isActive ? 'success' : 'danger'}>{r.isActive ? 'Active' : 'Inactive'}</Badge>
            </div>
            <p className="mt-4 text-2xl font-bold text-brand-700">{r.clientCount}</p>
            <p className="text-xs text-text-muted">clients acquired</p>
          </Card>
        ))}
      </div>

      <Modal open={open} title="New sales representative" onClose={() => setOpen(false)}>
        <div className="space-y-3">
          <Input placeholder="Full name" value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} />
          <Input type="email" placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <Input type="password" placeholder="Temporary password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          {error && <p className="text-sm text-danger">{error}</p>}
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
