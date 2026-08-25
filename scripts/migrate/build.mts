/**
 * Composes the whole migration: raw workbook in, clean entries plus an audit trail out.
 *
 * Order matters and is load-bearing:
 *   1. reconcile the raw parse   — before anything is changed, prove nothing was lost
 *   2. canonicalize merchants and places
 *   3. repair and infer dates    — per sheet, in row order
 *   4. derive categories         — from the merchant, never from the sheet's own column
 *   5. reclassify and reimburse  — hand-verified corrections only
 */

import { deriveCategory, type Category, type CategoryDerivation } from './categories.mts';
import { inferMissingDates, parseDateCell, repairAutofillRuns, type PlainDate } from './dates.mts';
import { buildMerchantIndex, type MerchantIndex } from './merchants.mts';
import { resolveMember, type Member } from './members.mts';
import { buildPlaceIndex, type PlaceIndex } from './places.mts';
import { assertReconciles, reconcile, type Reconciliation } from './reconcile.mts';
import {
  findReimbursementCandidates,
  SEEDED_RECLASSIFICATIONS,
  SEEDED_REIMBURSEMENTS,
  type ReimbursementCandidate,
  type SeededRow,
} from './reimbursements.mts';
import { tidyDisplay } from './text.mts';
import type { LegacyRef, ParsedWorkbook } from './types.mts';

export type EntryKind = 'expense' | 'contribution' | 'settlement';

export type MigratedEntry = {
  legacyRef: LegacyRef;
  kind: EntryKind;
  occurredOn: PlainDate;
  dateInferred: boolean;
  /** Rupiah. Negative only on a contribution that took money back out of the pool. */
  amountIdr: number;
  merchant: string | null;
  place: string | null;
  category: Category | null;
  member: Member | null;
  note: string | null;
};

export type MigratedReimbursement = {
  expense: LegacyRef;
  settlements: LegacyRef[];
  amountIdr: number;
  note: string;
};

export type Discard = {
  legacyRef: LegacyRef;
  reason: string;
  raw: Record<string, unknown>;
};

export type CategoryChange = {
  legacyRef: LegacyRef;
  merchant: string;
  from: string | null;
  to: Category;
  confidence: CategoryDerivation['confidence'];
};

export type MigrationResult = {
  reconciliation: Reconciliation;
  entries: MigratedEntry[];
  reimbursements: MigratedReimbursement[];
  discards: Discard[];
  categoryChanges: CategoryChange[];
  reimbursementCandidates: ReimbursementCandidate[];
  /** Hand-verified seeds whose rows are absent from this workbook. */
  skippedSeeds: string[];
  merchants: MerchantIndex;
  places: PlaceIndex;
  /** Contribution rows whose owner could not be determined. */
  unattributed: LegacyRef[];
  stats: {
    expenses: number;
    contributions: number;
    settlements: number;
    datesInferred: number;
    autofillRepaired: number;
  };
};

const isAmount = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

export function buildMigration(wb: ParsedWorkbook): MigrationResult {
  // 1. Prove the parse before trusting anything downstream.
  const reconciliation = reconcile(wb);
  assertReconciles(reconciliation);

  // 2. Canonical names, built from the whole workbook so every sheet agrees.
  const merchants = buildMerchantIndex(
    wb.sheets.flatMap((s) => s.expenses.map((e) => e.name)).filter((n): n is string => typeof n === 'string'),
  );
  const places = buildPlaceIndex(wb.sheets.flatMap((s) => s.expenses.map((e) => e.place)));

  const settlementRefs = new Set(
    SEEDED_REIMBURSEMENTS.flatMap((r) => r.settlements.map((s) => s.ref)),
  );
  const reclassifyByRef = new Map(SEEDED_RECLASSIFICATIONS.map((r) => [r.ref, r]));

  const entries: MigratedEntry[] = [];
  const discards: Discard[] = [];
  const categoryChanges: CategoryChange[] = [];
  const unattributed: LegacyRef[] = [];
  let autofillRepaired = 0;

  for (const sheet of wb.sheets) {
    // 3. Dates, per sheet and in row order — inference reads neighbouring rows.
    const expenseDates = repairAutofillRuns(sheet.expenses.map((e) => parseDateCell(e.date)));
    autofillRepaired += expenseDates.repaired.size;
    const expenseResolved = inferMissingDates(expenseDates.dates, sheet.month, sheet.year);

    const incomeDates = repairAutofillRuns(sheet.incomes.map((i) => parseDateCell(i.date)));
    autofillRepaired += incomeDates.repaired.size;
    const incomeResolved = inferMissingDates(incomeDates.dates, sheet.month, sheet.year);

    sheet.expenses.forEach((raw, i) => {
      const name = typeof raw.name === 'string' ? tidyDisplay(raw.name) : '';

      if (!isAmount(raw.amount)) {
        discards.push({
          legacyRef: raw.legacyRef,
          reason: name ? 'has a name but no amount' : 'no amount and no name',
          raw: { date: raw.date, name: raw.name, place: raw.place, category: raw.category },
        });
        return;
      }
      if (raw.amount === 0) {
        discards.push({
          legacyRef: raw.legacyRef,
          reason: 'amount is zero',
          raw: { name: raw.name, place: raw.place },
        });
        return;
      }

      const date = expenseResolved[i];
      const autofillNote = expenseDates.repaired.get(i);
      const placed = places.resolve(raw.place);

      // A hand-verified reclassification: this row is not spending at all.
      const reclass = reclassifyByRef.get(raw.legacyRef);
      if (reclass && raw.amount !== reclass.expect) {
        throw new Error(
          `Seeded reclassification ${reclass.ref}: expected ${reclass.expect.toLocaleString()} ` +
            `but found ${raw.amount.toLocaleString()}. The workbook has shifted; applying this ` +
            'seed would alter the wrong entry. Update the seeds in reimbursements.mts.',
        );
      }
      if (reclass) {
        entries.push({
          legacyRef: raw.legacyRef,
          kind: reclass.to,
          occurredOn: date.date!,
          dateInferred: date.inferred,
          amountIdr: reclass.signedAmount,
          merchant: null,
          place: null,
          category: null,
          member: reclass.member,
          note: [name, reclass.note].filter(Boolean).join(' — '),
        });
        return;
      }

      const merchant = merchants.lookup.get(name) ?? (name || null);
      const derived = merchant ? deriveCategory(merchant) : ({ category: 'Lainnya', confidence: 'fallback' } as CategoryDerivation);
      const originalCategory = typeof raw.category === 'string' ? tidyDisplay(raw.category) : null;

      if (originalCategory !== derived.category) {
        categoryChanges.push({
          legacyRef: raw.legacyRef,
          merchant: merchant ?? '(unnamed)',
          from: originalCategory,
          to: derived.category,
          confidence: derived.confidence,
        });
      }

      entries.push({
        legacyRef: raw.legacyRef,
        kind: 'expense',
        occurredOn: date.date!,
        dateInferred: date.inferred,
        amountIdr: raw.amount,
        merchant,
        place: placed.place,
        category: derived.category,
        member: null,
        note: [date.note, autofillNote, placed.note].filter(Boolean).join('; ') || null,
      });
    });

    sheet.incomes.forEach((raw, i) => {
      if (!isAmount(raw.amount) || raw.amount === 0) {
        if (raw.name || raw.date) {
          discards.push({
            legacyRef: raw.legacyRef,
            reason: 'income row with no usable amount',
            raw: { date: raw.date, name: raw.name },
          });
        }
        return;
      }

      const date = incomeResolved[i];
      const name = typeof raw.name === 'string' ? tidyDisplay(raw.name) : '';
      const isSettlement = settlementRefs.has(raw.legacyRef);
      const member = resolveMember(raw.name);

      if (!isSettlement && !member) unattributed.push(raw.legacyRef);

      entries.push({
        legacyRef: raw.legacyRef,
        kind: isSettlement ? 'settlement' : 'contribution',
        occurredOn: date.date!,
        dateInferred: date.inferred,
        amountIdr: raw.amount,
        merchant: null,
        place: null,
        category: null,
        member: isSettlement ? null : member,
        note: [name, date.note].filter(Boolean).join(' — ') || null,
      });
    });
  }

  // 5. Reimbursement links, plus advisory candidates for anything not hand-verified.
  //
  // A seed whose rows are absent simply does not apply. A seed whose row is present but
  // holds a different amount means the workbook shifted under it, and applying it would
  // erase the wrong expense — so that aborts.
  const byRef = new Map(entries.map((e) => [e.legacyRef, e]));
  const skippedSeeds: string[] = [];

  const seedApplies = (rows: SeededRow[], what: string): boolean => {
    const present = rows.filter((r) => byRef.has(r.ref));
    if (present.length === 0) return false;
    if (present.length !== rows.length) {
      throw new Error(
        `${what}: some referenced rows exist and some do not. The workbook has shifted; ` +
          'update the seeds in reimbursements.mts.',
      );
    }
    for (const r of rows) {
      const found = Math.abs(byRef.get(r.ref)!.amountIdr);
      if (found !== r.expect) {
        throw new Error(
          `${what}: expected ${r.expect.toLocaleString()} at ${r.ref} but found ` +
            `${found.toLocaleString()}. The workbook has shifted; applying this seed would ` +
            'alter the wrong entry. Update the seeds in reimbursements.mts.',
        );
      }
    }
    return true;
  };

  const reimbursements: MigratedReimbursement[] = [];
  for (const seed of SEEDED_REIMBURSEMENTS) {
    const what = `Seeded reimbursement ${seed.expense.ref}`;
    if (!seedApplies([seed.expense, ...seed.settlements], what)) {
      skippedSeeds.push(what);
      continue;
    }
    reimbursements.push({
      expense: seed.expense.ref,
      settlements: seed.settlements.map((s) => s.ref),
      amountIdr: seed.amount,
      note: seed.note,
    });
  }

  const reimbursementCandidates = findReimbursementCandidates(
    entries
      .filter((e) => e.kind === 'expense')
      .map((e) => ({ ref: e.legacyRef, sheet: e.legacyRef.split('!')[0], amount: e.amountIdr })),
    entries
      .filter((e) => e.kind === 'contribution' || e.kind === 'settlement')
      .map((e) => ({
        ref: e.legacyRef,
        sheet: e.legacyRef.split('!')[0],
        amount: e.amountIdr,
        isTopUp: e.kind === 'contribution' && e.member !== null && e.amountIdr > 0,
      })),
  );

  return {
    reconciliation,
    entries,
    reimbursements,
    discards,
    categoryChanges,
    reimbursementCandidates,
    skippedSeeds,
    merchants,
    places,
    unattributed,
    stats: {
      expenses: entries.filter((e) => e.kind === 'expense').length,
      contributions: entries.filter((e) => e.kind === 'contribution').length,
      settlements: entries.filter((e) => e.kind === 'settlement').length,
      datesInferred: entries.filter((e) => e.dateInferred).length,
      autofillRepaired,
    },
  };
}

/**
 * Pool Balance: contributions and settlements in, expenses out. Reimbursed money is NOT
 * subtracted here — it genuinely left the pool and came back, and both movements are
 * already present as separate entries.
 */
export function poolBalance(entries: MigratedEntry[]): number {
  return entries.reduce(
    (acc, e) => acc + (e.kind === 'expense' ? -e.amountIdr : e.amountIdr),
    0,
  );
}

/**
 * What a category really cost, with repaid money removed. This is what budgets consume and
 * what the spending charts show.
 */
export function spendingByCategory(
  entries: MigratedEntry[],
  reimbursements: MigratedReimbursement[],
): Map<Category, number> {
  const repaid = new Map<LegacyRef, number>();
  for (const r of reimbursements) repaid.set(r.expense, (repaid.get(r.expense) ?? 0) + r.amountIdr);

  const totals = new Map<Category, number>();
  for (const e of entries) {
    if (e.kind !== 'expense' || !e.category) continue;
    const net = Math.max(0, e.amountIdr - (repaid.get(e.legacyRef) ?? 0));
    totals.set(e.category, (totals.get(e.category) ?? 0) + net);
  }
  return totals;
}
