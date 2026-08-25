'use client';

import { useCallback, useEffect, useState } from 'react';

import { readCache, syncNow, type LocalLedger } from '@/lib/sync';

type State =
  | { status: 'loading'; ledger: null; error: null }
  | { status: 'ready'; ledger: LocalLedger; error: null }
  | { status: 'error'; ledger: null; error: string };

export type LedgerState = State & {
  reload: () => void;
  /** True while a background refresh is running behind already-rendered data. */
  refreshing: boolean;
  /** Set when the last refresh failed but cached data is on screen. */
  stale: boolean;
};

/**
 * Loads the ledger, cache first.
 *
 * The cached copy renders immediately and the network refreshes it behind. That ordering is
 * the point: the app opens instantly and works with no connection, and a failed refresh
 * leaves the last known ledger on screen rather than an error page.
 *
 * An error is only shown when there is nothing cached to show instead.
 */
export function useLedger(): LedgerState {
  const [state, setState] = useState<State>({ status: 'loading', ledger: null, error: null });
  const [refreshing, setRefreshing] = useState(false);
  const [stale, setStale] = useState(false);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const cached = await readCache();
      if (cancelled) return;
      if (cached) {
        setState({ status: 'ready', ledger: cached, error: null });
      }

      setRefreshing(true);
      try {
        const fresh = await syncNow();
        if (cancelled) return;
        setState({ status: 'ready', ledger: fresh, error: null });
        setStale(false);
      } catch (err) {
        if (cancelled) return;
        if (cached) {
          // Cached data is still on screen and still useful; say it may be behind rather
          // than replacing it with an error.
          setStale(true);
        } else {
          setState({
            status: 'error',
            ledger: null,
            error: err instanceof Error ? err.message : 'Gagal memuat data.',
          });
        }
      } finally {
        if (!cancelled) setRefreshing(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [nonce]);

  // Refresh when the connection returns or the app comes back to the foreground — the two
  // moments when queued writes can finally be sent.
  useEffect(() => {
    const trigger = () => setNonce((n) => n + 1);
    const onVisible = () => {
      if (document.visibilityState === 'visible') trigger();
    };
    window.addEventListener('online', trigger);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('online', trigger);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return { ...state, reload, refreshing, stale };
}
