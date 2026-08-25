/**
 * Cycles — the budget period.
 *
 * The kas refills when the two of them top it up, historically anywhere from the 18th to the
 * 26th, so budgets run anchor-day to anchor-day rather than over a calendar month. A cycle
 * anchored on the 18th runs 18 Jan to 17 Feb.
 *
 * The anchor sits at the early end of that spread on purpose. A top-up arriving *before* the
 * anchor funds the cycle that is ending rather than the one starting, which is the wrong way
 * round — so the anchor belongs below the earliest top-up, not on the most common one.
 *
 * The anchor is clamped to 28 on purpose. An anchor of 30 or 31 would have no valid start
 * date in February, and every rule for handling that ("clamp to the last day", "skip the
 * month") makes some cycle a different length for a reason no one would remember. 1–28
 * always exists in every month.
 */

import {
  addDays,
  daysBetween,
  plainDateParts,
  toPlainDate,
  type PlainDate,
} from './plain-date.ts';

/**
 * The 18th, not the 25th.
 *
 * The 25th is the single most common top-up day, but 32 of 57 top-ups land before it — and
 * with an anchor of 25 those fund the cycle that is ending rather than the one starting. At
 * 18 every top-up on record falls inside the cycle it pays for.
 *
 * This is only the fallback for when settings have not loaded; the stored
 * `settings.cycle_anchor_day` is the real answer.
 */
export const DEFAULT_ANCHOR_DAY = 18;
export const MAX_ANCHOR_DAY = 28;

export type Cycle = {
  /** First day of the cycle, inclusive. */
  start: PlainDate;
  /** Last day of the cycle, inclusive. */
  end: PlainDate;
  /** Stable identifier, the start date. Safe as a database key or a URL segment. */
  id: string;
};

export function clampAnchorDay(day: number): number {
  if (!Number.isFinite(day)) return DEFAULT_ANCHOR_DAY;
  return Math.min(MAX_ANCHOR_DAY, Math.max(1, Math.trunc(day)));
}

function anchorInMonth(year: number, month: number, anchor: number): PlainDate {
  return toPlainDate(year, month, anchor);
}

function previousMonth(year: number, month: number): { year: number; month: number } {
  return month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
}

function nextMonth(year: number, month: number): { year: number; month: number } {
  return month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };
}

/** The cycle containing `date`. */
export function cycleFor(date: PlainDate, anchorDay: number = DEFAULT_ANCHOR_DAY): Cycle {
  const anchor = clampAnchorDay(anchorDay);
  const { year, month, day } = plainDateParts(date);

  const startMonth = day >= anchor ? { year, month } : previousMonth(year, month);
  const start = anchorInMonth(startMonth.year, startMonth.month, anchor);

  const after = nextMonth(startMonth.year, startMonth.month);
  const end = addDays(anchorInMonth(after.year, after.month, anchor), -1);

  return { start, end, id: start };
}

export function nextCycle(cycle: Cycle, anchorDay: number = DEFAULT_ANCHOR_DAY): Cycle {
  return cycleFor(addDays(cycle.end, 1), anchorDay);
}

export function previousCycle(cycle: Cycle, anchorDay: number = DEFAULT_ANCHOR_DAY): Cycle {
  return cycleFor(addDays(cycle.start, -1), anchorDay);
}

export function cycleLengthDays(cycle: Cycle): number {
  return daysBetween(cycle.start, cycle.end) + 1;
}

export function isWithinCycle(date: PlainDate, cycle: Cycle): boolean {
  return date >= cycle.start && date <= cycle.end;
}

/**
 * How far through the cycle `today` is, 0 to 1.
 *
 * Counts elapsed days inclusively: on the first day of a cycle you have already used one of
 * its days, so a budget is not "0% through" until before it starts.
 */
export function cycleProgress(today: PlainDate, cycle: Cycle): number {
  if (today < cycle.start) return 0;
  if (today > cycle.end) return 1;
  return (daysBetween(cycle.start, today) + 1) / cycleLengthDays(cycle);
}

export type BudgetState = 'ok' | 'warn' | 'over';

export type BudgetStatus = {
  spent: number;
  limit: number;
  /** Spent over limit. Can exceed 1. */
  ratio: number;
  remaining: number;
  state: BudgetState;
};

/**
 * Where a category stands against its limit.
 *
 * `warn` fires at or above the threshold but below the limit; `over` at or above the limit.
 * A limit of zero means "no budget set" rather than "spend nothing", so it never warns.
 */
export function budgetStatus(spent: number, limit: number, warnThreshold = 0.8): BudgetStatus {
  if (limit <= 0) {
    return { spent, limit, ratio: 0, remaining: 0, state: 'ok' };
  }
  const ratio = spent / limit;
  const state: BudgetState = ratio >= 1 ? 'over' : ratio >= warnThreshold ? 'warn' : 'ok';
  return { spent, limit, ratio, remaining: limit - spent, state };
}

/**
 * What saving this entry would do to its budget — the warning shown at the moment of entry,
 * which is the only moment it can still change a decision.
 */
export function budgetAfterAdding(
  amount: number,
  spent: number,
  limit: number,
  warnThreshold = 0.8,
): { before: BudgetStatus; after: BudgetStatus; crosses: boolean } {
  const before = budgetStatus(spent, limit, warnThreshold);
  const after = budgetStatus(spent + amount, limit, warnThreshold);
  return { before, after, crosses: before.state !== after.state && after.state !== 'ok' };
}

/** Average spend per elapsed day in the cycle. */
export function burnRate(spentThisCycle: number, today: PlainDate, cycle: Cycle): number {
  const elapsed = Math.max(1, daysBetween(cycle.start, today) + 1);
  return spentThisCycle / elapsed;
}

/**
 * The day the pool is projected to hit zero at the current burn rate.
 *
 * Returns null when the pool is already empty or nothing is being spent — in both cases a
 * projection would be a fabrication rather than a forecast.
 */
export function projectedRunDry(
  balance: number,
  ratePerDay: number,
  today: PlainDate,
): PlainDate | null {
  if (balance <= 0 || ratePerDay <= 0) return null;
  return addDays(today, Math.ceil(balance / ratePerDay));
}
