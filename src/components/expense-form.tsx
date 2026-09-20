'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

import { DateField } from '@/components/date-field';
import { budgetAfterAdding } from '@/lib/cycle';
import { formatAmount, formatIdr, parseAmount } from '@/lib/money';
import { limitFor, spendingByCategory, type Ledger, type Merchant } from '@/lib/queries';
import { saveExpense } from '@/lib/sync';

/**
 * Recording a purchase.
 *
 * Arranged around the order things are actually known: the amount is on the receipt in your
 * hand, the merchant is the sign above the counter, and the category follows from the
 * merchant without being asked.
 */
export function ExpenseForm({ ledger, onSaved }: { ledger: Ledger; onSaved: () => void }) {
  const router = useRouter();
  const { categories, merchants, places, cycle, today, entries, reimbursed, budgets, settings } =
    ledger;

  const [amountText, setAmountText] = useState('');
  const [merchantName, setMerchantName] = useState('');
  const [placeName, setPlaceName] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [touchedCategory, setTouchedCategory] = useState(false);
  const [occurredOn, setOccurredOn] = useState(today);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const suggestions = useMemo(
    () => suggestMerchants(merchants, merchantName),
    [merchants, merchantName],
  );

  const amount = parseAmount(amountText);

  // Choosing a known merchant fills the category in, until the user overrides it — after
  // which their choice sticks rather than being quietly re-guessed on the next keystroke.
  const matched = merchants.find((m) => m.name.toLowerCase() === merchantName.trim().toLowerCase());
  const effectiveCategoryId = touchedCategory
    ? categoryId
    : (categoryId ?? matched?.defaultCategoryId ?? null);

  const spentByCat = spendingByCategory(entries, reimbursed, cycle);
  const warning =
    amount && effectiveCategoryId
      ? budgetAfterAdding(
          amount,
          spentByCat.get(effectiveCategoryId) ?? 0,
          limitFor(budgets, effectiveCategoryId, cycle),
          settings.warnThreshold,
        )
      : null;

  const categoryName = categories.find((c) => c.id === effectiveCategoryId)?.name;
  const canSave = Boolean(amount && amount > 0 && merchantName.trim() && effectiveCategoryId);

  async function save() {
    if (!canSave || !amount || !effectiveCategoryId) return;
    setSaving(true);
    setError(null);
    try {
      await saveExpense({
        occurredOn,
        amountIdr: amount,
        categoryId: effectiveCategoryId,
        merchantName,
        placeName: placeName || undefined,
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
        <label htmlFor="amount" className="block text-xs font-medium uppercase tracking-wide text-ink-faint">
          Amount
        </label>
        <div className="mt-1 flex items-baseline gap-2">
          <span className="font-display text-2xl text-ink-faint">Rp</span>
          <input
            id="amount"
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
      </div>

      <div className="mt-4 rounded-card bg-surface p-5">
        <label htmlFor="merchant" className="block text-xs font-medium uppercase tracking-wide text-ink-faint">
          Where
        </label>
        <input
          id="merchant"
          autoComplete="off"
          value={merchantName}
          onChange={(e) => setMerchantName(e.target.value)}
          placeholder="Sushi Tei"
          className="mt-1.5 w-full rounded-card border border-line bg-paper px-3.5 py-2.5 text-ink placeholder:text-ink-faint"
        />

        {suggestions.length > 0 && merchantName.trim() && !matched && (
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {suggestions.map((m) => (
              <li key={m.id}>
                <button
                  type="button"
                  onClick={() => {
                    setMerchantName(m.name);
                    if (!touchedCategory) setCategoryId(m.defaultCategoryId);
                  }}
                  className="rounded-pill bg-sunken px-3 py-1.5 text-sm text-ink"
                >
                  {m.name}
                </button>
              </li>
            ))}
          </ul>
        )}

        <label htmlFor="place" className="mt-4 block text-xs font-medium uppercase tracking-wide text-ink-faint">
          Place <span className="normal-case tracking-normal">— optional</span>
        </label>
        <input
          id="place"
          autoComplete="off"
          list="places"
          value={placeName}
          onChange={(e) => setPlaceName(e.target.value)}
          placeholder="Grand Indonesia"
          className="mt-1.5 w-full rounded-card border border-line bg-paper px-3.5 py-2.5 text-ink placeholder:text-ink-faint"
        />
        <datalist id="places">
          {places.map((p) => (
            <option key={p.id} value={p.name} />
          ))}
        </datalist>
      </div>

      <fieldset className="mt-4 rounded-card bg-surface p-5">
        <legend className="text-xs font-medium uppercase tracking-wide text-ink-faint">
          Category
        </legend>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {categories.map((c) => {
            const selected = c.id === effectiveCategoryId;
            return (
              <button
                key={c.id}
                type="button"
                aria-pressed={selected}
                onClick={() => {
                  setCategoryId(c.id);
                  setTouchedCategory(true);
                }}
                className={`rounded-pill px-3 py-1.5 text-sm transition-colors ${
                  selected ? 'bg-pandan text-white' : 'bg-sunken text-ink'
                }`}
              >
                {c.name}
              </button>
            );
          })}
        </div>
        {matched && !touchedCategory && effectiveCategoryId && (
          <p className="mt-2.5 text-xs text-ink-faint">
            Picked automatically from {matched.name}. Change it if it's wrong.
          </p>
        )}
      </fieldset>

      <div className="mt-4 rounded-card bg-surface p-5">
        <DateField id="expense-date" label="Date" value={occurredOn} onChange={setOccurredOn} />
      </div>

      {warning && warning.after.state !== 'ok' && categoryName && (
        <p
          className={`mt-4 rounded-card p-4 text-sm ${
            warning.after.state === 'over' ? 'bg-teler-wash text-ink' : 'bg-gula-wash text-ink'
          }`}
        >
          {warning.after.state === 'over' ? (
            <>
              This puts <strong className="font-semibold">{categoryName}</strong> over budget —{' '}
              <span className="tnum">{formatIdr(-warning.after.remaining)}</span> above the limit.
            </>
          ) : (
            <>
              This brings <strong className="font-semibold">{categoryName}</strong> to{' '}
              {Math.round(warning.after.ratio * 100)}% of its budget, with{' '}
              <span className="tnum">{formatIdr(warning.after.remaining)}</span> left.
            </>
          )}
        </p>
      )}

      {error && <p className="mt-4 text-sm text-teler">{error}</p>}

      <button
        type="button"
        onClick={() => void save()}
        disabled={!canSave || saving}
        className="mt-5 w-full rounded-pill bg-pandan px-5 py-3.5 font-display text-base text-white disabled:opacity-40"
      >
        {saving ? 'Saving…' : 'Save'}
      </button>
    </>
  );
}

/**
 * Merchant suggestions, matched against canonical names and every alias.
 *
 * Prefix matches rank above contains matches — someone typing "sus" wants Sushi Tei before
 * Bakmi GM, even though both contain the letters.
 */
function suggestMerchants(merchants: Merchant[], query: string): Merchant[] {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];

  const scored: { m: Merchant; score: number }[] = [];
  for (const m of merchants) {
    const names = [m.name, ...m.aliases].map((n) => n.toLowerCase());
    if (names.some((n) => n.startsWith(q))) scored.push({ m, score: 0 });
    else if (names.some((n) => n.includes(q))) scored.push({ m, score: 1 });
  }
  return scored
    .sort((a, b) => a.score - b.score || a.m.name.localeCompare(b.m.name))
    .slice(0, 6)
    .map((s) => s.m);
}
