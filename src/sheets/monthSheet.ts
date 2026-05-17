import { MONTHS_ID, sheetTitleFor, DATA_RANGE } from '../config';
import type { SheetMeta, SheetsClient } from './sheetsClient';
import { appendOverviewRow } from './overview';

export type MonthSheetInfo = {
  title: string;
  sheetId: number;
  year: number;
  monthIndex: number; // 0..11
};

const TITLE_RE = new RegExp(`^(${MONTHS_ID.join('|')})\\s+(\\d{4})$`);

export function parseMonthTitle(title: string): { monthIndex: number; year: number } | null {
  const m = TITLE_RE.exec(title.trim());
  if (!m) return null;
  const monthIndex = MONTHS_ID.indexOf(m[1] as (typeof MONTHS_ID)[number]);
  const year = Number(m[2]);
  if (monthIndex < 0 || !Number.isFinite(year)) return null;
  return { monthIndex, year };
}

export function listMonthSheets(sheets: SheetMeta[]): MonthSheetInfo[] {
  return sheets
    .map((s) => {
      const parsed = parseMonthTitle(s.title);
      if (!parsed) return null;
      return { title: s.title, sheetId: s.sheetId, year: parsed.year, monthIndex: parsed.monthIndex };
    })
    .filter((x): x is MonthSheetInfo => x != null)
    .sort((a, b) => a.year * 12 + a.monthIndex - (b.year * 12 + b.monthIndex));
}

export function findMonthSheet(sheets: SheetMeta[], target: Date): SheetMeta | null {
  const title = sheetTitleFor(target);
  return sheets.find((s) => s.title === title) ?? null;
}

const totalsRowCache = new Map<string, number>();

/**
 * Find the totals row of a monthly sheet by scanning column H near the expected position
 * for the "TOTAL PENGELUARAN" label. Caches by (spreadsheetId, sheetTitle).
 * Different sheets in the same workbook can have totals at row 30 (older) or row 31 (newer).
 */
export async function discoverTotalsRow(
  client: SheetsClient,
  spreadsheetId: string,
  sheetTitle: string,
): Promise<number> {
  const key = `${spreadsheetId}::${sheetTitle}`;
  const cached = totalsRowCache.get(key);
  if (cached != null) return cached;

  const values = await client.getValues(spreadsheetId, `'${sheetTitle}'!H25:H35`, {
    valueRenderOption: 'FORMATTED_VALUE',
  });
  for (let i = 0; i < values.length; i++) {
    const cell = values[i]?.[0];
    if (typeof cell === 'string' && cell.toUpperCase().includes('TOTAL PENGELUARAN')) {
      const row = 25 + i;
      totalsRowCache.set(key, row);
      return row;
    }
  }
  throw new Error(
    `Could not locate the totals row for '${sheetTitle}'. Expected a cell containing 'TOTAL PENGELUARAN' in H25:H35.`,
  );
}

/**
 * Ensure a month sheet exists for `target`. If missing, duplicate the most recent existing
 * monthly sheet as template, rename, and clear data ranges (preserves SUM totals formulas).
 * On creation, also appends a row to the Overview sheet (best-effort; logs and continues on failure).
 */
export async function ensureMonthSheet(
  client: SheetsClient,
  spreadsheetId: string,
  target: Date,
): Promise<{ sheet: SheetMeta; created: boolean; totalsRow: number }> {
  const meta = await client.getSpreadsheet(spreadsheetId);
  const existing = findMonthSheet(meta.sheets, target);
  if (existing) {
    const totalsRow = await discoverTotalsRow(client, spreadsheetId, existing.title);
    return { sheet: existing, created: false, totalsRow };
  }

  const months = listMonthSheets(meta.sheets);
  if (months.length === 0) {
    throw new Error(
      'No existing monthly sheets to use as a template. Create at least one month sheet (e.g. "Maret 2024") manually first.',
    );
  }
  // Pick the latest existing month as template (closest in layout).
  const template = months[months.length - 1];
  const newTitle = sheetTitleFor(target);

  const dupRes = await client.batchUpdate(spreadsheetId, [
    {
      duplicateSheet: {
        sourceSheetId: template.sheetId,
        newSheetName: newTitle,
        insertSheetIndex: meta.sheets.length,
      },
    },
  ]);
  const reply = dupRes.replies?.[0] as { duplicateSheet?: { properties: SheetMeta } } | undefined;
  const newSheetMeta = reply?.duplicateSheet?.properties;
  if (!newSheetMeta) throw new Error('duplicateSheet did not return new sheet properties.');

  // Newly cloned sheet inherits the template's totals row.
  const totalsRow = await discoverTotalsRow(client, spreadsheetId, template.title);
  totalsRowCache.set(`${spreadsheetId}::${newTitle}`, totalsRow);

  const ex = DATA_RANGE.expense;
  const inc = DATA_RANGE.income;
  await Promise.all([
    client.clearValues(spreadsheetId, `'${newTitle}'!H${ex.startRow}:L${totalsRow - 1}`),
    client.clearValues(spreadsheetId, `'${newTitle}'!N${inc.startRow}:Q${totalsRow - 1}`),
  ]);

  // Best-effort: also append a row to the Overview sheet so the workbook stays in sync.
  try {
    await appendOverviewRow(client, spreadsheetId, {
      date: target,
      monthSheetTitle: newTitle,
      monthTotalsRow: totalsRow,
    });
  } catch (err) {
    console.warn('Failed to append Overview row for', newTitle, err);
  }

  return { sheet: newSheetMeta, created: true, totalsRow };
}
