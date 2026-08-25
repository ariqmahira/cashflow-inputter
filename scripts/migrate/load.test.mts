/**
 * End-to-end load test: workbook fixture → migration pipeline → real Postgres (pglite).
 *
 * This is the closest thing to a rehearsal of the actual migration that can run without a
 * database to provision, and it is where the two halves meet — the pipeline's idea of the
 * data and the schema's idea of it.
 */

import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it } from 'vitest';

import { buildMigration, poolBalance } from './build.mts';
import { load, verifyLoad, type LoadInput } from './load.mts';
import type { ParsedSheet, ParsedWorkbook, RawCell } from './types.mts';

const MIGRATIONS = resolve(dirname(fileURLToPath(import.meta.url)), '../../supabase/migrations');

async function freshDb(): Promise<PGlite> {
  const db = new PGlite();
  for (const f of ['0001_init.sql', '0003_seed.sql']) {
    await db.exec(await readFile(resolve(MIGRATIONS, f), 'utf8'));
  }
  return db;
}

type ExpenseSpec = [RawCell, RawCell, RawCell, RawCell, RawCell];
type IncomeSpec = [RawCell, RawCell, RawCell, RawCell];

function sheet(
  title: string,
  month: number,
  year: number,
  expenses: ExpenseSpec[],
  incomes: IncomeSpec[] = [],
): ParsedSheet {
  const num = (v: RawCell) => (typeof v === 'number' ? v : 0);
  return {
    title,
    month,
    year,
    totals: {
      totalsRow: 30,
      expense: expenses.reduce((a, e) => a + num(e[4]), 0),
      income: incomes.reduce((a, i) => a + num(i[3]), 0),
    },
    expenses: expenses.map(([date, name, place, category, amount], i) => ({
      sheet: title, row: 5 + i, legacyRef: `'${title}'!H${5 + i}`, date, name, place, category, amount,
    })),
    incomes: incomes.map(([date, name, category, amount], i) => ({
      sheet: title, row: 5 + i, legacyRef: `'${title}'!N${5 + i}`, date, name, category, amount,
    })),
  };
}

/** A miniature of the real workbook, including both pass-through cases. */
const fixture = (): ParsedWorkbook => ({
  sourceFile: 'fixture.xlsx',
  sheets: [
    sheet(
      'September 2024',
      9,
      2024,
      [
        ['24/09/2024', 'Beli Tiket Boyz II Men', null, 'Hiburan', 2_877_000], // H5
        ['24/09/2024', 'Pengembalian Uang Rizka', null, 'Hiburan', 1_200_000], // H6
        ['24/09/2024', 'Yoshinoya', 'GI', 'Makan', 122_000], // H7
        [null, 'Chagee', 'Grand Indonesia', 'Makan', 49_000], // H8 — undated
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
        ['21/04/2025', 'Gocar', null, 'Hiburan', 32_000], // H5 — miscategorized in source
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
  ],
});

const toInput = (m: ReturnType<typeof buildMigration>): LoadInput => ({
  entries: m.entries,
  reimbursements: m.reimbursements,
  merchants: m.merchants.clusters,
  places: m.places.clusters,
});

describe('load', () => {
  let db: PGlite;
  let migration: ReturnType<typeof buildMigration>;

  beforeEach(async () => {
    db = await freshDb();
    migration = buildMigration(fixture());
  });

  it('loads every entry', async () => {
    const report = await load(db, toInput(migration));
    expect(report.entries).toBe(migration.entries.length);
  });

  it('agrees with the pipeline about the pool balance', async () => {
    const report = await load(db, toInput(migration));
    expect(report.poolBalanceIdr).toBe(poolBalance(migration.entries));
  });

  it('passes its own verification', async () => {
    await load(db, toInput(migration));
    await expect(
      verifyLoad(db, {
        entries: migration.entries.length,
        poolBalanceIdr: poolBalance(migration.entries),
      }),
    ).resolves.toBeUndefined();
  });

  it('reports a mismatch rather than passing quietly', async () => {
    await load(db, toInput(migration));
    await expect(verifyLoad(db, { entries: 999, poolBalanceIdr: 0 })).rejects.toThrow(
      /Load verification FAILED/,
    );
  });

  it('is idempotent — a second run updates rather than duplicates', async () => {
    const first = await load(db, toInput(migration));
    const second = await load(db, toInput(migration));
    expect(second).toEqual(first);
  });

  it('recovers from an interrupted run by simply running again', async () => {
    // Simulates the process dying partway: some entries written, reimbursements not yet
    // reached. Re-running with the full input must complete it without duplicating.
    await load(db, {
      ...toInput(migration),
      entries: migration.entries.slice(0, 5),
      reimbursements: [],
    });
    const full = await load(db, toInput(migration));
    expect(full.entries).toBe(migration.entries.length);
    expect(full.reimbursements).toBe(migration.reimbursements.length);
    await expect(
      verifyLoad(db, {
        entries: migration.entries.length,
        poolBalanceIdr: poolBalance(migration.entries),
      }),
    ).resolves.toBeUndefined();
  });

  it('refuses to link a reimbursement whose expense is not present', async () => {
    // Strict on purpose: silently skipping would hide a genuine inconsistency between the
    // seeds and the data.
    await expect(
      load(db, { ...toInput(migration), entries: migration.entries.slice(0, 2) }),
    ).rejects.toThrow(/references unknown/);
  });

  it('stores the spreadsheet cell each row came from', async () => {
    await load(db, toInput(migration));
    const { rows } = await db.query<{ legacy_ref: string }>(
      `select legacy_ref from entries where legacy_ref = '''September 2024''!H7'`,
    );
    expect(rows).toHaveLength(1);
  });

  it('marks the migrated rows as coming from the migration', async () => {
    await load(db, toInput(migration));
    const { rows } = await db.query<{ count: number }>(
      `select count(*)::int as count from entries where source <> 'migration'`,
    );
    expect(rows[0].count).toBe(0);
  });

  describe('the money model survives the round trip', () => {
    beforeEach(async () => {
      await load(db, toInput(migration));
    });

    it('nets the partially repaid Uniqlo purchase down to 894.000', async () => {
      const { rows } = await db.query<{ net_idr: string }>(
        `select s.net_idr from entry_spending s
         join entries e on e.id = s.id
         where e.legacy_ref = '''April 2025''!H11'`,
      );
      expect(Number(rows[0].net_idr)).toBe(894_000);
    });

    it('nets the fully repaid concert tickets down to zero', async () => {
      const { rows } = await db.query<{ net_idr: string }>(
        `select s.net_idr from entry_spending s
         join entries e on e.id = s.id
         where e.legacy_ref = '''September 2024''!H5'`,
      );
      expect(Number(rows[0].net_idr)).toBe(0);
    });

    it('keeps the Rizka repayment out of spending entirely', async () => {
      const { rows } = await db.query<{ kind: string; amount_idr: string; category_id: string | null }>(
        `select kind, amount_idr, category_id from entries where legacy_ref = '''September 2024''!H6'`,
      );
      expect(rows[0].kind).toBe('contribution');
      expect(Number(rows[0].amount_idr)).toBe(-1_200_000);
      expect(rows[0].category_id).toBeNull();
    });

    it('re-files the miscategorized Gocar row under Transportasi', async () => {
      const { rows } = await db.query<{ name: string }>(
        `select c.name from entries e join categories c on c.id = e.category_id
         where e.legacy_ref = '''April 2025''!H5'`,
      );
      expect(rows[0].name).toBe('Transportasi');
    });

    it('flags the undated row so it can be corrected in the app', async () => {
      const { rows } = await db.query<{ date_inferred: boolean; occurred_on: string }>(
        `select date_inferred, occurred_on from entries where legacy_ref = '''September 2024''!H8'`,
      );
      expect(rows[0].date_inferred).toBe(true);
    });

    it('links every spelling of a place to one row', async () => {
      // `GI` and `Grand Indonesia` are the same mall.
      const { rows } = await db.query<{ canonical_name: string; aliases: string[] }>(
        `select canonical_name, aliases from places where canonical_name = 'Grand Indonesia'`,
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].aliases).toEqual(expect.arrayContaining(['GI', 'Grand Indonesia']));
    });

    it('gives each merchant the category it implies, for autocomplete', async () => {
      const { rows } = await db.query<{ merchant: string; category: string }>(
        `select m.canonical_name as merchant, c.name as category
         from merchants m join categories c on c.id = m.default_category_id
         where m.canonical_name in ('Gocar', 'Shihlin', 'Uniqlo')
         order by m.canonical_name`,
      );
      expect(rows).toEqual([
        { merchant: 'Gocar', category: 'Transportasi' },
        { merchant: 'Shihlin', category: 'Jajan & Snack' },
        { merchant: 'Uniqlo', category: 'Belanja' },
      ]);
    });

    it('reports spending per category with repaid money already removed', async () => {
      const { rows } = await db.query<{ name: string; total: string }>(
        `select c.name, sum(s.net_idr)::bigint as total
         from entry_spending s join categories c on c.id = s.category_id
         group by c.name order by c.name`,
      );
      const totals = Object.fromEntries(rows.map((r) => [r.name, Number(r.total)]));
      expect(totals['Hiburan']).toBe(0); // tickets fully repaid, nothing else entertainment
      expect(totals['Belanja']).toBe(894_000); // Uniqlo, half repaid
      expect(totals['Transportasi']).toBe(32_000);
    });
  });
});
