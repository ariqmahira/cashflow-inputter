/**
 * Reimbursements and reclassifications.
 *
 * Money sometimes passes through the pool without being shared spending. Left alone it
 * inflates both the totals and whichever category it landed in — `Hiburan` carries about
 * 4M of it.
 *
 * Reimbursements carry an amount rather than being a bare link, because repayment is not
 * always complete: the Uniqlo purchase cost 1,794,000 and 900,000 came back, so 894,000 of
 * it really was shared spending and should still count against a budget.
 *
 * Every pairing here is hand-verified against the workbook and addressed by cell reference.
 * The heuristic pass only ever *reports* candidates — it never creates a link on its own,
 * because a wrong pairing silently erases real spending.
 */

import type { LegacyRef } from './types.mts';
import type { Member } from './members.mts';

/**
 * A seed addresses rows by cell reference, which is only safe as long as the workbook's
 * rows have not moved. So every reference carries the amount it is expected to find.
 *
 * If a reference is missing the seed simply does not apply — that is what happens against a
 * partial workbook or a test fixture. If a reference is *present but holds a different
 * amount*, the rows have shifted underneath the seed and we would be about to erase the
 * wrong expense. That aborts the migration.
 */
export type SeededRow = { ref: LegacyRef; expect: number };

export type ReimbursementSeed = {
  /** The expense being repaid. */
  expense: SeededRow;
  /** The incoming rows that repaid it. */
  settlements: SeededRow[];
  /** How much came back. May be less than the expense. */
  amount: number;
  note: string;
};

export const SEEDED_REIMBURSEMENTS: ReimbursementSeed[] = [
  {
    expense: { ref: "'September 2024'!H5", expect: 2_877_000 }, // Beli Tiket Boyz II Men
    settlements: [{ ref: "'September 2024'!N6", expect: 2_877_000 }], // Kas Rizka (Beli Tiket)
    amount: 2_877_000,
    note: 'Concert tickets funded in full by an earmarked payment in; net shared cost zero.',
  },
  {
    expense: { ref: "'April 2025'!H11", expect: 1_794_000 }, // Uniqlo
    settlements: [
      { ref: "'April 2025'!N7", expect: 450_000 }, // Bayar 1/2 Uniqlo Ariq
      { ref: "'April 2025'!N8", expect: 450_000 }, // sama kaya di atas
    ],
    amount: 900_000,
    note: 'Half of the Uniqlo purchase repaid in two instalments; 894.000 remains shared spending.',
  },
];

/**
 * Rows whose `kind` is wrong in the source.
 *
 * `Pengembalian Uang Rizka` is booked as an expense but is money going back to Ika, not
 * something bought. It leaves the pool without being spending, so it becomes a negative
 * contribution: the pool balance still drops, no budget is touched, and no category is
 * distorted.
 */
export type Reclassification = {
  ref: LegacyRef;
  /** Guard against row drift, exactly as for reimbursement seeds. */
  expect: number;
  to: 'contribution';
  /** Negative because the money is leaving the pool, not entering it. */
  signedAmount: number;
  member: Member;
  note: string;
};

export const SEEDED_RECLASSIFICATIONS: Reclassification[] = [
  {
    ref: "'September 2024'!H6", // Pengembalian Uang Rizka
    expect: 1_200_000,
    to: 'contribution',
    signedAmount: -1_200_000,
    member: 'Ika',
    note: "Returning Ika's own contributions to the pool; not shared spending.",
  },
];

export type ReimbursementCandidate = {
  expense: LegacyRef;
  settlement: LegacyRef;
  amount: number;
  why: string;
};

/**
 * Suggests further pairings for the report. Deliberately conservative: an incoming row only
 * becomes a candidate when it is NOT an ordinary kas top-up (it has no resolvable member)
 * and its amount exactly matches an expense in the same sheet.
 *
 * Output is advisory. Nothing here is applied.
 */
export function findReimbursementCandidates(
  expenses: { ref: LegacyRef; sheet: string; amount: number }[],
  settlements: { ref: LegacyRef; sheet: string; amount: number; isTopUp: boolean }[],
): ReimbursementCandidate[] {
  const alreadyLinked = new Set(
    SEEDED_REIMBURSEMENTS.flatMap((r) => [r.expense.ref, ...r.settlements.map((s) => s.ref)]),
  );

  const candidates: ReimbursementCandidate[] = [];
  for (const s of settlements) {
    if (s.isTopUp || alreadyLinked.has(s.ref)) continue;
    for (const e of expenses) {
      if (alreadyLinked.has(e.ref)) continue;
      if (e.sheet !== s.sheet || e.amount !== s.amount) continue;
      candidates.push({
        expense: e.ref,
        settlement: s.ref,
        amount: s.amount,
        why: 'non-top-up income exactly matching an expense in the same sheet',
      });
    }
  }
  return candidates;
}
