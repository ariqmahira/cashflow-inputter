'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

import { Screen } from '@/components/screen';
import { useLedger } from '@/components/use-ledger';
import { budgetAfterAdding } from '@/lib/cycle';
import { formatAmount, formatIdr, parseAmount } from '@/lib/money';
import { addExpense } from '@/lib/mutations';
import { limitFor, spendingByCategory, type Merchant } from '@/lib/queries';

/**
 * The entry form.
 *
 * This is the screen the app exists for, so it is arranged around the order things are
 * actually known: the amount is on the receipt in your hand, the merchant is the sign above
 * the counter, and the category follows from the merchant without being asked.
 */
export default function Tambah() {
  const router = useRouter();
  const { status, ledger, error, reload } = useLedger();

  const [amountText, setAmountText] = useState('');
  const [merchantName, setMerchantName] = useState('');
  const [placeName, setPlaceName] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [touchedCategory, setTouchedCategory] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const merchantSuggestions = useMemo(
    () => (ledger ? suggestMerchants(ledger.merchants, merchantName) : []),
    [ledger, merchantName],
  );

  if (status !== 'ready') {
    return <Screen title="Tambah" status={status} error={error} onRetry={reload} />;
  }

  const { categories, merchants, cycle, today, entries, reimbursed, budgets, settings } = ledger;

  const amount = parseAmount(amountText);

  // Choosing a known merchant fills the category in, until the user overrides it — after
  // which their choice sticks rather than being quietly re-guessed on the next keystroke.
  const matched = merchants.find(
    (m) => m.name.toLowerCase() === merchantName.trim().toLowerCase(),
  );
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
    setSaveError(null);
    try {
      await addExpense({
        occurredOn: today,
        amountIdr: amount,
        categoryId: effectiveCategoryId,
        merchantName,
        placeName: placeName || undefined,
      });
      router.push('/');
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Gagal menyimpan. Coba lagi.');
      setSaving(false);
    }
  }

  return (
    <Screen title="Tambah">
      <div className="rounded-card bg-surface p-5">
        <label htmlFor="amount" className="block text-xs font-medium uppercase tracking-wide text-ink-faint">
          Jumlah
        </label>
        <div className="mt-1 flex items-baseline gap-2">
          <span className="font-display text-2xl text-ink-faint">Rp</span>
          <input
            id="amount"
            inputMode="numeric"
            autoComplete="off"
            value={amountText}
            onChange={(e) => setAmountText(formatWhileTyping(e.target.value))}
            placeholder="0"
            className="tnum w-full bg-transparent font-display text-4xl text-ink outline-none placeholder:text-ink-faint"
          />
        </div>
      </div>

      <div className="mt-4 rounded-card bg-surface p-5">
        <label htmlFor="merchant" className="block text-xs font-medium uppercase tracking-wide text-ink-faint">
          Beli di mana
        </label>
        <input
          id="merchant"
          autoComplete="off"
          value={merchantName}
          onChange={(e) => setMerchantName(e.target.value)}
          placeholder="Sushi Tei"
          className="mt-1.5 w-full rounded-card border border-line bg-paper px-3.5 py-2.5 text-ink placeholder:text-ink-faint"
        />

        {merchantSuggestions.length > 0 && merchantName.trim() && !matched && (
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {merchantSuggestions.map((m) => (
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
          Lokasi <span className="normal-case tracking-normal">— boleh dikosongin</span>
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
          {ledger.places.map((p) => (
            <option key={p.id} value={p.name} />
          ))}
        </datalist>
      </div>

      <fieldset className="mt-4 rounded-card bg-surface p-5">
        <legend className="text-xs font-medium uppercase tracking-wide text-ink-faint">
          Kategori
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
            Dipilih otomatis dari {matched.name}. Ganti kalau meleset.
          </p>
        )}
      </fieldset>

      {warning && warning.after.state !== 'ok' && categoryName && (
        <p
          className={`mt-4 rounded-card p-4 text-sm ${
            warning.after.state === 'over' ? 'bg-teler-wash text-ink' : 'bg-gula-wash text-ink'
          }`}
        >
          {warning.after.state === 'over' ? (
            <>
              Ini bikin <strong className="font-semibold">{categoryName}</strong> lewat anggaran —{' '}
              <span className="tnum">{formatIdr(-warning.after.remaining)}</span> di atas batas.
            </>
          ) : (
            <>
              Ini bikin <strong className="font-semibold">{categoryName}</strong> jadi{' '}
              {Math.round(warning.after.ratio * 100)}% dari anggaran. Sisa{' '}
              <span className="tnum">{formatIdr(warning.after.remaining)}</span>.
            </>
          )}
        </p>
      )}

      {saveError && <p className="mt-4 text-sm text-teler">{saveError}</p>}

      <button
        type="button"
        onClick={save}
        disabled={!canSave || saving}
        className="mt-5 w-full rounded-pill bg-pandan px-5 py-3.5 font-display text-base text-white disabled:opacity-40"
      >
        {saving ? 'Menyimpan…' : 'Simpan'}
      </button>
    </Screen>
  );
}

/** Groups digits as they are typed, so a long number stays readable. */
function formatWhileTyping(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  return digits ? formatAmount(Number(digits)) : '';
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
