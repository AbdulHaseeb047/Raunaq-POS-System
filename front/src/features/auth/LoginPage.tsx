import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BRAND } from '@pos/shared';

import { RaunaqLogo } from '@/components/brand/RaunaqLogo';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { ApiError } from '@/lib/api-client';
import { useAuth } from '@/lib/auth';
import { getHomePath } from '@/lib/features';
import {
  SUPPORT_EMAIL,
  SUPPORT_WHATSAPP_DISPLAY,
  supportWhatsappUrl,
} from '@/lib/support';

type AccessGate =
  | { kind: 'subscription' }
  | { kind: 'trial' }
  | { kind: 'revoked'; message: string }
  | null;

const PAYMENT_CODES = new Set(['TENANT_SUBSCRIPTION_EXPIRED', 'TENANT_TRIAL_EXPIRED']);

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [accessGate, setAccessGate] = useState<AccessGate>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setAccessGate(null);
    setLoading(true);
    try {
      const user = await login(email, password);
      navigate(getHomePath(user));
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === 'TENANT_SUBSCRIPTION_EXPIRED') {
          setAccessGate({ kind: 'subscription' });
          return;
        }
        if (err.code === 'TENANT_TRIAL_EXPIRED') {
          setAccessGate({ kind: 'trial' });
          return;
        }
        if (err.code === 'TENANT_ACCESS_REVOKED') {
          setAccessGate({ kind: 'revoked', message: err.message });
          return;
        }
        if (PAYMENT_CODES.has(err.code ?? '')) {
          setAccessGate({ kind: 'subscription' });
          return;
        }
      }

      let message =
        err instanceof ApiError ? err.message : err instanceof Error ? err.message : 'Login failed';
      if (
        message === 'Failed to fetch' ||
        message.includes('NetworkError') ||
        message.includes('ECONNREFUSED')
      ) {
        message =
          'Cannot reach the API server. Start the project with `npm run dev:all` and wait until the backend is listening on port 3001.';
      }
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const payWhatsApp = supportWhatsappUrl(
    accessGate?.kind === 'trial'
      ? `Hi, my Raunaq POS trial has ended. I'd like to convert to a paid plan.\nEmail: ${email || '(add login email)'}`
      : `Hi, my Raunaq POS subscription has ended. I'd like to pay and continue using the product.\nEmail: ${email || '(add login email)'}`,
  );

  return (
    <div className="flex min-h-screen">
      <div className="hidden flex-1 flex-col justify-between bg-gradient-to-br from-sidebar via-brand-800 to-brand-900 p-12 text-white lg:flex">
        <div>
          <RaunaqLogo variant="full" tone="dark" />
          <p className="mt-8 max-w-md text-lg text-brand-100/90">
            Fast billing, inventory, and udhaar management built for Pakistani shops.
          </p>
          <p className="mt-4 max-w-md text-sm text-brand-200/80">
            One login for shop owners and platform admins — you are routed to the right dashboard
            automatically.
          </p>
        </div>
        <div className="grid grid-cols-3 gap-4 text-sm">
          {['Quick sales', 'Udhaar ledger', 'Stock alerts'].map((f) => (
            <div key={f} className="rounded-xl bg-white/10 px-4 py-3 backdrop-blur-sm">
              {f}
            </div>
          ))}
        </div>
        <p className="text-xs text-brand-200/60">{BRAND.productName}</p>
      </div>

      <div className="flex flex-1 items-center justify-center p-6">
        <div className="w-full max-w-md">
          <div className="mb-8 flex flex-col items-center lg:hidden">
            <RaunaqLogo variant="full" tone="light" className="h-40 max-w-[240px]" />
            <p className="mt-3 text-sm text-text-muted">Sign in to {BRAND.name}</p>
          </div>

          <div className="rounded-2xl border border-border bg-surface p-8 shadow-[var(--shadow-card-hover)]">
            {accessGate?.kind === 'subscription' || accessGate?.kind === 'trial' ? (
              <div className="space-y-4 text-center">
                <h2 className="text-xl font-bold text-text">
                  {accessGate.kind === 'trial' ? 'Trial ended' : 'Subscription ended'}
                </h2>
                <p className="text-sm leading-relaxed text-text-muted">
                  {accessGate.kind === 'trial'
                    ? 'Your free trial is over. Convert to a paid plan to keep using Raunaq POS.'
                    : 'Your payment period has ended. Pay to continue using the product — access stays locked until renewal.'}
                </p>
                <div className="rounded-xl border border-brand-200 bg-brand-50/80 px-4 py-4 text-left text-sm text-brand-950">
                  <p className="font-semibold">Contact to continue</p>
                  <p className="mt-2">
                    WhatsApp:{' '}
                    <a
                      className="font-medium text-brand-800 underline"
                      href={payWhatsApp}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {SUPPORT_WHATSAPP_DISPLAY}
                    </a>
                  </p>
                  <p className="mt-1">
                    Email:{' '}
                    <a className="font-medium text-brand-800 underline" href={`mailto:${SUPPORT_EMAIL}`}>
                      {SUPPORT_EMAIL}
                    </a>
                  </p>
                </div>
                <Button
                  type="button"
                  className="w-full"
                  size="lg"
                  onClick={() => window.open(payWhatsApp, '_blank', 'noopener,noreferrer')}
                >
                  {accessGate.kind === 'trial' ? 'Convert to paid plan' : 'Pay to continue'}
                </Button>
                <button
                  type="button"
                  className="text-sm text-text-muted underline hover:text-text"
                  onClick={() => setAccessGate(null)}
                >
                  Back to sign in
                </button>
              </div>
            ) : accessGate?.kind === 'revoked' ? (
              <div className="space-y-4 text-center">
                <h2 className="text-xl font-bold text-text">Access blocked</h2>
                <p className="text-sm leading-relaxed text-text-muted">{accessGate.message}</p>
                <div className="rounded-xl border border-border bg-surface-muted/50 px-4 py-4 text-left text-sm">
                  <p className="font-semibold text-text">Need help?</p>
                  <p className="mt-2 text-text-muted">
                    WhatsApp{' '}
                    <a
                      className="font-medium text-brand-800 underline"
                      href={supportWhatsappUrl('Hi, my Raunaq POS access was blocked.')}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {SUPPORT_WHATSAPP_DISPLAY}
                    </a>
                  </p>
                </div>
                <button
                  type="button"
                  className="text-sm text-text-muted underline hover:text-text"
                  onClick={() => setAccessGate(null)}
                >
                  Back to sign in
                </button>
              </div>
            ) : (
              <>
                <h2 className="text-xl font-bold text-text">Welcome back</h2>
                <p className="mt-1 text-sm text-text-muted">
                  Enter your credentials to access your dashboard
                </p>

                <form onSubmit={(e) => void handleSubmit(e)} className="mt-6 space-y-4">
                  <Input
                    label="Email"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="owner@demo.shop"
                    required
                  />
                  <Input
                    label="Password"
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                  {error && (
                    <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-danger">{error}</p>
                  )}
                  <Button type="submit" className="w-full" size="lg" loading={loading}>
                    Sign in
                  </Button>
                </form>

                {!import.meta.env.PROD && (
                  <div className="mt-6 space-y-3 rounded-xl border border-brand-200 bg-brand-50/80 px-4 py-3 text-sm text-brand-900">
                    <p className="font-semibold">Development logins (from database seed)</p>
                    <p>
                      <span className="font-medium">Shop:</span>{' '}
                      <span className="font-mono">owner@demo.shop</span> / DemoShop123!
                    </p>
                    <p>
                      <span className="font-medium">Admin:</span>{' '}
                      <span className="font-mono">superadmin@nexmind.com</span> / SuperAdmin123!
                    </p>
                    <p className="border-t border-brand-200/80 pt-2 text-xs leading-relaxed text-brand-800">
                      These passwords are stored <strong>hashed in PostgreSQL</strong> when you run{' '}
                      <code className="rounded bg-white/60 px-1">npm run db:seed</code> — not checked
                      in app code. After you change your password, the new hash replaces the old one
                      in the database, so the seed password will <strong>never work again</strong>{' '}
                      unless you re-run the seed or reset the account.
                    </p>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
