import { DATA_RANGE } from '../config';
import { dateToSerial, serialToDate } from './dates';
import { discoverTotalsRow, ensureMonthSheet } from './monthSheet';
import type { SheetsClient } from './sheetsClient';

export type ExpenseEntry = {
  kind: 'expense';
  row: number;
  sheetTitle: string;
  date: Date;
  name: string;
  location: string;
  category: string;
  amount: number;
};

export type IncomeEntry = {
  kind: 'income';
  row: number;
  sheetTitle: string;
  date: Date;
  name: string;
  category: string;
  amount: number;
};

export type AnyEntry = ExpenseEntry | IncomeEntry;

const expenseRange = (title: string, endRow: number) =>
  `'${title}'!H${DATA_RANGE.expense.startRow}:L${endRow}`;
const incomeRange = (title: string, endRow: number) =>
  `'${title}'!N${DATA_RANGE.income.startRow}:Q${endRow}`;
const expenseRowRange = (title: string, row: number) => `'${title}'!H${row}:L${row}`;
const incomeRowRange = (title: string, row: number) => `'${title}'!N${row}:Q${row}`;

function parseRow(
  values: (string | number)[][],
  startRow: number,
  mapper: (row: (string | number | undefined)[], rowNum: number) => AnyEntry | null,
): AnyEntry[] {
  const out: AnyEntry[] = [];
  for (let i = 0; i < values.length; i++) {
    const row = values[i] ?? [];
    const rowNum = startRow + i;
    const entry = mapper(row, rowNum);
    if (entry) out.push(entry);
  }
  return out;
}

function num(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
  return null;
}

function str(v: unknown): string {
  return v == null ? '' : String(v);
}

export async function readMonth(
  client: SheetsClient,
  spreadsheetId: string,
  target: Date,
): Promise<{ entries: AnyEntry[]; sheetTitle: string; created: boolean; totalsRow: number }> {
  const { sheet, created, totalsRow } = await ensureMonthSheet(client, spreadsheetId, target);
  const title = sheet.title;
  const dataEnd = totalsRow - 1;

  const ranges = [expenseRange(title, dataEnd), incomeRange(title, dataEnd)];
  const result = await client.batchGetValues(spreadsheetId, ranges);
  const expVals = result[0]?.values ?? [];
  const incVals = result[1]?.values ?? [];

  const expenses = parseRow(expVals, DATA_RANGE.expense.startRow, (r, row) => {
    const dateSerial = num(r[0]);
    const amount = num(r[4]);
    if (dateSerial == null && !str(r[1]).trim()) return null;
    return {
      kind: 'expense',
      row,
      sheetTitle: title,
      date: dateSerial != null ? serialToDate(dateSerial) : new Date(NaN),
      name: str(r[1]),
      location: str(r[2]),
      category: str(r[3]),
      amount: amount ?? 0,
    };
  });

  const incomes = parseRow(incVals, DATA_RANGE.income.startRow, (r, row) => {
    const dateSerial = num(r[0]);
    const amount = num(r[3]);
    if (dateSerial == null && !str(r[1]).trim()) return null;
    return {
      kind: 'income',
      row,
      sheetTitle: title,
      date: dateSerial != null ? serialToDate(dateSerial) : new Date(NaN),
      name: str(r[1]),
      category: str(r[2]),
      amount: amount ?? 0,
    };
  });

  return { entries: [...expenses, ...incomes], sheetTitle: title, created, totalsRow };
}

export async function readTotals(
  client: SheetsClient,
  spreadsheetId: string,
  target: Date,
): Promise<{ expense: number; income: number; sheetTitle: string; totalsRow: number }> {
  const { sheet, totalsRow } = await ensureMonthSheet(client, spreadsheetId, target);
  const title = sheet.title;
  const ranges = [`'${title}'!L${totalsRow}`, `'${title}'!Q${totalsRow}`];
  const result = await client.batchGetValues(spreadsheetId, ranges);
  return {
    expense: num(result[0]?.values?.[0]?.[0]) ?? 0,
    income: num(result[1]?.values?.[0]?.[0]) ?? 0,
    sheetTitle: title,
    totalsRow,
  };
}

async function firstEmptyRow(
  client: SheetsClient,
  spreadsheetId: string,
  range: string,
  startRow: number,
  endRow: number,
): Promise<number | null> {
  const vals = await client.getValues(spreadsheetId, range);
  for (let row = startRow; row <= endRow; row++) {
    const r = vals[row - startRow] ?? [];
    const isEmpty = r.every((c) => c === '' || c == null);
    if (isEmpty) return row;
  }
  return null;
}

export async function addExpense(
  client: SheetsClient,
  spreadsheetId: string,
  input: { date: Date; name: string; location: string; category: string; amount: number },
): Promise<{ row: number; sheetTitle: string }> {
  const { sheet, totalsRow } = await ensureMonthSheet(client, spreadsheetId, input.date);
  const title = sheet.title;
  const startRow = DATA_RANGE.expense.startRow;
  const endRow = totalsRow - 1;
  const row = await firstEmptyRow(
    client,
    spreadsheetId,
    `'${title}'!H${startRow}:H${endRow}`,
    startRow,
    endRow,
  );
  if (row == null) {
    throw new Error(
      `Month is full (${endRow - startRow + 1} expense entries already). Compact the sheet or expand the row range.`,
    );
  }

  await client.updateValues(spreadsheetId, expenseRowRange(title, row), [
    [dateToSerial(input.date), input.name, input.location, input.category, input.amount],
  ]);
  return { row, sheetTitle: title };
}

export async function addIncome(
  client: SheetsClient,
  spreadsheetId: string,
  input: { date: Date; name: string; category: string; amount: number },
): Promise<{ row: number; sheetTitle: string }> {
  const { sheet, totalsRow } = await ensureMonthSheet(client, spreadsheetId, input.date);
  const title = sheet.title;
  const startRow = DATA_RANGE.income.startRow;
  const endRow = totalsRow - 1;
  const row = await firstEmptyRow(
    client,
    spreadsheetId,
    `'${title}'!N${startRow}:N${endRow}`,
    startRow,
    endRow,
  );
  if (row == null) {
    throw new Error(
      `Month is full (${endRow - startRow + 1} income entries already). Compact the sheet or expand the row range.`,
    );
  }

  await client.updateValues(spreadsheetId, incomeRowRange(title, row), [
    [dateToSerial(input.date), input.name, input.category, input.amount],
  ]);
  return { row, sheetTitle: title };
}

export async function updateExpense(
  client: SheetsClient,
  spreadsheetId: string,
  entry: ExpenseEntry,
): Promise<void> {
  await client.updateValues(spreadsheetId, expenseRowRange(entry.sheetTitle, entry.row), [
    [dateToSerial(entry.date), entry.name, entry.location, entry.category, entry.amount],
  ]);
}

export async function updateIncome(
  client: SheetsClient,
  spreadsheetId: string,
  entry: IncomeEntry,
): Promise<void> {
  await client.updateValues(spreadsheetId, incomeRowRange(entry.sheetTitle, entry.row), [
    [dateToSerial(entry.date), entry.name, entry.category, entry.amount],
  ]);
}

export async function deleteEntry(
  client: SheetsClient,
  spreadsheetId: string,
  entry: AnyEntry,
): Promise<void> {
  const range =
    entry.kind === 'expense'
      ? expenseRowRange(entry.sheetTitle, entry.row)
      : incomeRowRange(entry.sheetTitle, entry.row);
  await client.clearValues(spreadsheetId, range);
}

// Re-exported for callers that need the resolved totals row outside of a read.
export { discoverTotalsRow };
