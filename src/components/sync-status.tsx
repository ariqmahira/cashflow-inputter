'use client';

import { useEffect, useState } from 'react';

import { clearRejected, rejected, type Rejected } from '@/lib/outbox';
import type { LedgerState } from './use-ledger';

/**
 * Says when the screen is showing something other than the live truth.
 *
 * Stays silent when everything is current. An always-visible "synced" badge trains people to
 * ignore the spot where the real warning will appear, so this only speaks up when the answer
 * is "not yet" or "this didn't go through".
 */
export function SyncStatus({ state }: { state: LedgerState }) {
  const [dead, setDead] = useState<Rejected[]>([]);

  useEffect(() => {
    void rejected().then(setDead);
  }, [state.ledger, state.refreshing]);

  const waiting = state.ledger?.pendingWrites ?? 0;

  if (dead.length > 0) {
    return (
      <div className="mb-4 rounded-card bg-teler-wash p-4">
        <p className="text-sm font-medium text-ink">
          {dead.length} {dead.length === 1 ? 'entry' : 'entries'} failed to send
        </p>
        <ul className="mt-1 space-y-0.5 text-xs text-ink-soft">
          {dead.slice(0, 3).map((r) => (
            <li key={r.item.id}>{r.error}</li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-ink-soft">
          They're still on this phone but never reached the server. Try recording them again.
        </p>
        <button
          type="button"
          onClick={() => void clearRejected().then(() => setDead([]))}
          className="mt-3 rounded-pill bg-ink px-3 py-1.5 text-xs text-paper"
        >
          Got it
        </button>
      </div>
    );
  }

  if (waiting > 0) {
    return (
      <p className="mb-4 rounded-card bg-gula-wash px-4 py-2.5 text-xs text-ink-soft">
        {waiting} {waiting === 1 ? 'entry' : 'entries'} waiting for a connection. Safe — saved on this phone for now.
      </p>
    );
  }

  if (state.stale) {
    return (
      <p className="mb-4 rounded-card bg-sunken px-4 py-2.5 text-xs text-ink-soft">
        Can't connect right now. This is the last saved data.
      </p>
    );
  }

  return null;
}
