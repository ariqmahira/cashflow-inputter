'use client';

import { useCallback, useEffect, useState } from 'react';

import { fetchLedger, type Ledger } from '@/lib/queries';

type State =
  | { status: 'loading'; ledger: null; error: null }
  | { status: 'ready'; ledger: Ledger; error: null }
  | { status: 'error'; ledger: null; error: string };

/**
 * Loads the whole ledger once and hands it to a screen.
 *
 * Every screen wants a different slice of the same few hundred rows, so they share one fetch
 * rather than each running its own query. Phase 4 replaces the fetch with a read from the
 * device database; nothing that calls this needs to change.
 */
export function useLedger(): State & { reload: () => void } {
  const [state, setState] = useState<State>({ status: 'loading', ledger: null, error: null });
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading', ledger: null, error: null });

    fetchLedgerWithRetry(() => cancelled)
      .then((ledger) => {
        if (!cancelled) setState({ status: 'ready', ledger, error: null });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setState({
          status: 'error',
          ledger: null,
          error: err instanceof Error ? err.message : 'Gagal memuat data.',
        });
      });

    return () => {
      cancelled = true;
    };
  }, [nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return { ...state, reload };
}

/**
 * Loads the ledger, retrying briefly on transient failures.
 *
 * The ledger is fetched as nine parallel requests and assembled as a whole, because partial
 * data would mean a wrong balance — and a wrong balance shown confidently is worse than an
 * error. But that also means any single request failing takes the whole screen down, and
 * this app is used on mall wifi.
 *
 * So: retry the assembly a couple of times with a short backoff. Genuine problems (a revoked
 * session, a schema mistake) still surface, just a second later.
 */
async function fetchLedgerWithRetry(cancelled: () => boolean, attempts = 3): Promise<Ledger> {
  let lastError: unknown;

  for (let attempt = 0; attempt < attempts; attempt++) {
    if (cancelled()) throw new Error('cancelled');
    try {
      return await fetchLedger();
    } catch (err) {
      lastError = err;
      if (attempt < attempts - 1) {
        await new Promise((resolve) => setTimeout(resolve, 400 * 2 ** attempt));
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Gagal memuat data.');
}
