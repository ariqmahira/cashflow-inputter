import { describe, expect, it } from 'vitest';
import { buildMigration, poolBalance, spendingByCategory } from './build.mts';
import type { ParsedSheet, ParsedWorkbook, RawCell } from './types.mts';

type ExpenseSpec = [date: RawCell, name: RawCell, place: RawCell, category: RawCell, amount: RawCell];
type IncomeSpec = [date: RawCell, name: RawCell, category: RawCell, amount: RawCell];

/**
 * Builds a workbook whose cached totals agree with its rows, so tests start from a state
 * that reconciles and only the case under test deviates.
 */
function sheet(
  title: string,
  month: number,
  year: number,
  expenses: ExpenseSpec[],
  incomes: IncomeSpec[] = [],
  overrideTotals?: { expense?: number; income?: number },
): ParsedSheet {
  const num = (v: RawCell) => (typeof v === 'number' ? v : 0);
  return {
    title,
    month,
    year,
    totals: {
      totalsRow: 30,
      expense: overrideTotals?.expense ?? expenses.reduce((a, e) => a + num(e[4]), 0),
      income: overrideTotals?.income ?? incomes.reduce((a, i) => a + num(i[3]), 0),
    },
    expenses: expenses.map(([date, name, place, category, amount], i) => ({
      sheet: title,
      row: 5 + i,
      legacyRef: `'${title}'!H${5 + i}`,
      date,
      name,
      place,
      category,
      amount,
    })),
    incomes: incomes.map(([date, name, category, amount], i) => ({
      sheet: title,
      row: 5 + i,
      legacyRef: `'${title}'!N${5 + i}`,
      date,
      name,
      category,
      amount,
    })),
  };
}

const workbook = (...sheets: ParsedSheet[]): ParsedWorkbook => ({ sourceFile: 'test.xlsx', sheets });

describe('reconciliation gate', () => {
  it('aborts when a sheet disagrees with its own cached total', () => {
    const wb = workbook(
      sheet('Januari 2025', 1, 2025, [['05/01/2025', 'Chagee', 'GI', 'Makan', 50_000]], [], {
        expense: 60_000,
      }),
    );
    expect(() => buildMigration(wb)).toThrow(/Reconciliation FAILED/);
  });

  it('names the offending sheet and the size of the gap', () => {
    const wb = workbook(
      sheet('Januari 2025', 1, 2025, [['05/01/2025', 'Chagee', 'GI', 'Makan', 50_000]], [], {
        expense: 60_000,
      }),
    );
    expect(() => buildMigration(wb)).toThrow(/Januari 2025.*-10\.000|Januari 2025.*-10,000/s);
  });

  it('passes when the rows add up', () => {
    const wb = workbook(sheet('Januari 2025', 1, 2025, [['05/01/2025', 'Chagee', 'GI', 'Makan', 50_000]]));
    expect(buildMigration(wb).reconciliation.ok).toBe(true);
  });

  it('is unaffected by rows that are later discarded, since they carry no money', () => {
    const wb = workbook(
      sheet('Januari 2025', 1, 2025, [
        ['05/01/2025', 'Chagee', 'GI', 'Makan', 50_000],
        [null, null, null, 'Makan', null], // orphan
        ['05/01/2025', 'Taichan', 'Blok M', 'Makan', 0], // zero
      ]),
    );
    const m = buildMigration(wb);
    expect(m.reconciliation.ok).toBe(true);
    expect(m.discards).toHaveLength(2);
    expect(m.stats.expenses).toBe(1);
  });
});

describe('reimbursements', () => {
  /** Reproduces the two real pass-throughs at their actual cell references. */
  const realWorkbook = () =>
    workbook(
      sheet(
        'September 2024',
        9,
        2024,
        [
          ['24/09/2024', 'Beli Tiket Boyz II Men', null, 'Hiburan', 2_877_000], // H5
          ['24/09/2024', 'Pengembalian Uang Rizka', null, 'Hiburan', 1_200_000], // H6
        ],
        [
          ['23/09/2024', 'Kas Ariq', 'Kas', 600_000], // N5
          ['24/09/2024', 'Kas Rizka (Beli Tiket)', 'Kas', 2_877_000], // N6
        ],
      ),
      sheet(
        'April 2025',
        4,
        2025,
        [
          ['21/04/2025', 'Kipas Boyz II Men', null, 'Hiburan', 35_000], // H5
          ['21/04/2025', 'Shihlin', 'GI', 'Makan', 50_000], // H6
          ['21/04/2025', 'Air Mineral', 'GI', 'Makan', 15_000], // H7
          ['21/04/2025', 'Tebu', 'GI', 'Makan', 50_000], // H8
          ['21/04/2025', 'Sie Long Bao', 'GI', 'Makan', 252_000], // H9
          ['21/04/2025', 'Payakumbuah', 'GI', 'Makan', 205_326], // H10
          ['21/04/2025', 'Uniqlo', 'GI', 'Hadiah', 1_794_000], // H11
        ],
        [
          ['21/04/2025', 'Kas Ariq', 'Kas', 600_000], // N5
          ['25/04/2025', 'Kas Pacarnya Ariq', 'Kas', 600_000], // N6
          ['06/01/2025', 'Bayar 1/2 Uniqlo Ariq', 'Kas', 450_000], // N7
          ['06/01/2025', 'sama kaya di atas', 'Kas', 450_000], // N8
        ],
      ),
    );

  it('removes a fully repaid expense from category spending', () => {
    const m = buildMigration(realWorkbook());
    const spend = spendingByCategory(m.entries, m.reimbursements);
    // The 2.877.000 of tickets cost the pool nothing; only the 35.000 fan remains.
    expect(spend.get('Hiburan')).toBe(35_000);
  });

  it('keeps the unrepaid remainder of a partial reimbursement as real spending', () => {
    const m = buildMigration(realWorkbook());
    const spend = spendingByCategory(m.entries, m.reimbursements);
    expect(spend.get('Belanja')).toBe(1_794_000 - 900_000); // 894.000
  });

  it('books the repayments as settlements rather than contributions', () => {
    const m = buildMigration(realWorkbook());
    expect(m.stats.settlements).toBe(3);
    const settlements = m.entries.filter((e) => e.kind === 'settlement');
    expect(settlements.every((s) => s.member === null)).toBe(true);
  });

  it('reclassifies the Rizka repayment as a negative contribution, not spending', () => {
    const m = buildMigration(realWorkbook());
    const entry = m.entries.find((e) => e.legacyRef === "'September 2024'!H6")!;
    expect(entry.kind).toBe('contribution');
    expect(entry.amountIdr).toBe(-1_200_000);
    expect(entry.member).toBe('Ika');
    expect(entry.category).toBeNull();
  });

  it('keeps the pool balance identical to the raw net', () => {
    // Reclassifying and reimbursing move money between concepts; they must never create or
    // destroy any.
    const m = buildMigration(realWorkbook());
    expect(poolBalance(m.entries)).toBe(m.reconciliation.totals.net);
  });

  it('proposes no candidates when every pass-through is already hand-verified', () => {
    expect(buildMigration(realWorkbook()).reimbursementCandidates).toHaveLength(0);
  });

  it('skips a seed whose rows are absent, rather than failing', () => {
    // A workbook that simply does not contain those months is not an error.
    const wb = workbook(sheet('Januari 2025', 1, 2025, [['05/01/2025', 'Chagee', 'GI', 'Makan', 50_000]]));
    const m = buildMigration(wb);
    expect(m.reimbursements).toHaveLength(0);
    expect(m.skippedSeeds).toHaveLength(2);
  });

  it('aborts when a seeded row exists but holds a different amount', () => {
    // This is the dangerous case: the rows shifted, so the reference now points at some
    // other purchase, and applying the seed would erase the wrong expense.
    const wb = workbook(
      sheet(
        'September 2024',
        9,
        2024,
        [
          ['24/09/2024', 'Yoshinoya', 'GI', 'Makan', 122_000], // H5 — no longer the tickets
          ['24/09/2024', 'Pengembalian Uang Rizka', null, 'Hiburan', 1_200_000],
        ],
        [
          ['23/09/2024', 'Kas Ariq', 'Kas', 600_000],
          ['24/09/2024', 'Kas Rizka (Beli Tiket)', 'Kas', 2_877_000],
        ],
      ),
    );
    expect(() => buildMigration(wb)).toThrow(/expected 2.877.000 at 'September 2024'!H5/);
  });

  it('aborts when a reclassified row holds a different amount', () => {
    const wb = workbook(
      sheet('September 2024', 9, 2024, [
        ['24/09/2024', 'Beli Tiket Boyz II Men', null, 'Hiburan', 2_877_000],
        ['24/09/2024', 'Something Else', null, 'Makan', 45_000], // H6 — not the repayment
      ]),
    );
    expect(() => buildMigration(wb)).toThrow(/Seeded reclassification .*expected 1.200.000/);
  });
});

describe('members', () => {
  it('resolves every spelling of the two members', () => {
    const wb = workbook(
      sheet(
        'Januari 2026',
        1,
        2026,
        [['05/01/2026', 'Chagee', 'GI', 'Makan', 50_000]],
        [
          ['24/01/2026', 'Kas Ariq', 'Kas', 700_000],
          ['24/01/2026', 'Ika Cantik', 'Kas', 500_000],
          ['24/01/2026', 'Kas Pacarnya Ariq', 'Kas', 500_000],
          ['24/01/2026', 'Kas Rizka', 'Kas', 600_000],
        ],
      ),
    );
    const m = buildMigration(wb);
    expect(m.unattributed).toHaveLength(0);
    const members = m.entries.filter((e) => e.kind === 'contribution').map((e) => e.member);
    expect(members).toEqual(['Ariq', 'Ika', 'Ika', 'Ika']);
  });
});

describe('dates through the whole pipeline', () => {
  it('flags inferred dates and leaves real ones unflagged', () => {
    const wb = workbook(
      sheet('Juli 2026', 7, 2026, [
        ['14/07/2026', 'Sushi Blok M', 'Blok M', 'Makan', 260_700],
        [null, 'Mie Aceh', null, null, 105_000],
      ]),
    );
    const m = buildMigration(wb);
    expect(m.entries[0]).toMatchObject({ occurredOn: '2026-07-14', dateInferred: false });
    expect(m.entries[1]).toMatchObject({ occurredOn: '2026-07-14', dateInferred: true });
    expect(m.stats.datesInferred).toBe(1);
  });

  it('derives a category for a row the sheet left uncategorized', () => {
    const wb = workbook(sheet('Juli 2026', 7, 2026, [[null, 'Mie Aceh', null, null, 105_000]]));
    // `mie` and `aceh` both imply a meal, even with the sheet's own column blank.
    expect(buildMigration(wb).entries[0].category).toBe('Restoran');
  });
});
