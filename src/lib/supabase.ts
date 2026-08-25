/**
 * The Supabase browser client.
 *
 * There is no server half to this app — it is a static export that runs the same way on
 * Vercel and inside the Android shell — so `@supabase/ssr` and its cookie handling have no
 * role here. Sessions live in the browser/WebView, which is also the only place they are
 * needed.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
// The publishable key, not the legacy `anon` key. Either would work today, but publishable
// keys are the supported path forward. Never the secret or service-role key: anything with
// `NEXT_PUBLIC_` is compiled into the bundle and shipped to the device.
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

let client: SupabaseClient | null = null;

/**
 * Lazily created, so a missing key surfaces when someone tries to sign in rather than
 * crashing the whole bundle at import time — which in a static export would mean a blank
 * screen with nothing to read.
 */
export function supabase(): SupabaseClient {
  if (!url || !key) {
    throw new Error(
      'Supabase is not configured. Expected NEXT_PUBLIC_SUPABASE_URL and ' +
        'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY at build time.',
    );
  }
  client ??= createClient(url, key, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      // The magic link returns a code that must be exchanged for a session. On the web the
      // client can read it off the URL itself; in the native shell the deep-link handler
      // does it, so detection stays on and both paths work.
      detectSessionInUrl: true,
      flowType: 'pkce',
    },
  });
  return client;
}

export function isSupabaseConfigured(): boolean {
  return Boolean(url && key);
}
