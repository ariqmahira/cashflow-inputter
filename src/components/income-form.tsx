'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import { DateField } from '@/components/date-field';
import { formatAmount, formatIdr, parseAmount } from '@/lib/money';
import { cycleContributions, topUpRecorded, type Ledger } from '@/lib/queries';
import { saveContribution } from '@/lib/sync';

/**
 * Recording money into the kas by hand.
 *
 * The one-tap prompt on Home covers the usual monthly top-up at the usual amount. This is
 * for everything else: a month somebody put in more or less than usual, a top-up remembered
 * three days late, money added mid-cycle to cover something.
 *
 * A contribution belongs to a member — that is what the ledger is for, knowing who funded
 * what — so the member is a required choice rather than an optional detail.
 */
export function IncomeForm({ ledger, onSaved }: { ledger: Ledger; onSaved: () => void }) {
  const router = useRouter();
  const { members, recurringRules, entries, cycle, today } = ledger;

  const [amountText, setAmountText] = useState('');
  const [memberId, setMemberId] = useState<string | null>(null);
  const [occurredOn, setOccurredOn] = useState(today);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const amount = parseAmount(amountText);
  const canSave = Boolean(amount && amount > 0 && memberId);

  // What this member usually puts in, so the common case is one tap rather than typing.
  const usual = memberId
    ? recurringRules.find((r) => r.memberId === memberId)?.amountIdr
    : undefined;

  const alreadyIn = memberId ? topUpRecorded(entries, cycle, memberId) : false;
  const memberName = members.find((m) => m.id === memberId)?.name;

  async function save() {
    if (!canSave || !amount || !memberId) return;
    setSaving(true);
    setError(null);
    try {
      await saveContribution({
        occurredOn,
        amountIdr: amount,
        memberId,
        note: note.trim() || undefined,
      });
      onSaved();
      router.push('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save. Try again.');
      setSaving(false);
    }
  }

  return (
    <>
      <div className="rounded-card bg-surface p-5">
        <label htmlFor="kas-amount" className="block text-xs font-medium uppercase tracking-wide text-ink-faint">
          Amount
        </label>
        <div className="mt-1 flex items-baseline gap-2">
          <span className="font-display text-2xl text-ink-faint">Rp</span>
          <input
            id="kas-amount"
            inputMode="numeric"
            autoComplete="off"
            value={amountText}
            onChange={(e) => {
              const digits = e.target.value.replace(/\D/g, '');
              setAmountText(digits ? formatAmount(Number(digits)) : '');
            }}
            placeholder="0"
            className="tnum w-full bg-transparent font-display text-4xl text-ink outline-none placeholder:text-ink-faint"
          />
        </div>

        {usual && amount !== usual && (
          <button
            type="button"
            onClick={() => setAmountText(formatAmount(usual))}
            className="mt-3 rounded-pill bg-sunken px-3 py-1.5 text-sm text-ink"
          >
            Usually {formatIdr(usual)}
          </button>
        )}
      </div>

      <fieldset className="mt-4 rounded-card bg-surface p-5">
        <legend className="text-xs font-medium uppercase tracking-wide text-ink-faint">
          From
        </legend>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {members.map((m) => (
            <button
              key={m.id}
              type="button"
              aria-pressed={m.id === memberId}
              onClick={() => setMemberId(m.id)}
              className={`rounded-pill px-4 py-2 text-sm transition-colors ${
                m.id === memberId ? 'bg-pandan text-white' : 'bg-sunken text-ink'
              }`}
            >
              {m.name}
            </button>
          ))}
        </div>

        {alreadyIn && memberName && (
          // Not an error — putting in twice is allowed — but worth saying, since forgetting
          // whether it was recorded is exactly why someone opens this screen.
          <p className="mt-2.5 text-xs text-gula">
            {memberName} is already recorded as paid in this cycle.
          </p>
        )}
      </fieldset>

      <div className="mt-4 space-y-4 rounded-card bg-surface p-5">
        <DateField id="kas-date" label="Date" value={occurredOn} onChange={setOccurredOn} />

        <div>
          <label htmlFor="kas-note" className="block text-xs font-medium uppercase tracking-wide text-ink-faint">
            Note <span className="normal-case tracking-normal">— optional</span>
          </label>
          <input
            id="kas-note"
            autoComplete="off"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Monthly kas"
            className="mt-1.5 w-full rounded-card border border-line bg-paper px-3.5 py-2.5 text-ink placeholder:text-ink-faint"
          />
        </div>
      </div>

      {amount && amount > 0 && (
        <p className="mt-4 text-sm text-ink-soft">
          This cycle's kas comes to{' '}
          <span className="tnum font-semibold text-ink">
            {formatIdr(cycleContributions(entries, cycle) + amount)}
          </span>
          .
        </p>
      )}

      {error && <p className="mt-4 text-sm text-teler">{error}</p>}

      <button
        type="button"
        onClick={() => void save()}
        disabled={!canSave || saving}
        className="mt-5 w-full rounded-pill bg-pandan px-5 py-3.5 font-display text-base text-white disabled:opacity-40"
      >
        {saving ? 'Saving…' : 'Save kas in'}
      </button>
    </>
  );
}
