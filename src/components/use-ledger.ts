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

    fetchLedger()
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
