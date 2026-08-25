/**
 * Shared types for the one-time migration of `Cashflow Bab & Bi_*.xlsx` into Postgres.
 *
 * The workbook is dirty in well-understood ways (see the plan): 39% of expense rows have no
 * date, dates routinely belong to a different month than their sheet, and the category
 * column has become a catch-all. Everything here keeps the *raw* cell value alongside the
 * cleaned one so every decision the pipeline makes stays auditable.
 */

/** Where a value came from, e.g. `'Juli 2026'!H15`. Survives into the database. */
export type LegacyRef = string;

export type RawCell = string | number | Date | null;

/** One expense row exactly as the sheet holds it, before any cleaning. */
export type RawExpense = {
  sheet: string;
  row: number;
  legacyRef: LegacyRef;
  date: RawCell;
  name: RawCell;
  place: RawCell;
  category: RawCell;
  amount: RawCell;
};

/** One income row exactly as the sheet holds it. All of these are kas top-ups. */
export type RawIncome = {
  sheet: string;
  row: number;
  legacyRef: LegacyRef;
  date: RawCell;
  name: RawCell;
  category: RawCell;
  amount: RawCell;
};

/**
 * A monthly sheet's totals as the workbook itself computed them. These are the cached
 * results of the `SUM` formulas, and they are the reconciliation gate: whatever the
 * pipeline produces must add up to these or the migration aborts.
 */
export type SheetTotals = {
  /** 30 for `Maret 2024`..`November 2025`, 31 from `Desember 2025` on. */
  totalsRow: number;
  expense: number;
  income: number;
};

export type ParsedSheet = {
  title: string;
  /** 1-12, from the Indonesian month name in the sheet title. */
  month: number;
  year: number;
  totals: SheetTotals;
  expenses: RawExpense[];
  incomes: RawIncome[];
};

export type ParsedWorkbook = {
  sourceFile: string;
  sheets: ParsedSheet[];
};
