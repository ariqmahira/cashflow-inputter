/**
 * The reconciliation gate.
 *
 * Every monthly sheet carries its own `SUM` of the rows above it. Those cached results are
 * the one piece of the workbook that is definitely right — they are what the spreadsheet
 * actually displayed and what the Overview totals were built from. If the parser's own sum
 * of a sheet does not equal the sheet's cached total, the parser has either missed rows or
 * invented them, and nothing downstream can be trusted.
 *
 * This runs against the RAW parse, before any repair, recategorization or reclassification.
 * Those steps deliberately move money between categories and kinds; this check is only ever
 * about whether the same rupiah came out of the file that went into it.
 */

import type { ParsedWorkbook } from './types.mts';

export type SheetReconciliation = {
  sheet: string;
  expense: { parsed: number; cached: number; diff: number };
  income: { parsed: number; cached: number; diff: number };
  ok: boolean;
};

export type Reconciliation = {
  sheets: SheetReconciliation[];
  totals: { expense: number; income: number; net: number };
  ok: boolean;
};

const sumAmounts = (rows: { amount: unknown }[]): number =>
  rows.reduce((acc, r) => acc + (typeof r.amount === 'number' && Number.isFinite(r.amount) ? r.amount : 0), 0);

export function reconcile(wb: ParsedWorkbook): Reconciliation {
  const sheets = wb.sheets.map((s): SheetReconciliation => {
    const expenseParsed = sumAmounts(s.expenses);
    const incomeParsed = sumAmounts(s.incomes);
    const expense = {
      parsed: expenseParsed,
      cached: s.totals.expense,
      diff: expenseParsed - s.totals.expense,
    };
    const income = {
      parsed: incomeParsed,
      cached: s.totals.income,
      diff: incomeParsed - s.totals.income,
    };
    return { sheet: s.title, expense, income, ok: expense.diff === 0 && income.diff === 0 };
  });

  const expense = sheets.reduce((a, s) => a + s.expense.parsed, 0);
  const income = sheets.reduce((a, s) => a + s.income.parsed, 0);

  return {
    sheets,
    totals: { expense, income, net: income - expense },
    ok: sheets.every((s) => s.ok),
  };
}

/** Formats a failed reconciliation for the console. */
export function describeFailures(r: Reconciliation): string {
  const bad = r.sheets.filter((s) => !s.ok);
  if (bad.length === 0) return '';
  const lines = bad.map(
    (s) =>
      `  ${s.sheet.padEnd(18)} expense parsed ${s.expense.parsed.toLocaleString()} vs cached ` +
      `${s.expense.cached.toLocaleString()} (${s.expense.diff >= 0 ? '+' : ''}${s.expense.diff.toLocaleString()})` +
      `  |  income parsed ${s.income.parsed.toLocaleString()} vs cached ` +
      `${s.income.cached.toLocaleString()} (${s.income.diff >= 0 ? '+' : ''}${s.income.diff.toLocaleString()})`,
  );
  return [
    `Reconciliation FAILED on ${bad.length} sheet${bad.length === 1 ? '' : 's'}:`,
    ...lines,
    '',
    'The parser and the workbook disagree about how much money moved. Migration aborted.',
  ].join('\n');
}

/** Throws unless every sheet reconciles. This is the gate the migration must not bypass. */
export function assertReconciles(r: Reconciliation): void {
  if (!r.ok) throw new Error(describeFailures(r));
}
