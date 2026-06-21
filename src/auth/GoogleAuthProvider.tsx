import { createContext, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { GOOGLE_CLIENT_ID, SCOPES } from '../config';

type TokenClient = {
  requestAccessToken: (opts?: { prompt?: '' | 'consent' | 'select_account' }) => void;
};

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient: (config: {
            client_id: string;
            scope: string;
            callback: (resp: { access_token?: string; expires_in?: number; error?: string }) => void;
          }) => TokenClient;
          revoke: (token: string, done?: () => void) => void;
        };
      };
    };
  }
}

/** localStorage flag: set after the first successful sign-in so we can silently re-auth on startup. */
const SIGNED_IN_KEY = 'cashflow.signedIn';
/** Refresh a little before the real expiry to avoid racing a 401. */
const EXPIRY_SKEW_MS = 60_000;

type AuthCtx = {
  token: string | null;
  loading: boolean;
  error: string | null;
  signIn: () => void;
  signOut: () => void;
  /** Call before a Sheets request to ensure the token isn't stale. Re-prompts silently if so. */
  ensureToken: () => Promise<string>;
};

export const GoogleAuthContext = createContext<AuthCtx | null>(null);

const GIS_SRC = 'https://accounts.google.com/gsi/client';

function loadGisScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.google?.accounts?.oauth2) return resolve();
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${GIS_SRC}"]`);
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('GIS script failed to load')));
      return;
    }
    const script = document.createElement('script');
    script.src = GIS_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('GIS script failed to load'));
    document.head.appendChild(script);
  });
}

export function GoogleAuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const tokenClientRef = useRef<TokenClient | null>(null);
  const pendingRef = useRef<{ resolve: (t: string) => void; reject: (e: Error) => void } | null>(null);
  /** Epoch ms at which the current token expires (0 = none). */
  const expiresAtRef = useRef<number>(0);
  /** True while an automatic, silent (no-UI) request is in flight, so its failure stays quiet. */
  const silentRef = useRef<boolean>(false);

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) {
      setError('Missing VITE_GOOGLE_CLIENT_ID. See README.');
      setLoading(false);
      return;
    }
    let cancelled = false;
    // Safety net: a silent token request can hang without ever invoking the callback
    // (e.g. blocked third-party cookies / PWA storage partitioning). Don't stay stuck
    // on "Loading…" — fall back to the Sign-in screen after a short wait.
    let silentTimer: ReturnType<typeof setTimeout> | undefined;
    loadGisScript()
      .then(() => {
        if (cancelled) return;
        tokenClientRef.current = window.google!.accounts.oauth2.initTokenClient({
          client_id: GOOGLE_CLIENT_ID,
          scope: SCOPES,
          callback: (resp) => {
            clearTimeout(silentTimer);
            const wasSilent = silentRef.current;
            silentRef.current = false;
            if (resp.error) {
              // Quietly fall back to the Sign-in screen for failed silent attempts;
              // only surface errors from explicit, user-initiated sign-in.
              if (!wasSilent) setError(resp.error);
              setLoading(false);
              pendingRef.current?.reject(new Error(resp.error));
              pendingRef.current = null;
              return;
            }
            if (resp.access_token) {
              setToken(resp.access_token);
              expiresAtRef.current =
                Date.now() + (resp.expires_in ? resp.expires_in * 1000 : 3600_000);
              setError(null);
              setLoading(false);
              localStorage.setItem(SIGNED_IN_KEY, '1');
              pendingRef.current?.resolve(resp.access_token);
              pendingRef.current = null;
            }
          },
        });
        // If the user has signed in before, silently re-authorize on startup so they
        // don't have to tap "Sign in" every time. Otherwise show the Sign-in screen.
        if (localStorage.getItem(SIGNED_IN_KEY) === '1') {
          silentRef.current = true;
          silentTimer = setTimeout(() => {
            silentRef.current = false;
            setLoading(false);
          }, 4000);
          tokenClientRef.current.requestAccessToken({ prompt: '' });
        } else {
          setLoading(false);
        }
      })
      .catch((e) => {
        if (cancelled) return;
        setError(String(e));
        setLoading(false);
      });
    return () => {
      cancelled = true;
      clearTimeout(silentTimer);
    };
  }, []);

  const signIn = useCallback(() => {
    silentRef.current = false;
    tokenClientRef.current?.requestAccessToken({ prompt: 'consent' });
  }, []);

  const signOut = useCallback(() => {
    if (token && window.google?.accounts?.oauth2) {
      window.google.accounts.oauth2.revoke(token);
    }
    setToken(null);
    expiresAtRef.current = 0;
    localStorage.removeItem(SIGNED_IN_KEY);
  }, [token]);

  const ensureToken = useCallback((): Promise<string> => {
    if (token && Date.now() < expiresAtRef.current - EXPIRY_SKEW_MS) {
      return Promise.resolve(token);
    }
    // Missing or (near-)expired: silently mint a fresh token.
    return new Promise<string>((resolve, reject) => {
      pendingRef.current = { resolve, reject };
      silentRef.current = true;
      tokenClientRef.current?.requestAccessToken({ prompt: '' });
    });
  }, [token]);

  const value = useMemo<AuthCtx>(
    () => ({ token, loading, error, signIn, signOut, ensureToken }),
    [token, loading, error, signIn, signOut, ensureToken],
  );

  return <GoogleAuthContext.Provider value={value}>{children}</GoogleAuthContext.Provider>;
}
