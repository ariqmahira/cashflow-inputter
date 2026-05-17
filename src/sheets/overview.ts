import { dateToSerial, serialToDate } from './dates';
import type { SheetMeta, SheetsClient, SpreadsheetMeta } from './sheetsClient';

export type OverviewRow = {
  /** 1-indexed row number in the Overview sheet (for surgical updates). */
  row: number;
  /** First-of-month date (e.g., 2026-05-01). */
  date: Date;
  /** Title of the linked monthly sheet (parsed from the formula in column C). */
  monthSheetTitle: string | null;
  income: number;
  expense: number;
  /** Sisa Uang (balance). */
  net: number;
};

export type OverviewData = {
  headerRow: number;
  rows: OverviewRow[];
  totals: { income: number; expense: number; net: number } | null;
  jumlahRow: number | null;
  sheetTitle: string;
  sheetId: number;
};

const SHEET_REF_RE = /^=\s*'?([^'!]+?)'?\s*!/;

export function findOverviewSheet(meta: SpreadsheetMeta): SheetMeta | null {
  return meta.sheets.find((s) => s.title.trim().toLowerCase() === 'overview') ?? null;
}

function num(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
  return null;
}

function str(v: unknown): string {
  return v == null ? '' : String(v);
}

const SCAN_RANGE = 'B25:E120';

export async function readOverview(
  client: SheetsClient,
  spreadsheetId: string,
): Promise<OverviewData | null> {
  const meta = await client.getSpreadsheet(spreadsheetId);
  const sheet = findOverviewSheet(meta);
  if (!sheet) return null;

  const range = `'${sheet.title}'!${SCAN_RANGE}`;
  const [computed, formulas] = await Promise.all([
    client.getValues(spreadsheetId, range, { valueRenderOption: 'UNFORMATTED_VALUE' }),
    client.getValues(spreadsheetId, range, { valueRenderOption: 'FORMULA' }),
  ]);

  // Find header (B-column "Tanggal") and JUMLAH (B-column "JUMLAH").
  const SCAN_START = 25;
  let headerRow = -1;
  let jumlahRow: number | null = null;
  for (let i = 0; i < computed.length; i++) {
    const b = str(computed[i]?.[0]).trim();
    const rowNum = SCAN_START + i;
    if (headerRow < 0 && b.toLowerCase() === 'tanggal') headerRow = rowNum;
    if (b.toUpperCase() === 'JUMLAH') jumlahRow = rowNum;
  }
  if (headerRow < 0) return null;

  const rows: OverviewRow[] = [];
  for (let i = 0; i < computed.length; i++) {
    const rowNum = SCAN_START + i;
    if (rowNum <= headerRow) continue;
    if (jumlahRow != null && rowNum >= jumlahRow) break;

    const computedRow = computed[i] ?? [];
    const formulaRow = formulas[i] ?? [];
    const dateSerial = num(computedRow[0]);
    if (dateSerial == null) continue; // Skip stub rows (B empty).

    const incomeFormula = str(formulaRow[1]);
    const m = SHEET_REF_RE.exec(incomeFormula);
    const monthSheetTitle = m ? m[1] : null;

    rows.push({
      row: rowNum,
      date: serialToDate(dateSerial),
      monthSheetTitle,
      income: num(computedRow[1]) ?? 0,
      expense: num(computedRow[2]) ?? 0,
      net: num(computedRow[3]) ?? 0,
    });
  }

  let totals: OverviewData['totals'] = null;
  if (jumlahRow != null) {
    const idx = jumlahRow - SCAN_START;
    const jr = computed[idx] ?? [];
    totals = {
      income: num(jr[1]) ?? 0,
      expense: num(jr[2]) ?? 0,
      net: num(jr[3]) ?? 0,
    };
  }

  return {
    headerRow,
    rows,
    totals,
    jumlahRow,
    sheetTitle: sheet.title,
    sheetId: sheet.sheetId,
  };
}

function isSameMonth(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

/**
 * Append a row to the Overview table for a newly-created month. Idempotent: skips if a row
 * already exists for the target month. Inserts after the last existing dated row so chronology
 * is preserved and the JUMLAH SUM range auto-extends.
 */
export async function appendOverviewRow(
  client: SheetsClient,
  spreadsheetId: string,
  args: { date: Date; monthSheetTitle: string; monthTotalsRow: number },
): Promise<void> {
  const overview = await readOverview(client, spreadsheetId);
  if (!overview) {
    console.warn('Overview sheet not found; skipping Overview row append.');
    return;
  }
  if (overview.rows.some((r) => isSameMonth(r.date, args.date))) {
    // Already present — nothing to do.
    return;
  }

  const lastMonthRow = overview.rows.length > 0
    ? overview.rows[overview.rows.length - 1].row
    : overview.headerRow;
  const insertAt1Indexed = lastMonthRow + 1;

  // Insert one row at the position right after the last dated row.
  // Sheets API uses 0-indexed startIndex; row N (1-indexed) = index N-1.
  await client.batchUpdate(spreadsheetId, [
    {
      insertDimension: {
        range: {
          sheetId: overview.sheetId,
          dimension: 'ROWS',
          startIndex: insertAt1Indexed - 1,
          endIndex: insertAt1Indexed,
        },
        inheritFromBefore: true,
      },
    },
  ]);

  const tr = args.monthTotalsRow;
  const title = args.monthSheetTitle;
  const safeTitle = title.replace(/'/g, "''");
  const newRowRange = `'${overview.sheetTitle}'!B${insertAt1Indexed}:E${insertAt1Indexed}`;
  const firstOfMonth = new Date(args.date.getFullYear(), args.date.getMonth(), 1);

  await client.updateValues(spreadsheetId, newRowRange, [
    [
      dateToSerial(firstOfMonth),
      `='${safeTitle}'!Q${tr}`,
      `='${safeTitle}'!L${tr}`,
      `='${safeTitle}'!C5`,
    ],
  ]);
}
