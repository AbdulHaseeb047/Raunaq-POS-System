import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { PageHeader } from '@/components/ui/PageHeader';
import { ApiError } from '@/lib/api-client';
import { useAuth } from '@/lib/auth';

export function AccountPasswordPage() {
  const { changePassword } = useAuth();
  const navigate = useNavigate();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (next !== confirm) {
      setError('Passwords do not match');
      return;
    }
    if (next.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    setError('');
    setSuccess('');
    setLoading(true);
    try {
      await changePassword(current, next);
      setSuccess('Password updated successfully.');
      setCurrent('');
      setNext('');
      setConfirm('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to change password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-lg">
      <PageHeader title="Change password" subtitle="Update your account login password" />
      <Card className="mb-4 border-brand-200 bg-brand-50/50">
        <p className="text-sm text-brand-900">
          Passwords are stored <strong>hashed in PostgreSQL</strong>, not in app code. After you save a new
          password, the old one (including any seed/demo password) will no longer work.
        </p>
      </Card>
      <Card>
        <CardHeader title="Account security" subtitle="Use at least 8 characters" />
        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
          <Input
            label="Current password"
            type="password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            required
          />
          <Input
            label="New password"
            type="password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            hint="Minimum 8 characters"
            required
          />
          <Input
            label="Confirm new password"
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
          />
          {error && <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-danger">{error}</p>}
          {success && <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{success}</p>}
          <div className="flex gap-2">
            <Button type="submit" loading={loading}>
              Update password
            </Button>
            <Button type="button" variant="ghost" onClick={() => navigate(-1)}>
              Back
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
