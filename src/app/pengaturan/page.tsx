'use client';

import { useState } from 'react';

import { Screen } from '@/components/screen';
import { SyncStatus } from '@/components/sync-status';
import { useLedger } from '@/components/use-ledger';
import { formatIdr } from '@/lib/money';
import { poolBalance } from '@/lib/queries';
import { supabase } from '@/lib/supabase';

export default function Pengaturan() {
  const ledgerState = useLedger();
  const { status, ledger, error, reload } = ledgerState;
  const [signingOut, setSigningOut] = useState(false);

  if (status !== 'ready') {
    return <Screen title="Pengaturan" status={status} error={error} onRetry={reload} />;
  }

  const { entries, settings, cycle } = ledger;
  const inferred = entries.filter((e) => e.dateInferred).length;

  return (
    <Screen title="Pengaturan">
      <SyncStatus state={ledgerState} />
      <section className="rounded-card bg-surface p-5">
        <h2 className="font-display text-base text-ink">Siklus</h2>
        <dl className="mt-3 space-y-2 text-sm">
          <Row label="Mulai tanggal" value={String(settings.cycleAnchorDay)} />
          <Row label="Siklus ini" value={`${cycle.start} → ${cycle.end}`} />
          <Row label="Peringatan di" value={`${Math.round(settings.warnThreshold * 100)}%`} />
        </dl>
        <p className="mt-3 text-xs text-ink-faint">
          Siklus ikut tanggal kas masuk, bukan tanggal 1 — soalnya uangnya memang datang
          tanggal segitu.
        </p>
      </section>

      <section className="mt-4 rounded-card bg-surface p-5">
        <h2 className="font-display text-base text-ink">Data</h2>
        <dl className="mt-3 space-y-2 text-sm">
          <Row label="Total catatan" value={String(entries.length)} />
          <Row label="Sisa kas" value={formatIdr(poolBalance(entries))} />
          <Row label="Tanggal ditebak" value={String(inferred)} />
        </dl>
        {inferred > 0 && (
          <p className="mt-3 text-xs text-ink-faint">
            {inferred} catatan dari spreadsheet lama nggak punya tanggal, jadi ditebak dari baris
            terdekat. Tandanya kelihatan di Riwayat kalau mau dibetulin.
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
        {signingOut ? 'Keluar…' : 'Keluar'}
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
