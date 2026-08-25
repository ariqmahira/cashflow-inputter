import { describe, expect, it } from 'vitest';
import {
  inferMissingDates,
  parseDateCell,
  repairAutofillRuns,
  toPlainDate,
} from './dates.mts';

describe('parseDateCell', () => {
  it('reads Excel date cells as calendar days, ignoring the local timezone', () => {
    // exceljs hands back UTC midnight. Reading it with local getters east of Greenwich
    // would report the 15th; west of it, the 13th.
    expect(parseDateCell(new Date('2026-07-14T00:00:00.000Z'))).toBe('2026-07-14');
  });

  it('reads day-first text dates, padded or not', () => {
    expect(parseDateCell('24/12/2024')).toBe('2024-12-24');
    expect(parseDateCell('13/5/2024')).toBe('2024-05-13');
    expect(parseDateCell('  29/12/2024  ')).toBe('2024-12-29');
  });

  it("repairs the stray colon in `'Desember 2024'!H5`", () => {
    expect(parseDateCell('24/12/20:24')).toBe('2024-12-24');
  });

  it('returns null rather than guessing at empty or unintelligible cells', () => {
    expect(parseDateCell(null)).toBeNull();
    expect(parseDateCell('')).toBeNull();
    expect(parseDateCell('kemarin')).toBeNull();
    expect(parseDateCell(45000)).toBeNull();
  });

  it('rejects impossible calendar dates instead of rolling them over', () => {
    expect(parseDateCell('31/02/2025')).toBeNull();
    expect(parseDateCell('32/01/2025')).toBeNull();
    expect(parseDateCell('01/13/2025')).toBeNull();
  });
});

describe('repairAutofillRuns', () => {
  it("flattens the `Juni 2025` run of 14/7/2025 through 14/7/2030", () => {
    const input = [
      '2025-07-14', '2026-07-14', '2027-07-14', '2028-07-14', '2029-07-14', '2030-07-14',
    ];
    const { dates, repaired } = repairAutofillRuns(input);
    expect(dates).toEqual(Array(6).fill('2025-07-14'));
    expect(repaired.size).toBe(5);
  });

  it('leaves genuine consecutive-day spending alone', () => {
    const input = ['2025-11-07', '2025-11-08', '2025-11-09', '2025-11-10'];
    const { dates, repaired } = repairAutofillRuns(input);
    expect(dates).toEqual(input);
    expect(repaired.size).toBe(0);
  });

  it('ignores a two-row coincidence, requiring a run of three', () => {
    const input = ['2024-03-05', '2025-03-05'];
    const { dates, repaired } = repairAutofillRuns(input);
    expect(dates).toEqual(input);
    expect(repaired.size).toBe(0);
  });

  it('does not treat a repeated identical date as a run', () => {
    // `September 2024` has seven consecutive rows all dated 19/10 — one shopping day.
    const input = Array(7).fill('2024-10-19');
    const { dates, repaired } = repairAutofillRuns(input);
    expect(dates).toEqual(input);
    expect(repaired.size).toBe(0);
  });

  it('steps over gaps without joining runs across them', () => {
    const input = ['2025-07-14', null, '2026-07-14', '2027-07-14'];
    const { dates } = repairAutofillRuns(input);
    expect(dates).toEqual(input);
  });
});

describe('inferMissingDates', () => {
  it('leaves real dates untouched and unflagged', () => {
    const out = inferMissingDates(['2026-07-14', '2026-07-18'], 7, 2026);
    expect(out).toEqual([
      { date: '2026-07-14', inferred: false },
      { date: '2026-07-18', inferred: false },
    ]);
  });

  it('inherits from the row above when it is nearest', () => {
    const out = inferMissingDates(['2026-07-14', null, null], 7, 2026);
    expect(out[1]).toMatchObject({ date: '2026-07-14', inferred: true });
    expect(out[2]).toMatchObject({ date: '2026-07-14', inferred: true });
  });

  it('inherits from below when the sheet opens with undated rows', () => {
    // `Agustus 2025` starts this way: seven undated rows before the first real date.
    const out = inferMissingDates([null, null, '2025-09-19'], 8, 2025);
    expect(out[0]).toMatchObject({ date: '2025-09-19', inferred: true });
  });

  it('breaks a tie in favour of the row above', () => {
    const out = inferMissingDates(['2026-01-01', null, '2026-12-31'], 1, 2026);
    expect(out[1]!.date).toBe('2026-01-01');
  });

  it("prefers a neighbour's real date over the sheet's own month", () => {
    // `September 2024` is full of October spending. An undated row there belongs with its
    // neighbours in October, not with the tab it happens to sit on.
    const out = inferMissingDates(['2024-10-19', null], 9, 2024);
    expect(out[1]!.date).toBe('2024-10-19');
  });

  it('borrows from the other column when this one has no dates at all', () => {
    // `Juli 2026`: the income column was entirely undated beside an expense column full of
    // real July dates, and both kas rows landed on 1 July as a result.
    const out = inferMissingDates([null, null], 7, 2026, ['2026-07-14', '2026-07-24', '2026-07-30']);
    expect(out[0]!.date).toBe('2026-07-24');
    expect(out[0]!.inferred).toBe(true);
    expect(out[0]!.note).toContain('elsewhere on the sheet');
  });

  it('prefers a neighbour in its own column over the other column', () => {
    const out = inferMissingDates(['2026-07-20', null], 7, 2026, ['2026-07-01']);
    expect(out[1]!.date).toBe('2026-07-20');
  });

  it('falls back to the first of the sheet month only when nothing is dated', () => {
    // `April 2026`: all thirteen rows undated.
    const out = inferMissingDates([null, null, null], 4, 2026);
    expect(out.every((r) => r.date === toPlainDate(2026, 4, 1))).toBe(true);
    expect(out.every((r) => r.inferred)).toBe(true);
    expect(out[0]!.note).toContain('nothing dated anywhere');
  });
});
