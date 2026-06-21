import { sheetTitleFor } from '../config';
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

/** Convert a 0-indexed column number to an A1 column letter (0 -> A, 26 -> AA). */
function colLetter(index0: number): string {
  let n = index0;
  let s = '';
  do {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return s;
}

/** A serial that plausibly represents a real date in this app's lifetime (~2000..2100). */
function isDateSerial(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v >= 36_500 && v <= 73_050;
}

/** A horizontal run of monthly date headers found in the detail (column-based) table. */
type DetailHeader = {
  /** 1-indexed header row. */
  headerRow: number;
  /** 0-indexed column of the first month in the run. */
  firstMonthCol: number;
  /** 0-indexed column of the last (rightmost) month in the run. */
  lastMonthCol: number;
  /** Date serials of each month column, left-to-right. */
  serials: number[];
};

const DETAIL_SCAN_RANGE = 'A1:CZ200';

/**
 * Find the column-based detail table's header row: the row containing the longest
 * horizontal run of consecutive month date-serials (each ~28-31 apart). Returns null
 * if no run of length >= 2 is found. Deliberately ignores the row-based summary
 * (B25:E120), whose dates form vertical runs (horizontal run length 1).
 */
function findDetailHeader(grid: (string | number)[][]): DetailHeader | null {
  let best: DetailHeader | null = null;
  for (let r = 0; r < grid.length; r++) {
    const row = grid[r] ?? [];
    let c = 0;
    while (c < row.length) {
      if (!isDateSerial(row[c])) {
        c++;
        continue;
      }
      // Extend a run of monthly-spaced serials.
      const start = c;
      const serials: number[] = [row[c] as number];
      let next = c + 1;
      while (next < row.length && isDateSerial(row[next])) {
        const delta = (row[next] as number) - serials[serials.length - 1];
        if (delta >= 27 && delta <= 32) {
          serials.push(row[next] as number);
          next++;
        } else {
          break;
        }
      }
      if (serials.length >= 2 && (!best || serials.length > best.serials.length)) {
        best = {
          headerRow: r + 1,
          firstMonthCol: start,
          lastMonthCol: start + serials.length - 1,
          serials,
        };
      }
      c = next > c ? next : c + 1;
    }
  }
  return best;
}

function isSameMonthSerial(serial: number, date: Date): boolean {
  return isSameMonth(serialToDate(serial), date);
}

/**
 * Append a new month *column* to the column-based detail table on the Overview sheet.
 * Inserts a blank column before the trailing (totals/average) column, copies the
 * previous month column's formatting, and writes its formulas re-pointed at the new
 * month sheet. Idempotent: skips if a column for the target month already exists.
 * Bounded to the table's own rows so the row-based summary (B25:E120) is untouched.
 */
export async function appendOverviewMonthColumn(
  client: SheetsClient,
  spreadsheetId: string,
  args: { date: Date },
): Promise<void> {
  const meta = await client.getSpreadsheet(spreadsheetId);
  const sheet = findOverviewSheet(meta);
  if (!sheet) {
    console.warn('Overview sheet not found; skipping detail-column append.');
    return;
  }

  const grid = await client.getValues(
    spreadsheetId,
    `'${sheet.title}'!${DETAIL_SCAN_RANGE}`,
    { valueRenderOption: 'UNFORMATTED_VALUE' },
  );
  const header = findDetailHeader(grid);
  if (!header) {
    console.warn('Could not locate the detail table header on Overview; skipping detail-column append.');
    return;
  }

  // Already present for this month?
  if (header.serials.some((s) => isSameMonthSerial(s, args.date))) return;

  const prevSerial = header.serials[header.serials.length - 1];
  const prevDate = serialToDate(prevSerial);
  // Only append the newest month at the right; don't insert mid-table.
  if (args.date.getFullYear() * 12 + args.date.getMonth() <= prevDate.getFullYear() * 12 + prevDate.getMonth()) {
    console.warn(
      `Target month ${sheetTitleFor(args.date)} is not newer than the last detail column ${sheetTitleFor(prevDate)}; skipping detail-column append.`,
    );
    return;
  }

  // Determine the table's bottom row by scanning the previous-month column downward.
  const prevCol = header.lastMonthCol;
  let lastDataRow = header.headerRow;
  for (let r = header.headerRow - 1; r < grid.length; r++) {
    const cell = grid[r]?.[prevCol];
    if (cell !== '' && cell != null) lastDataRow = r + 1;
  }

  const sheetId = sheet.sheetId;
  const newCol = header.lastMonthCol + 1; // 0-indexed: position of the (current) trailing column.

  // 1) Insert a blank column before the trailing column, bounded to the table rows.
  // 2) Copy the previous-month column's formatting into the new blank column.
  await client.batchUpdate(spreadsheetId, [
    {
      insertRange: {
        range: {
          sheetId,
          startRowIndex: header.headerRow - 1,
          endRowIndex: lastDataRow,
          startColumnIndex: newCol,
          endColumnIndex: newCol + 1,
        },
        shiftDimension: 'COLUMNS',
      },
    },
    {
      copyPaste: {
        source: {
          sheetId,
          startRowIndex: header.headerRow - 1,
          endRowIndex: lastDataRow,
          startColumnIndex: prevCol,
          endColumnIndex: prevCol + 1,
        },
        destination: {
          sheetId,
          startRowIndex: header.headerRow - 1,
          endRowIndex: lastDataRow,
          startColumnIndex: newCol,
          endColumnIndex: newCol + 1,
        },
        pasteType: 'PASTE_FORMAT',
      },
    },
  ]);

  // Read the previous-month column's formulas and re-point them to the new month.
  const prevColLetter = colLetter(prevCol);
  const newColLetter = colLetter(newCol);
  const bandRange = `'${sheet.title}'!${prevColLetter}${header.headerRow}:${prevColLetter}${lastDataRow}`;
  const prevValues = await client.getValues(spreadsheetId, bandRange, {
    valueRenderOption: 'FORMULA',
  });

  const prevTitle = sheetTitleFor(prevDate);
  const newTitle = sheetTitleFor(args.date);
  const firstOfMonth = new Date(args.date.getFullYear(), args.date.getMonth(), 1);

  const out: (string | number | null)[][] = [];
  for (let i = 0; i < lastDataRow - header.headerRow + 1; i++) {
    if (i === 0) {
      // Header cell: the new month's date.
      out.push([dateToSerial(firstOfMonth)]);
      continue;
    }
    const cell = prevValues[i]?.[0];
    if (typeof cell === 'string') {
      out.push([cell.split(`'${prevTitle}'`).join(`'${newTitle}'`)]);
    } else {
      out.push([cell == null ? null : cell]);
    }
  }

  await client.updateValues(
    spreadsheetId,
    `'${sheet.title}'!${newColLetter}${header.headerRow}:${newColLetter}${lastDataRow}`,
    out,
  );
}
