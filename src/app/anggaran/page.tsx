'use client';

import { useState } from 'react';

import { Screen } from '@/components/screen';
import { useLedger } from '@/components/use-ledger';
import { budgetStatus, cycleProgress } from '@/lib/cycle';
import { formatAmount, formatIdr, parseAmount } from '@/lib/money';
import { setBudget } from '@/lib/mutations';
import { limitFor, spendingByCategory } from '@/lib/queries';

export default function Anggaran() {
  const { status, ledger, error, reload } = useLedger();
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);

  if (status !== 'ready') {
    return <Screen title="Anggaran" status={status} error={error} onRetry={reload} />;
  }

  const { categories, entries, reimbursed, budgets, cycle, today, settings } = ledger;
  const spent = spendingByCategory(entries, reimbursed, cycle);
  const progress = cycleProgress(today, cycle);

  const rows = categories
    .map((c) => {
      const limit = limitFor(budgets, c.id, cycle);
      return { category: c, limit, status: budgetStatus(spent.get(c.id) ?? 0, limit, settings.warnThreshold) };
    })
    .sort((a, b) => b.status.spent - a.status.spent);

  async function save(categoryId: string) {
    const amount = parseAmount(draft);
    if (amount === null) return;
    setBusy(true);
    try {
      await setBudget(categoryId, amount, cycle.start);
      setEditing(null);
      setDraft('');
      reload();
    } finally {
      setBusy(false);
    }
  }

  const withLimits = rows.filter((r) => r.limit > 0);

  return (
    <Screen title="Anggaran">
      {withLimits.length === 0 && (
        <p className="mb-4 rounded-card bg-surface p-5 text-sm text-ink-soft">
          Belum ada batas yang diset. Ketuk kategori buat kasih batas — nanti kami ingatkan
          waktu kamu nyimpen pengeluaran yang bikin mepet.
        </p>
      )}

      <ul className="space-y-2.5">
        {rows.map(({ category, limit, status: s }) => {
          const pct = limit > 0 ? Math.min(100, Math.round(s.ratio * 100)) : 0;
          const bar =
            s.state === 'over' ? 'bg-teler' : s.state === 'warn' ? 'bg-gula' : 'bg-pandan';

          return (
            <li key={category.id} className="rounded-card bg-surface p-4">
              <button
                type="button"
                onClick={() => {
                  setEditing(editing === category.id ? null : category.id);
                  setDraft(limit > 0 ? formatAmount(limit) : '');
                }}
                className="flex w-full items-baseline justify-between gap-3 text-left"
              >
                <span className="text-sm font-medium text-ink">{category.name}</span>
                <span className="tnum shrink-0 text-sm text-ink-soft">
                  {formatIdr(s.spent)}
                  {limit > 0 && <span className="text-ink-faint"> / {formatIdr(limit)}</span>}
                </span>
              </button>

              {limit > 0 && (
                <>
                  <div className="relative mt-2 h-2 overflow-hidden rounded-pill bg-sunken">
                    <div className={`h-full rounded-pill ${bar}`} style={{ width: `${pct}%` }} />
                    {/* Where the spend would be if it were even across the cycle. */}
                    <span
                      aria-hidden
                      className="absolute top-0 h-full w-px bg-ink-faint"
                      style={{ left: `${Math.round(progress * 100)}%` }}
                    />
                  </div>
                  <p className="mt-1.5 text-xs text-ink-faint">
                    {s.state === 'over'
                      ? `Lewat ${formatIdr(-s.remaining)}`
                      : `Sisa ${formatIdr(s.remaining)}`}
                  </p>
                </>
              )}

              {editing === category.id && (
                <div className="mt-3 flex gap-2">
                  <input
                    inputMode="numeric"
                    autoFocus
                    value={draft}
                    onChange={(e) => {
                      const digits = e.target.value.replace(/\D/g, '');
                      setDraft(digits ? formatAmount(Number(digits)) : '');
                    }}
                    placeholder="Batas per siklus"
                    className="tnum min-w-0 flex-1 rounded-card border border-line bg-paper px-3 py-2 text-ink"
                  />
                  <button
                    type="button"
                    onClick={() => void save(category.id)}
                    disabled={busy || parseAmount(draft) === null}
                    className="shrink-0 rounded-pill bg-pandan px-4 py-2 text-sm text-white disabled:opacity-40"
                  >
                    Simpan
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </Screen>
  );
}
