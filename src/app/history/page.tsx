'use client';

import { useMemo, useState } from 'react';

import { Empty, Screen } from '@/components/screen';
import { SyncStatus } from '@/components/sync-status';
import { useLedger } from '@/components/use-ledger';
import { cycleFor, previousCycle, nextCycle, type Cycle } from '@/lib/cycle';
import { formatIdr } from '@/lib/money';
import { inCycle, netCost, type Entry, type Ledger } from '@/lib/queries';

export default function History() {
  const ledgerState = useLedger();
  const { status, ledger, error, reload } = ledgerState;
  // null means "wherever the data is"; a number is an explicit choice by the user.
  const [offset, setOffset] = useState<number | null>(null);

  if (status !== 'ready') {
    return <Screen title="History" status={status} error={error} onRetry={reload} />;
  }

  const anchor = ledger.settings.cycleAnchorDay;
  // Landing on the current cycle shows nothing for the first days of every cycle, so the
  // default is the newest cycle that actually holds an entry.
  const newestWithEntries = ledger.entries.length
    ? cycleFor(ledger.entries[0].occurredOn, anchor)
    : ledger.cycle;
  const cycle = offset === null ? newestWithEntries : shiftCycle(ledger.cycle, offset, anchor);
  const stepsFromNow = offset ?? cyclesBetween(ledger.cycle, newestWithEntries, anchor);

  return (
    <Screen title="History">
      <SyncStatus state={ledgerState} />
      <CycleSwitcher
        cycle={cycle}
        onPrev={() => setOffset(stepsFromNow - 1)}
        onNext={() => setOffset(Math.min(0, stepsFromNow + 1))}
        canGoNext={stepsFromNow < 0}
      />
      <CycleEntries ledger={ledger} cycle={cycle} />
    </Screen>
  );
}

/** How many cycles `target` is from `from`; negative means earlier. */
function cyclesBetween(from: Cycle, target: Cycle, anchor: number): number {
  if (target.start === from.start) return 0;
  let steps = 0;
  let cursor = from;
  // Bounded so a bad date can never spin here.
  while (cursor.start > target.start && steps > -600) {
    cursor = previousCycle(cursor, anchor);
    steps--;
  }
  return steps;
}

function shiftCycle(from: Cycle, offset: number, anchor: number): Cycle {
  let cycle = from;
  for (let i = 0; i < Math.abs(offset); i++) {
    cycle = offset < 0 ? previousCycle(cycle, anchor) : nextCycle(cycle, anchor);
  }
  return cycle;
}

function CycleSwitcher({
  cycle,
  onPrev,
  onNext,
  canGoNext,
}: {
  cycle: Cycle;
  onPrev: () => void;
  onNext: () => void;
  canGoNext: boolean;
}) {
  return (
    <div className="mb-4 flex items-center justify-between rounded-pill bg-surface p-1.5">
      <Arrow label="Previous cycle" onClick={onPrev} dir="prev" enabled />
      <span className="text-sm font-medium text-ink">{cycleLabel(cycle)}</span>
      <Arrow label="Next cycle" onClick={onNext} dir="next" enabled={canGoNext} />
    </div>
  );
}

function Arrow({
  label,
  onClick,
  dir,
  enabled,
}: {
  label: string;
  onClick: () => void;
  dir: 'prev' | 'next';
  enabled: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      disabled={!enabled}
      className="grid h-9 w-9 place-items-center rounded-pill text-ink-soft disabled:opacity-30"
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d={dir === 'prev' ? 'M15 6l-6 6 6 6' : 'M9 6l6 6-6 6'} />
      </svg>
    </button>
  );
}

function CycleEntries({ ledger, cycle }: { ledger: Ledger; cycle: Cycle }) {
  const { entries, reimbursed, categories, merchants } = ledger;

  const categoryName = useMemo(
    () => new Map(categories.map((c) => [c.id, c.name])),
    [categories],
  );
  const merchantName = useMemo(() => new Map(merchants.map((m) => [m.id, m.name])), [merchants]);

  const inThis = entries.filter((e) => inCycle(e, cycle));
  const byDay = groupByDay(inThis);

  if (inThis.length === 0) {
    return (
      <Empty
        title="Nothing in this cycle"
        hint="Nothing was recorded in this date range. Go back a cycle to see older entries."
      />
    );
  }

  const spent = inThis
    .filter((e) => e.kind === 'expense')
    .reduce((a, e) => a + netCost(e, reimbursed), 0);

  return (
    <>
      <p className="mb-4 text-sm text-ink-soft">
        <span className="tnum font-semibold text-ink">{formatIdr(spent)}</span> spent,{' '}
        {inThis.filter((e) => e.kind === 'expense').length} entries
      </p>

      <div className="space-y-4">
        {byDay.map(([day, dayEntries]) => (
          <section key={day} className="rounded-card bg-surface px-4 py-3">
            <h2 className="text-xs font-medium uppercase tracking-wide text-ink-faint">
              {longDate(day)}
            </h2>
            <ul className="mt-1 divide-y divide-line">
              {dayEntries.map((e) => (
                <Row
                  key={e.id}
                  entry={e}
                  net={netCost(e, reimbursed)}
                  category={e.categoryId ? categoryName.get(e.categoryId) : undefined}
                  merchant={e.merchantId ? merchantName.get(e.merchantId) : undefined}
                  repaid={reimbursed.get(e.id)}
                />
              ))}
            </ul>
          </section>
        ))}
      </div>
    </>
  );
}

function Row({
  entry,
  net,
  category,
  merchant,
  repaid,
}: {
  entry: Entry;
  net: number;
  category?: string;
  merchant?: string;
  repaid?: number;
}) {
  const incoming = entry.kind !== 'expense';
  const title = merchant ?? entry.note ?? (incoming ? 'Kas in' : 'Expense');

  return (
    <li className="flex items-start justify-between gap-3 py-2.5">
      <div className="min-w-0">
        <p className="truncate text-sm text-ink">{title}</p>
        <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-ink-faint">
          {category && <span>{category}</span>}
          {entry.dateInferred && (
            <span
              title="This date was guessed during migration from the old spreadsheet"
              className="text-ink-faint"
            >
              · date guessed
            </span>
          )}
          {repaid ? (
            <span className="rounded-pill bg-pandan-wash px-1.5 py-0.5 text-pandan-deep">
              {formatIdr(repaid)} repaid
            </span>
          ) : null}
        </p>
      </div>
      <span
        className={`tnum shrink-0 text-sm ${
          incoming ? 'text-pandan-deep' : entry.amountIdr < 0 ? 'text-teler' : 'text-ink'
        }`}
      >
        {incoming ? '+' : ''}
        {formatIdr(incoming ? entry.amountIdr : net)}
      </span>
    </li>
  );
}

function groupByDay(entries: Entry[]): [string, Entry[]][] {
  const map = new Map<string, Entry[]>();
  for (const e of entries) {
    const bucket = map.get(e.occurredOn) ?? [];
    bucket.push(e);
    map.set(e.occurredOn, bucket);
  }
  return [...map.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));
}

function longDate(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'long',
  }).format(new Date(Date.UTC(y, m - 1, d)));
}

function cycleLabel(cycle: Cycle): string {
  const fmt = (iso: string) => {
    const [y, m, d] = iso.split('-').map(Number);
    return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' }).format(
      new Date(Date.UTC(y, m - 1, d)),
    );
  };
  return `${fmt(cycle.start)} – ${fmt(cycle.end)}`;
}
