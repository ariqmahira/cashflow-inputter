'use client';

import Link from 'next/link';

import { KasJar } from '@/components/kas-jar';
import { TopUpPrompt } from '@/components/top-up-prompt';
import { Screen } from '@/components/screen';
import { useLedger } from '@/components/use-ledger';
import { burnRate, cycleProgress, projectedRunDry } from '@/lib/cycle';
import { formatIdr, formatIdrShort } from '@/lib/money';
import { addDays, daysBetween } from '@/lib/plain-date';
import {
  cycleContributions,
  cycleSpending,
  latestEntries,
  netCost,
  poolBalance,
  spendingByCategory,
} from '@/lib/queries';

export default function Beranda() {
  const { status, ledger, error, reload } = useLedger();

  if (status !== 'ready') {
    return <Screen title="Beranda" status={status} error={error} onRetry={reload} />;
  }

  const { entries, reimbursed, categories, cycle, today } = ledger;

  const balance = poolBalance(entries);
  const spent = cycleSpending(entries, reimbursed, cycle);
  const contributed = cycleContributions(entries, cycle);
  const progress = cycleProgress(today, cycle);
  const rate = burnRate(spent, today, cycle);
  const runDry = projectedRunDry(balance, rate, today);
  const daysLeft = daysBetween(today, cycle.end);

  // What the jar is measured against: the pool at the start of the cycle, plus anything put
  // in since. Spending it all exactly empties the jar.
  const startingFunds = balance + spent;

  const byCategory = spendingByCategory(entries, reimbursed, cycle);
  const top = categories
    .map((c) => ({ name: c.name, total: byCategory.get(c.id) ?? 0 }))
    .filter((c) => c.total > 0)
    .sort((a, b) => b.total - a.total)
    .slice(0, 4);

  // Not cycle-scoped: on the first day of a cycle that list is empty, which makes two years
  // of history look like an empty account.
  const recent = latestEntries(entries, 4);
  const merchantName = new Map(ledger.merchants.map((m) => [m.id, m.name]));
  // The next anchor day is simply the day after this cycle ends — no separate arithmetic.
  const nextTopUp = addDays(cycle.end, 1);

  return (
    <Screen title="Beranda">
      <section className="rounded-card bg-surface p-5">
        <KasJar balance={balance} cycleStartingFunds={startingFunds} progress={progress} />

        <dl className="mt-5 grid grid-cols-3 gap-3 border-t border-line pt-4 text-center">
          <Stat label="Terpakai" value={formatIdrShort(spent)} />
          <Stat label="Per hari" value={formatIdrShort(Math.round(rate))} />
          <Stat label="Sisa hari" value={daysLeft >= 0 ? String(daysLeft) : '0'} />
        </dl>

        <p className="mt-4 text-sm text-ink-soft">
          {runDry && runDry <= cycle.end ? (
            <>
              Dengan pola sekarang, kas habis sekitar{' '}
              <strong className="font-semibold text-gula">{prettyDate(runDry)}</strong> — {' '}
              {daysBetween(runDry, cycle.end)} hari sebelum kas berikutnya.
            </>
          ) : contributed > 0 ? (
            <>Kas berikutnya masuk {prettyDate(nextTopUp)}.</>
          ) : (
            <>Belum ada kas masuk siklus ini.</>
          )}
        </p>
      </section>

      <TopUpPrompt ledger={ledger} onDone={reload} />

      {top.length > 0 && (
        <section className="mt-4 rounded-card bg-surface p-5">
          <h2 className="font-display text-base text-ink">Ke mana perginya</h2>
          <ul className="mt-3 space-y-2.5">
            {top.map((c) => (
              <li key={c.name}>
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="text-ink">{c.name}</span>
                  <span className="tnum text-ink-soft">{formatIdr(c.total)}</span>
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-pill bg-sunken">
                  <div
                    className="h-full rounded-pill bg-pandan"
                    style={{ width: `${Math.round((c.total / top[0].total) * 100)}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-4 rounded-card bg-surface p-5">
        <div className="flex items-baseline justify-between">
          <h2 className="font-display text-base text-ink">Terakhir</h2>
          <Link href="/riwayat" className="text-sm text-pandan-deep">
            Lihat semua
          </Link>
        </div>

        {recent.length === 0 ? (
          <p className="mt-3 text-sm text-ink-soft">
            Belum ada pengeluaran sama sekali. Yang pertama menentukan nadanya.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-line">
            {recent.map((e) => (
              <li key={e.id} className="flex items-baseline justify-between gap-3 py-2.5 text-sm">
                <span className="min-w-0 truncate text-ink">
                  {(e.merchantId ? merchantName.get(e.merchantId) : null) ?? e.note ?? 'Pengeluaran'}
                </span>
                <span className="tnum shrink-0 text-ink-soft">
                  {formatIdr(netCost(e, reimbursed))}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </Screen>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-ink-faint">{label}</dt>
      <dd className="tnum mt-0.5 font-display text-lg text-ink">{value}</dd>
    </div>
  );
}

function prettyDate(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short' }).format(
    new Date(Date.UTC(y, m - 1, d)),
  );
}
