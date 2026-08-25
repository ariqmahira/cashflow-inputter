/**
 * Reads the workbook into `ParsedWorkbook`. No cleaning happens here — this layer only
 * knows the sheet geometry.
 *
 * Geometry: header on row 4, expense block in H:L (date, name, lokasi, jenis, jumlah),
 * income block in N:Q (date, name, jenis, jumlah), data from row 5 up to the totals row.
 * The totals row is NOT fixed: it is 30 for `Maret 2024`..`November 2025` and 31 from
 * `Desember 2025` onward, so it is detected per sheet the same way the old app does it in
 * `src/sheets/monthSheet.ts`.
 */

import ExcelJS from 'exceljs';
import type { ParsedSheet, ParsedWorkbook, RawCell, RawExpense, RawIncome } from './types.mts';

export const MONTHS_ID = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
] as const;

const TITLE_RE = new RegExp(`^(${MONTHS_ID.join('|')})\\s+(\\d{4})$`);

const COL = {
  expense: { date: 8, name: 9, place: 10, category: 11, amount: 12 },
  income: { date: 14, name: 15, category: 16, amount: 17 },
} as const;

const FIRST_DATA_ROW = 5;
const TOTALS_LABEL = 'TOTAL PENGELUARAN';
/** The totals row has only ever been 30 or 31, but scan wider so a future drift is caught. */
const TOTALS_SCAN = { from: 25, to: 35 } as const;

/** Parses `"Agustus 2026"` into `{ month: 8, year: 2026 }`, or null for non-month sheets. */
export function parseSheetTitle(title: string): { month: number; year: number } | null {
  const m = TITLE_RE.exec(title.trim());
  if (!m) return null;
  return { month: MONTHS_ID.indexOf(m[1] as (typeof MONTHS_ID)[number]) + 1, year: Number(m[2]) };
}

/**
 * Flattens an ExcelJS cell into a plain value.
 *
 * Formula cells arrive as `{ formula, result }` — we want the cached `result`, since that is
 * what the workbook actually displayed and what reconciliation compares against. Rich text
 * and hyperlink cells are reduced to their text.
 */
export function cellValue(raw: ExcelJS.CellValue): RawCell {
  if (raw === null || raw === undefined) return null;
  if (raw instanceof Date) return raw;
  if (typeof raw === 'string' || typeof raw === 'number') return raw;
  if (typeof raw === 'boolean') return String(raw);
  if (typeof raw === 'object') {
    if ('result' in raw) return cellValue(raw.result as ExcelJS.CellValue);
    if ('richText' in raw) return raw.richText.map((t) => t.text).join('');
    if ('text' in raw) return String(raw.text);
    if ('error' in raw) return null;
  }
  return null;
}

function asNumber(v: RawCell): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

/**
 * Finds the row holding `TOTAL PENGELUARAN`. Throws rather than guessing: an undetected
 * totals row would silently swallow real data rows or read the SUM as a transaction.
 */
export function findTotalsRow(ws: ExcelJS.Worksheet): number {
  for (let r = TOTALS_SCAN.from; r <= TOTALS_SCAN.to; r++) {
    const v = cellValue(ws.getRow(r).getCell(COL.expense.date).value);
    if (typeof v === 'string' && v.toUpperCase().includes(TOTALS_LABEL)) return r;
  }
  throw new Error(
    `Sheet "${ws.name}": no "${TOTALS_LABEL}" found in rows ` +
      `${TOTALS_SCAN.from}-${TOTALS_SCAN.to}. Sheet layout has changed; update parse.mts.`,
  );
}

function readSheet(ws: ExcelJS.Worksheet, month: number, year: number): ParsedSheet {
  const totalsRow = findTotalsRow(ws);
  const expenses: RawExpense[] = [];
  const incomes: RawIncome[] = [];

  for (let r = FIRST_DATA_ROW; r < totalsRow; r++) {
    const row = ws.getRow(r);
    const get = (c: number) => cellValue(row.getCell(c).value);

    const e = {
      date: get(COL.expense.date),
      name: get(COL.expense.name),
      place: get(COL.expense.place),
      category: get(COL.expense.category),
      amount: get(COL.expense.amount),
    };
    // Keep any row with a trace of content. Rows that are entirely blank are just unused
    // capacity; rows with a category but nothing else are real defects and must survive to
    // be reported as discards rather than vanishing here.
    if (Object.values(e).some((v) => v !== null && v !== '')) {
      expenses.push({ sheet: ws.name, row: r, legacyRef: `'${ws.name}'!H${r}`, ...e });
    }

    const i = {
      date: get(COL.income.date),
      name: get(COL.income.name),
      category: get(COL.income.category),
      amount: get(COL.income.amount),
    };
    if (Object.values(i).some((v) => v !== null && v !== '')) {
      incomes.push({ sheet: ws.name, row: r, legacyRef: `'${ws.name}'!N${r}`, ...i });
    }
  }

  return {
    title: ws.name,
    month,
    year,
    totals: {
      totalsRow,
      expense: asNumber(cellValue(ws.getRow(totalsRow).getCell(COL.expense.amount).value)),
      income: asNumber(cellValue(ws.getRow(totalsRow).getCell(COL.income.amount).value)),
    },
    expenses,
    incomes,
  };
}

export async function parseWorkbook(path: string): Promise<ParsedWorkbook> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(path);

  const sheets: ParsedSheet[] = [];
  for (const ws of wb.worksheets) {
    const parsed = parseSheetTitle(ws.name);
    if (!parsed) continue; // `Overview` is derived from the monthly sheets; nothing to import.
    sheets.push(readSheet(ws, parsed.month, parsed.year));
  }

  sheets.sort((a, b) => a.year - b.year || a.month - b.month);
  if (sheets.length === 0) throw new Error(`No monthly sheets found in ${path}`);
  return { sourceFile: path, sheets };
}
