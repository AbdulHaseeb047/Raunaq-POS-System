import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { ApiError, api } from '@/lib/api-client';
import { useAuth } from '@/lib/auth';
import { getHomePath } from '@/lib/features';

export function ChangePasswordPage() {
  const { changePassword, logout } = useAuth();
  const navigate = useNavigate();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
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
    setLoading(true);
    try {
      await changePassword(current, next);
      const me = await api.auth.me();
      navigate(getHomePath(me));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to change password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-muted p-6">
      <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-8 shadow-[var(--shadow-card-hover)]">
        <h1 className="text-xl font-bold text-text">Change your password</h1>
        <p className="mt-1 text-sm text-text-muted">You must set a new password before continuing.</p>

        <form onSubmit={(e) => void handleSubmit(e)} className="mt-6 space-y-4">
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
          {error && (
            <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-danger">{error}</p>
          )}
          <Button type="submit" className="w-full" loading={loading}>
            Update password
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="w-full"
            onClick={() => void logout().then(() => navigate('/login'))}
          >
            Sign out
          </Button>
        </form>
      </div>
    </div>
  );
}
