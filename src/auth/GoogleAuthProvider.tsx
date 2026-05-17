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
            callback: (resp: { access_token?: string; error?: string }) => void;
          }) => TokenClient;
          revoke: (token: string, done?: () => void) => void;
        };
      };
    };
  }
}

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

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) {
      setError('Missing VITE_GOOGLE_CLIENT_ID. See README.');
      setLoading(false);
      return;
    }
    let cancelled = false;
    loadGisScript()
      .then(() => {
        if (cancelled) return;
        tokenClientRef.current = window.google!.accounts.oauth2.initTokenClient({
          client_id: GOOGLE_CLIENT_ID,
          scope: SCOPES,
          callback: (resp) => {
            if (resp.error) {
              setError(resp.error);
              pendingRef.current?.reject(new Error(resp.error));
              pendingRef.current = null;
              return;
            }
            if (resp.access_token) {
              setToken(resp.access_token);
              setError(null);
              pendingRef.current?.resolve(resp.access_token);
              pendingRef.current = null;
            }
          },
        });
        setLoading(false);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(String(e));
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const signIn = useCallback(() => {
    tokenClientRef.current?.requestAccessToken({ prompt: 'consent' });
  }, []);

  const signOut = useCallback(() => {
    if (token && window.google?.accounts?.oauth2) {
      window.google.accounts.oauth2.revoke(token);
    }
    setToken(null);
  }, [token]);

  const ensureToken = useCallback((): Promise<string> => {
    if (token) return Promise.resolve(token);
    return new Promise<string>((resolve, reject) => {
      pendingRef.current = { resolve, reject };
      tokenClientRef.current?.requestAccessToken({ prompt: '' });
    });
  }, [token]);

  const value = useMemo<AuthCtx>(
    () => ({ token, loading, error, signIn, signOut, ensureToken }),
    [token, loading, error, signIn, signOut, ensureToken],
  );

  return <GoogleAuthContext.Provider value={value}>{children}</GoogleAuthContext.Provider>;
}
