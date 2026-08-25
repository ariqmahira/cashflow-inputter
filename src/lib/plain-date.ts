/**
 * A calendar date with no time and no timezone.
 *
 * The app deals in days, not instants: a purchase happened on the 14th, and it stays the
 * 14th whether you open the app in Jakarta or on a plane. Using `Date` for this invites a
 * whole class of off-by-one bugs, because a `Date` is a UTC instant and any local getter
 * shifts the calendar day either side of midnight.
 *
 * So dates are `YYYY-MM-DD` strings end to end — they sort correctly as strings, compare
 * with `===`, and survive JSON without a serializer.
 */

export type PlainDate = string;

const pad = (n: number) => String(n).padStart(2, '0');

export function toPlainDate(year: number, month: number, day: number): PlainDate {
  return `${year}-${pad(month)}-${pad(day)}`;
}

export function plainDateParts(d: PlainDate): { year: number; month: number; day: number } {
  const [year, month, day] = d.split('-').map(Number);
  return { year, month, day };
}

/** True only for dates that exist. `2025-02-31` does not. */
export function isRealDate(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const d = new Date(Date.UTC(year, month - 1, day));
  return d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day;
}

/** Days since the epoch. For measuring distance, never for display. */
export function plainDateToOrdinal(d: PlainDate): number {
  const { year, month, day } = plainDateParts(d);
  return Math.floor(Date.UTC(year, month - 1, day) / 86_400_000);
}

export function ordinalToPlainDate(ordinal: number): PlainDate {
  const d = new Date(ordinal * 86_400_000);
  return toPlainDate(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

export function addDays(d: PlainDate, days: number): PlainDate {
  return ordinalToPlainDate(plainDateToOrdinal(d) + days);
}

/** Whole days from `a` to `b`. Negative when `b` is earlier. */
export function daysBetween(a: PlainDate, b: PlainDate): number {
  return plainDateToOrdinal(b) - plainDateToOrdinal(a);
}

/** Reads a `Date` as a calendar day in UTC, which is how spreadsheet dates arrive. */
export function fromUtcDate(d: Date): PlainDate {
  return toPlainDate(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

/** Today, in the viewer's own timezone — the only place local time is the right answer. */
export function todayLocal(now: Date = new Date()): PlainDate {
  return toPlainDate(now.getFullYear(), now.getMonth() + 1, now.getDate());
}
