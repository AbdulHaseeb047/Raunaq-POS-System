import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { Button, Input } from '@/components/ui';
import { ApiError, api, setTokens } from '@/lib/api';
import { useAuth } from '@/lib/auth';

export function ChangePasswordPage() {
  const { user, refreshUser } = useAuth();
  const navigate = useNavigate();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    if (next.length < 8) {
      setError('New password must be at least 8 characters');
      return;
    }
    if (next !== confirm) {
      setError('Passwords do not match');
      return;
    }
    setLoading(true);
    try {
      const res = await api.auth.changePassword(current, next);
      setTokens(res.accessToken, res.refreshToken);
      await refreshUser();
      setSuccess('Password updated successfully');
      setCurrent('');
      setNext('');
      setConfirm('');
      if (user?.mustChangePassword) {
        setTimeout(() => navigate('/', { replace: true }), 800);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to change password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-lg">
      <h1 className="text-2xl font-bold text-slate-900">Change password</h1>
      {user?.mustChangePassword && (
        <p className="mt-2 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
          You must change your password before continuing.
        </p>
      )}
      <form
        onSubmit={(e) => void submit(e)}
        className="mt-6 space-y-4 rounded-2xl border border-slate-200 bg-white p-6"
      >
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Current password</label>
          <Input
            type="password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            required
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">New password</label>
          <Input type="password" value={next} onChange={(e) => setNext(e.target.value)} required />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">
            Confirm new password
          </label>
          <Input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
          />
        </div>
        {error && <p className="text-sm text-rose-600">{error}</p>}
        {success && <p className="text-sm text-emerald-600">{success}</p>}
        <Button type="submit" disabled={loading}>
          {loading ? 'Saving…' : 'Update password'}
        </Button>
      </form>
    </div>
  );
}
