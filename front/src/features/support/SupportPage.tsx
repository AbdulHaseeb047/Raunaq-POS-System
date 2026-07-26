import { useMutation } from '@tanstack/react-query';
import { useEffect, useState, type FormEvent } from 'react';

import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { api, ApiError } from '@/lib/api-client';
import { useAuth } from '@/lib/auth';
import {
  SUPPORT_EMAIL,
  SUPPORT_WHATSAPP_DISPLAY,
  SUPPORT_WHATSAPP_URL,
  supportWhatsappUrl,
} from '@/lib/support';

const TOPICS = [
  { value: 'billing', label: 'Billing & plans' },
  { value: 'technical', label: 'Technical issue' },
  { value: 'feature', label: 'Feature request' },
  { value: 'account', label: 'Account & staff' },
  { value: 'other', label: 'Something else' },
] as const;

type Topic = (typeof TOPICS)[number]['value'];

export function SupportPage() {
  const { user } = useAuth();
  const [topic, setTopic] = useState<Topic>('technical');
  const [contactEmail, setContactEmail] = useState(user?.email ?? '');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [submittedId, setSubmittedId] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (user?.email && !contactEmail.trim()) {
      setContactEmail(user.email);
    }
  }, [user?.email, contactEmail]);

  const submit = useMutation({
    mutationFn: () =>
      api.support.createQuery({
        topic,
        subject: subject.trim(),
        message: message.trim(),
        contactEmail: contactEmail.trim(),
      }),
    onSuccess: (row) => {
      setError('');
      setSubmittedId(row.id);
      setSubject('');
      setMessage('');
    },
    onError: (err) => {
      setSubmittedId(null);
      setError(err instanceof ApiError ? err.message : 'Could not send your message. Try again.');
    },
  });

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const email = contactEmail.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('Enter a valid email so we can reply to you.');
      return;
    }
    if (subject.trim().length < 3 || message.trim().length < 10) {
      setError('Add a short subject and a bit more detail (at least a sentence).');
      return;
    }
    submit.mutate();
  };

  const whatsappWithContext = supportWhatsappUrl(
    [
      'Hi, I need help with Raunaq POS.',
      user?.fullName ? `Name: ${user.fullName}` : null,
      contactEmail.trim()
        ? `Email: ${contactEmail.trim()}`
        : user?.email
          ? `Email: ${user.email}`
          : null,
      `Topic: ${TOPICS.find((t) => t.value === topic)?.label ?? topic}`,
      subject.trim() ? `Subject: ${subject.trim()}` : null,
    ]
      .filter(Boolean)
      .join('\n'),
  );

  return (
    <div className="relative w-full min-w-0">
      <div
        className="pointer-events-none absolute inset-0 -mx-3 -my-3 rounded-none bg-gradient-to-br from-brand-100/50 via-transparent to-brand-50/40 sm:-mx-4 lg:-mx-5"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -left-8 top-0 h-40 w-40 rounded-full bg-brand-300/20 blur-3xl sm:h-52 sm:w-52"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -right-6 bottom-10 h-36 w-36 rounded-full bg-brand-400/15 blur-3xl"
        aria-hidden
      />

      <div className="relative w-full min-w-0 space-y-5">
        <div className="relative overflow-hidden rounded-2xl border border-brand-200/80 bg-gradient-to-br from-brand-50 via-surface to-brand-50/30 px-4 py-5 sm:px-6 sm:py-6">
          <div
            className="pointer-events-none absolute -right-10 -top-12 h-40 w-40 rounded-full bg-brand-300/30 blur-3xl"
            aria-hidden
          />
          <div className="relative">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-brand-700/80">
              Get help · NexMind Systems
            </p>
            <h1 className="mt-1.5 text-xl font-bold tracking-tight text-text sm:text-2xl">
              We&apos;re here when you need us
            </h1>
            <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-text-muted">
              Send a quick message or chat on WhatsApp. Same team, same day responses during
              business hours.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <TrustChip>Usually replies within a few hours</TrustChip>
              <TrustChip>WhatsApp for urgent help</TrustChip>
              <TrustChip>Secure — tied to your shop account</TrustChip>
            </div>
          </div>
        </div>

        <div className="grid w-full gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <section className="min-w-0 rounded-2xl border border-border bg-surface/95 p-4 shadow-[var(--shadow-card)] sm:p-5">
            <div className="mb-4">
              <h2 className="text-sm font-bold text-text">Send a message</h2>
              <p className="mt-0.5 text-xs text-text-muted">
                Takes under a minute. We&apos;ll follow up by email or WhatsApp.
              </p>
            </div>

            {submittedId ? (
              <div className="rounded-xl border border-brand-200 bg-brand-50/70 px-4 py-5 text-center">
                <p className="text-sm font-bold text-brand-900">Message sent</p>
                <p className="mt-1 text-xs text-brand-800/80">
                  Thanks{user?.fullName ? `, ${user.fullName.split(' ')[0]}` : ''}. Our team has
                  your query and will get back soon.
                </p>
                <div className="mt-4 flex flex-wrap justify-center gap-2">
                  <Button size="sm" variant="secondary" onClick={() => setSubmittedId(null)}>
                    Send another
                  </Button>
                  <Button
                    size="sm"
                    onClick={() =>
                      window.open(SUPPORT_WHATSAPP_URL, '_blank', 'noopener,noreferrer')
                    }
                  >
                    Also chat on WhatsApp
                  </Button>
                </div>
              </div>
            ) : (
              <form className="space-y-3" onSubmit={onSubmit}>
                <Input label="Your name" value={user?.fullName ?? ''} readOnly disabled />
                <Input
                  label="Your email (for reply)"
                  type="email"
                  autoComplete="email"
                  placeholder="name@example.com"
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                  required
                />
                <p className="-mt-1.5 text-[11px] text-text-muted">
                  We&apos;ll reply here. Change it if your login email is not the one you check.
                </p>

                <Select
                  label="What do you need help with?"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value as Topic)}
                  options={TOPICS.map((t) => ({ value: t.value, label: t.label }))}
                />

                <Input
                  label="Subject"
                  placeholder="e.g. Receipt printer not connecting"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  maxLength={200}
                  required
                />

                <div className="space-y-1">
                  <label htmlFor="support-message" className="block text-xs font-medium text-text">
                    Message
                  </label>
                  <textarea
                    id="support-message"
                    rows={5}
                    maxLength={4000}
                    required
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="Briefly describe what happened and what you need…"
                    className="w-full rounded-lg border border-border bg-white px-2.5 py-1.5 text-[13px] text-text placeholder:text-text-muted/60 transition-colors focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
                  />
                  <p className="text-[11px] text-text-muted">{message.trim().length}/4000</p>
                </div>

                {error && (
                  <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                    {error}
                  </p>
                )}

                <Button type="submit" className="w-full sm:w-auto" loading={submit.isPending}>
                  Submit query
                </Button>
              </form>
            )}
          </section>

          <aside className="min-w-0 space-y-3">
            <div className="rounded-2xl border border-border bg-surface/95 p-4 shadow-[var(--shadow-card)] sm:p-5">
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#25D366]/15 text-[#128C7E]">
                  <WhatsAppIcon className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <h2 className="text-sm font-bold text-text">Chat on WhatsApp</h2>
                  <p className="mt-1 text-xs leading-relaxed text-text-muted">
                    Prefer a quick chat? Message us directly — fastest for urgent shop issues.
                  </p>
                </div>
              </div>

              <p className="mt-3 text-sm font-semibold tracking-wide text-text">
                {SUPPORT_WHATSAPP_DISPLAY}
              </p>

              <Button
                className="mt-3 w-full !bg-[#128C7E] hover:!bg-[#0e6f64] shadow-sm shadow-[#128C7E]/25"
                onClick={() => window.open(whatsappWithContext, '_blank', 'noopener,noreferrer')}
              >
                Open WhatsApp chat
              </Button>
              <p className="mt-2 text-center text-[11px] text-text-muted">
                Opens with your topic pre-filled so you type less.
              </p>
            </div>

            <div className="rounded-2xl border border-border bg-surface/95 p-4 shadow-[var(--shadow-card)] sm:p-5">
              <h2 className="text-sm font-bold text-text">Email</h2>
              <a
                href={`mailto:${SUPPORT_EMAIL}`}
                className="mt-2 block text-sm font-semibold text-brand-700 underline-offset-2 hover:underline"
              >
                {SUPPORT_EMAIL}
              </a>
              <p className="mt-2 text-xs text-text-muted">
                For invoices, contracts, or longer write-ups.
              </p>
            </div>

            <div className="rounded-2xl border border-dashed border-brand-300/70 bg-brand-50/50 px-4 py-3">
              <p className="text-xs font-semibold text-brand-900">Tip for faster help</p>
              <p className="mt-1 text-xs leading-relaxed text-brand-800/85">
                Include your shop name and what screen you were on. Screenshots on WhatsApp help us
                fix things quicker.
              </p>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

function TrustChip({ children }: { children: string }) {
  return (
    <span className="inline-flex items-center rounded-full border border-brand-200/90 bg-white/80 px-2.5 py-1 text-[11px] font-semibold text-brand-800 shadow-sm">
      {children}
    </span>
  );
}

function WhatsAppIcon({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.435 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}
