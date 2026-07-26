import { useState } from 'react';

import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { ApiError } from '@/lib/api-client';
import { useAuth } from '@/lib/auth';

export function ChangePasswordForm({ onDone }: { onDone?: () => void }) {
  const { changePassword, user } = useAuth();
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
      onDone?.();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to change password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-base font-semibold text-text">Change password</h3>
        <p className="mt-1 text-xs text-text-muted">
          Signed in as <span className="font-medium text-text">{user?.email}</span>
        </p>
      </div>

      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-3.5">
        <Input
          label="Current password"
          type="password"
          autoComplete="current-password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          required
        />
        <Input
          label="New password"
          type="password"
          autoComplete="new-password"
          value={next}
          onChange={(e) => setNext(e.target.value)}
          hint="Minimum 8 characters"
          required
        />
        <Input
          label="Confirm new password"
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          required
        />
        {error && <p className="rounded-xl bg-rose-50 px-3 py-2 text-xs text-danger">{error}</p>}
        {success && (
          <p className="rounded-xl bg-emerald-50 px-3 py-2 text-xs text-emerald-800">{success}</p>
        )}
        <Button type="submit" loading={loading}>
          Update password
        </Button>
      </form>
    </div>
  );
}
