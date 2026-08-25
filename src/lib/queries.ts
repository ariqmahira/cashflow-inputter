/**
 * Reads, shaped into what a screen actually needs.
 *
 * These talk to Supabase directly. Phase 4 puts a device database in front of them so the
 * app works offline; keeping every read behind this module is what makes that a change in
 * one place rather than a rewrite.
 */

import { cycleFor, type Cycle } from './cycle';
import { todayLocal, type PlainDate } from './plain-date';
import { supabase } from './supabase';

export type Settings = { cycleAnchorDay: number; warnThreshold: number };

export type Category = { id: string; name: string; sortOrder: number };

export type Merchant = {
  id: string;
  name: string;
  aliases: string[];
  defaultCategoryId: string | null;
};

export type Place = { id: string; name: string; aliases: string[] };

export type Entry = {
  id: string;
  kind: 'expense' | 'contribution' | 'settlement';
  occurredOn: PlainDate;
  dateInferred: boolean;
  amountIdr: number;
  merchantId: string | null;
  placeId: string | null;
  categoryId: string | null;
  memberId: string | null;
  note: string | null;
};

export async function fetchSettings(): Promise<Settings> {
  const { data, error } = await supabase()
    .from('settings')
    .select('cycle_anchor_day, warn_threshold')
    .single();
  if (error) throw error;
  return { cycleAnchorDay: data.cycle_anchor_day, warnThreshold: data.warn_threshold };
}

export async function fetchCategories(): Promise<Category[]> {
  const { data, error } = await supabase()
    .from('categories')
    .select('id, name, sort_order')
    .order('sort_order');
  if (error) throw error;
  return data.map((c) => ({ id: c.id, name: c.name, sortOrder: c.sort_order }));
}

export async function fetchMerchants(): Promise<Merchant[]> {
  const { data, error } = await supabase()
    .from('merchants')
    .select('id, canonical_name, aliases, default_category_id')
    .order('canonical_name');
  if (error) throw error;
  return data.map((m) => ({
    id: m.id,
    name: m.canonical_name,
    aliases: m.aliases ?? [],
    defaultCategoryId: m.default_category_id,
  }));
}

export async function fetchPlaces(): Promise<Place[]> {
  const { data, error } = await supabase()
    .from('places')
    .select('id, canonical_name, aliases')
    .order('canonical_name');
  if (error) throw error;
  return data.map((p) => ({ id: p.id, name: p.canonical_name, aliases: p.aliases ?? [] }));
}

/**
 * Every entry, newest first.
 *
 * Fetching the lot is deliberate: two years of a two-person ledger is a few hundred rows,
 * which is far cheaper to hold in memory than to paginate, and it is exactly what the
 * local-first cache will hold anyway.
 */
export async function fetchEntries(): Promise<Entry[]> {
  const { data, error } = await supabase()
    .from('entries')
    .select(
      'id, kind, occurred_on, date_inferred, amount_idr, merchant_id, place_id, category_id, member_id, note',
    )
    .is('deleted_at', null)
    .order('occurred_on', { ascending: false });
  if (error) throw error;
  return data.map((e) => ({
    id: e.id,
    kind: e.kind,
    occurredOn: e.occurred_on,
    dateInferred: e.date_inferred,
    amountIdr: Number(e.amount_idr),
    merchantId: e.merchant_id,
    placeId: e.place_id,
    categoryId: e.category_id,
    memberId: e.member_id,
    note: e.note,
  }));
}

/** Amounts repaid, keyed by the expense entry they belong to. */
export async function fetchReimbursedByEntry(): Promise<Map<string, number>> {
  const { data, error } = await supabase()
    .from('reimbursements')
    .select('expense_entry_id, amount_idr');
  if (error) throw error;
  return new Map(data.map((r) => [r.expense_entry_id, Number(r.amount_idr)]));
}

export type BudgetLimit = { categoryId: string; amountIdr: number; effectiveFrom: PlainDate };

export async function fetchBudgets(): Promise<BudgetLimit[]> {
  const { data, error } = await supabase()
    .from('budgets')
    .select('category_id, amount_idr, effective_from_cycle')
    .order('effective_from_cycle', { ascending: false });
  if (error) throw error;
  return data.map((b) => ({
    categoryId: b.category_id,
    amountIdr: Number(b.amount_idr),
    effectiveFrom: b.effective_from_cycle,
  }));
}

/**
 * The limit in force for a category during a given cycle: the most recent one that took
 * effect on or before it. Budgets are versioned rather than overwritten so a past cycle
 * keeps the limit it was actually judged against.
 */
export function limitFor(budgets: BudgetLimit[], categoryId: string, cycle: Cycle): number {
  return (
    budgets.find((b) => b.categoryId === categoryId && b.effectiveFrom <= cycle.start)?.amountIdr ?? 0
  );
}

export type Ledger = {
  entries: Entry[];
  reimbursed: Map<string, number>;
  categories: Category[];
  merchants: Merchant[];
  places: Place[];
  budgets: BudgetLimit[];
  settings: Settings;
  today: PlainDate;
  cycle: Cycle;
};

export async function fetchLedger(): Promise<Ledger> {
  const [settings, categories, merchants, places, entries, reimbursed, budgets] = await Promise.all([
    fetchSettings(),
    fetchCategories(),
    fetchMerchants(),
    fetchPlaces(),
    fetchEntries(),
    fetchReimbursedByEntry(),
    fetchBudgets(),
  ]);
  const today = todayLocal();
  return {
    entries,
    reimbursed,
    categories,
    merchants,
    places,
    budgets,
    settings,
    today,
    cycle: cycleFor(today, settings.cycleAnchorDay),
  };
}

/* ---------------------------------------------------------------------------------------
 * Derivations
 *
 * All computed here rather than in SQL, so the same arithmetic serves the online and the
 * offline path and there is only ever one implementation to keep correct.
 * ------------------------------------------------------------------------------------ */

/** What an expense really cost, once repayments are taken off. Never negative. */
export function netCost(entry: Entry, reimbursed: Map<string, number>): number {
  if (entry.kind !== 'expense') return 0;
  return Math.max(0, entry.amountIdr - (reimbursed.get(entry.id) ?? 0));
}

/** Contributions and settlements in, expenses out, all time. */
export function poolBalance(entries: Entry[]): number {
  return entries.reduce((acc, e) => acc + (e.kind === 'expense' ? -e.amountIdr : e.amountIdr), 0);
}

export function inCycle(entry: Entry, cycle: Cycle): boolean {
  return entry.occurredOn >= cycle.start && entry.occurredOn <= cycle.end;
}

/** Spending this cycle, per category, with repaid money removed. */
export function spendingByCategory(
  entries: Entry[],
  reimbursed: Map<string, number>,
  cycle: Cycle,
): Map<string, number> {
  const totals = new Map<string, number>();
  for (const e of entries) {
    if (e.kind !== 'expense' || !e.categoryId || !inCycle(e, cycle)) continue;
    totals.set(e.categoryId, (totals.get(e.categoryId) ?? 0) + netCost(e, reimbursed));
  }
  return totals;
}

export function cycleSpending(entries: Entry[], reimbursed: Map<string, number>, cycle: Cycle): number {
  return entries
    .filter((e) => e.kind === 'expense' && inCycle(e, cycle))
    .reduce((acc, e) => acc + netCost(e, reimbursed), 0);
}

export function cycleContributions(entries: Entry[], cycle: Cycle): number {
  return entries
    .filter((e) => e.kind !== 'expense' && inCycle(e, cycle))
    .reduce((acc, e) => acc + e.amountIdr, 0);
}
