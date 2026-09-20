'use client';

import { useState } from 'react';

import { supabase } from '@/lib/supabase';

/** Where the magic link should return to, native shell or browser. */
async function redirectTarget(): Promise<string> {
  const { Capacitor } = await import('@capacitor/core');
  return Capacitor.isNativePlatform()
    ? 'id.cashflow.app://auth/callback'
    : `${window.location.origin}/`;
}

type Status = { kind: 'idle' } | { kind: 'sending' } | { kind: 'sent' } | { kind: 'error'; message: string };

export function SignIn() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<Status>({ kind: 'idle' });

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setStatus({ kind: 'sending' });
    try {
      const { error } = await supabase().auth.signInWithOtp({
        email: email.trim(),
        options: { emailRedirectTo: await redirectTarget() },
      });
      if (error) throw error;
      setStatus({ kind: 'sent' });
    } catch (err) {
      setStatus({
        kind: 'error',
        message: err instanceof Error ? err.message : 'Could not send the link. Try again.',
      });
    }
  }

  return (
    <div className="mx-auto grid min-h-dvh max-w-sm place-items-center px-6">
      <div className="w-full">
        <h1 className="font-display text-4xl leading-none text-ink">Kas</h1>
        <p className="mt-2 text-sm text-ink-soft">Shared kas for Ariq &amp; Ika</p>

        {status.kind === 'sent' ? (
          <div className="mt-8 rounded-card bg-pandan-wash p-5">
            <p className="font-display text-lg text-ink">Check your email</p>
            <p className="mt-1 text-sm text-ink-soft">
              A sign-in link was sent to {email}. Open it on this phone so it goes straight
              into the app.
            </p>
          </div>
        ) : (
          <form onSubmit={send} className="mt-8">
            <label htmlFor="email" className="block text-sm font-medium text-ink-soft">
              Email
            </label>
            <input
              id="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@email.com"
              className="mt-2 w-full rounded-card border border-line bg-surface px-4 py-3 text-ink placeholder:text-ink-faint"
            />

            <button
              type="submit"
              disabled={status.kind === 'sending'}
              className="mt-4 w-full rounded-pill bg-pandan px-5 py-3.5 font-display text-base text-white disabled:opacity-60"
            >
              {status.kind === 'sending' ? 'Sending…' : 'Send sign-in link'}
            </button>

            {status.kind === 'error' && (
              <p className="mt-3 text-sm text-teler">{status.message}</p>
            )}

            <p className="mt-4 text-xs text-ink-faint">
              No password. We'll email you a one-time link.
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
