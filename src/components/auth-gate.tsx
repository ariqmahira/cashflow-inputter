'use client';

import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';

import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { SignIn } from './sign-in';

type State =
  | { status: 'loading' }
  | { status: 'signed-out' }
  | { status: 'signed-in'; session: Session }
  | { status: 'unconfigured' };

/**
 * Decides whether to show the app or the sign-in screen, and handles the magic-link return.
 *
 * The link lands in the system browser, then comes back either as a normal page load (web)
 * or through a deep link into the Android shell. The Capacitor listener below is registered
 * only when the app is actually running natively, so the web build carries none of it.
 */
export function AuthGate({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<State>({ status: 'loading' });

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      setState({ status: 'unconfigured' });
      return;
    }

    const client = supabase();

    void client.auth.getSession().then(({ data }) => {
      setState(data.session ? { status: 'signed-in', session: data.session } : { status: 'signed-out' });
    });

    const { data: sub } = client.auth.onAuthStateChange((_event, session) => {
      setState(session ? { status: 'signed-in', session } : { status: 'signed-out' });
    });

    // Native deep-link return: `id.cashflow.app://auth/callback?code=...`. Capacitor is
    // imported dynamically so the web bundle never pulls it in.
    let removeDeepLink: (() => void) | undefined;
    void (async () => {
      const { Capacitor } = await import('@capacitor/core');
      if (!Capacitor.isNativePlatform()) return;
      const { App } = await import('@capacitor/app');
      const handle = await App.addListener('appUrlOpen', ({ url }) => {
        const code = new URL(url).searchParams.get('code');
        if (code) void client.auth.exchangeCodeForSession(code);
      });
      removeDeepLink = () => void handle.remove();
    })();

    return () => {
      sub.subscription.unsubscribe();
      removeDeepLink?.();
    };
  }, []);

  if (state.status === 'loading') {
    return (
      <div className="grid min-h-dvh place-items-center">
        <p className="text-sm text-ink-faint">Loading…</p>
      </div>
    );
  }

  if (state.status === 'unconfigured') {
    return (
      <div className="mx-auto grid min-h-dvh max-w-sm place-items-center px-6 text-center">
        <div>
          <h1 className="font-display text-2xl text-ink">Kas is not connected</h1>
          <p className="mt-3 text-sm text-ink-soft">
            The Supabase keys were missing when this app was built. Run{' '}
            <code className="rounded bg-sunken px-1.5 py-0.5">vercel env pull</code> and rebuild.
          </p>
        </div>
      </div>
    );
  }

  if (state.status === 'signed-out') return <SignIn />;

  return <>{children}</>;
}
