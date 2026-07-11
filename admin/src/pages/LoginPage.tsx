import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { BRAND } from '@pos/shared';

import { Button, Input } from '@/components/ui';
import { RaunaqLogoFull } from '@/components/RaunaqLogo';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';

export function LoginPage() {
  const { login, user } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState(import.meta.env.PROD ? '' : 'superadmin@nexmind.com');
  const [password, setPassword] = useState(import.meta.env.PROD ? '' : 'SuperAdmin123!');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (user) {
    return <Navigate to={user.mustChangePassword ? '/account/password' : '/'} replace />;
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      navigate('/');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-indigo-950 via-slate-900 to-slate-950 p-4">
      <div className="w-full max-w-md rounded-3xl border border-white/10 bg-white p-8 shadow-2xl">
        <RaunaqLogoFull tone="light" />
        <p className="mt-4 text-center text-xs font-semibold uppercase tracking-widest text-indigo-600">
          Platform Admin
        </p>
        <h1 className="mt-2 text-center text-xl font-bold text-slate-900">Super Admin Login</h1>
        <p className="mt-2 text-sm text-slate-500">
          Manage clients, fees, features, and sales team. Change the default password after first login.
        </p>
        <form onSubmit={(e) => void submit(e)} className="mt-8 space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Email</label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Password</label>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
          <Button type="submit" disabled={loading} className="w-full">
            {loading ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>
        {!import.meta.env.PROD && (
          <p className="mt-6 rounded-xl bg-slate-50 p-3 text-xs text-slate-500">
            Dev login: <strong>superadmin@nexmind.com</strong> / <strong>SuperAdmin123!</strong>
          </p>
        )}
        <p className="mt-4 text-center text-xs text-slate-400">
          Shop POS login is at{' '}
          <a href={import.meta.env.VITE_POS_URL ?? 'http://localhost:5173'} className="text-indigo-600 hover:underline">
            {BRAND.name} POS
          </a>
        </p>
      </div>
    </div>
  );
}
