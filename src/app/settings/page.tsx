'use client';

import { useState } from 'react';

import { Screen } from '@/components/screen';
import { SyncStatus } from '@/components/sync-status';
import { useLedger } from '@/components/use-ledger';
import { formatIdr } from '@/lib/money';
import { poolBalance } from '@/lib/queries';
import { supabase } from '@/lib/supabase';

export default function Settings() {
  const ledgerState = useLedger();
  const { status, ledger, error, reload } = ledgerState;
  const [signingOut, setSigningOut] = useState(false);

  if (status !== 'ready') {
    return <Screen title="Settings" status={status} error={error} onRetry={reload} />;
  }

  const { entries, settings, cycle } = ledger;
  const inferred = entries.filter((e) => e.dateInferred).length;

  return (
    <Screen title="Settings">
      <SyncStatus state={ledgerState} />
      <section className="rounded-card bg-surface p-5">
        <h2 className="font-display text-base text-ink">Cycle</h2>
        <dl className="mt-3 space-y-2 text-sm">
          <Row label="Starts on day" value={String(settings.cycleAnchorDay)} />
          <Row label="This cycle" value={`${cycle.start} → ${cycle.end}`} />
          <Row label="Warn at" value={`${Math.round(settings.warnThreshold * 100)}%`} />
        </dl>
        <p className="mt-3 text-xs text-ink-faint">
          The cycle follows the day the kas comes in, not the 1st — because that's when the
          money actually arrives.
        </p>
      </section>

      <section className="mt-4 rounded-card bg-surface p-5">
        <h2 className="font-display text-base text-ink">Data</h2>
        <dl className="mt-3 space-y-2 text-sm">
          <Row label="Total entries" value={String(entries.length)} />
          <Row label="Kas balance" value={formatIdr(poolBalance(entries))} />
          <Row label="Guessed dates" value={String(inferred)} />
        </dl>
        {inferred > 0 && (
          <p className="mt-3 text-xs text-ink-faint">
            {inferred} entries from the old spreadsheet had no date, so it was guessed from the
            nearest row. They're marked in History if you want to fix them.
          </p>
        )}
      </section>

      <button
        type="button"
        disabled={signingOut}
        onClick={() => {
          setSigningOut(true);
          void supabase().auth.signOut();
        }}
        className="mt-4 w-full rounded-pill border border-line bg-surface px-5 py-3 text-sm text-ink disabled:opacity-50"
      >
        {signingOut ? 'Signing out…' : 'Sign out'}
      </button>
    </Screen>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-ink-soft">{label}</dt>
      <dd className="tnum text-ink">{value}</dd>
    </div>
  );
}
