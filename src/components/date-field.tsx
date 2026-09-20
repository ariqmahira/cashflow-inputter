'use client';

import { addDays, todayLocal, type PlainDate } from '@/lib/plain-date';

/**
 * A date picker that defaults to today and makes yesterday one tap away.
 *
 * Most entries are made the same day, but not all — a receipt found in a pocket, a top-up
 * that arrived while the app was closed. `type="date"` opens the native Android picker and
 * its value is already `YYYY-MM-DD`, which is exactly the shape used everywhere else, so no
 * conversion happens here and no timezone can creep in.
 */
export function DateField({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: PlainDate;
  onChange: (date: PlainDate) => void;
}) {
  const today = todayLocal();
  const yesterday = addDays(today, -1);

  return (
    <div>
      <label htmlFor={id} className="block text-xs font-medium uppercase tracking-wide text-ink-faint">
        {label}
      </label>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        <input
          id={id}
          type="date"
          value={value}
          // Nothing in this ledger happens in the future, and a mistyped year is the most
          // common way a date goes badly wrong.
          max={today}
          onChange={(e) => e.target.value && onChange(e.target.value)}
          className="tnum min-w-0 flex-1 rounded-card border border-line bg-paper px-3.5 py-2.5 text-ink"
        />
        <Quick label="Today" active={value === today} onClick={() => onChange(today)} />
        <Quick label="Yesterday" active={value === yesterday} onClick={() => onChange(yesterday)} />
      </div>
    </div>
  );
}

function Quick({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`shrink-0 rounded-pill px-3 py-2 text-sm transition-colors ${
        active ? 'bg-pandan text-white' : 'bg-sunken text-ink'
      }`}
    >
      {label}
    </button>
  );
}
