'use client';

import { useState } from 'react';

import { formatIdr } from '@/lib/money';
import { saveContribution } from '@/lib/sync';
import { topUpRecorded, type Ledger } from '@/lib/queries';

/**
 * Offers to record the kas top-up when one is due and has not been entered.
 *
 * The pool balance goes negative for a few days every month for exactly one reason: the
 * top-up happened in real life and nobody wrote it down. Two years of spreadsheet show the
 * same gap. A red number with no explanation is a dead end, so the screen that reports the
 * problem also offers the fix.
 *
 * It never posts on its own. Real top-ups landed anywhere from the 18th to the 26th, so the
 * app can be confident one is *expected* and never that one has *happened*.
 */
export function TopUpPrompt({ ledger, onDone }: { ledger: Ledger; onDone: () => void }) {
  const { recurringRules, members, entries, cycle, today } = ledger;
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const memberName = new Map(members.map((m) => [m.id, m.name]));

  const outstanding = recurringRules.filter(
    (r) => r.memberId && !topUpRecorded(entries, cycle, r.memberId),
  );

  if (outstanding.length === 0) return null;

  const total = outstanding.reduce((a, r) => a + r.amountIdr, 0);

  async function record() {
    setSaving(true);
    setError(null);
    try {
      for (const rule of outstanding) {
        await saveContribution({
          occurredOn: today,
          amountIdr: rule.amountIdr,
          memberId: rule.memberId!,
          note: rule.label,
        });
      }
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menyimpan. Coba lagi.');
      setSaving(false);
    }
  }

  return (
    <section className="mt-4 rounded-card bg-pandan-wash p-5">
      <h2 className="font-display text-base text-ink">Kas belum dicatat</h2>
      <p className="mt-1 text-sm text-ink-soft">
        {outstanding.map((r) => memberName.get(r.memberId!) ?? r.label).join(' dan ')} belum masuk
        siklus ini.
      </p>

      <ul className="mt-3 space-y-1 text-sm">
        {outstanding.map((r) => (
          <li key={r.id} className="flex items-baseline justify-between gap-3">
            <span className="text-ink">{memberName.get(r.memberId!) ?? r.label}</span>
            <span className="tnum text-ink-soft">{formatIdr(r.amountIdr)}</span>
          </li>
        ))}
      </ul>

      {error && <p className="mt-3 text-sm text-teler">{error}</p>}

      <button
        type="button"
        onClick={() => void record()}
        disabled={saving}
        className="mt-4 w-full rounded-pill bg-pandan px-5 py-3 font-display text-base text-white disabled:opacity-60"
      >
        {saving ? 'Menyimpan…' : `Catat ${formatIdr(total)} masuk`}
      </button>

      <p className="mt-2 text-center text-xs text-ink-soft">
        Cuma kalau uangnya memang sudah dikirim.
      </p>
    </section>
  );
}
