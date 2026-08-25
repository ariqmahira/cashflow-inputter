/**
 * Date repair and inference.
 *
 * Three separate problems, handled in order:
 *
 *  1. **Parsing.** Dates are stored inconsistently — some cells are real Excel dates, some
 *     are `d/m/yyyy` text. One cell reads `24/12/20:24`.
 *  2. **Autofill corruption.** `Juni 2025` rows 13-18 read `14/7/2025, 14/7/2026 … 14/7/2030`:
 *     someone dragged a cell and Excel incremented the year.
 *  3. **Missing dates.** Roughly two in five expense rows have no date at all.
 *
 * Dates are handled as `PlainDate` strings throughout, never as `Date` objects. The
 * workbook's date cells come back as UTC midnight, and reading them with local getters in
 * Asia/Jakarta (UTC+7) or any negative-offset zone silently shifts the calendar day. A
 * ledger cannot afford that, so the `Date` type stops at this boundary.
 */

import {
  fromUtcDate,
  isRealDate,
  plainDateParts,
  toPlainDate,
  type PlainDate,
} from '../../src/lib/plain-date.ts';
import type { RawCell } from './types.mts';

export type { PlainDate };
export { toPlainDate };

export type DateResolution = {
  date: PlainDate | null;
  /** True when the date was inferred rather than read. Surfaces in the app for review. */
  inferred: boolean;
  /** Human-readable account of what happened, for the migration report. */
  note?: string;
};

/** `24/12/2024` and `13/5/2024`. Day first — this is an Indonesian workbook. */
const DMY = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;
/**
 * `24/12/20:24` — a stray colon splitting the year. Only ever seen once
 * (`'Desember 2024'!H5`), but the shape is unambiguous so it is repaired rather than
 * hand-patched: two digits, colon, two digits, in the year position.
 */
const DMY_COLON_YEAR = /^(\d{1,2})\/(\d{1,2})\/(\d{2}):(\d{2})$/;

/**
 * Reads one date cell. Returns null when the cell is empty or unintelligible — never a
 * guess. Guessing happens later, explicitly, in `inferMissingDates`.
 */
export function parseDateCell(raw: RawCell): PlainDate | null {
  if (raw === null || raw === '') return null;

  if (raw instanceof Date) return fromUtcDate(raw);

  if (typeof raw === 'string') {
    const s = raw.trim();

    const dmy = DMY.exec(s);
    if (dmy) {
      const [day, month, year] = [Number(dmy[1]), Number(dmy[2]), Number(dmy[3])];
      return isRealDate(year, month, day) ? toPlainDate(year, month, day) : null;
    }

    const colon = DMY_COLON_YEAR.exec(s);
    if (colon) {
      const [day, month] = [Number(colon[1]), Number(colon[2])];
      const year = Number(`${colon[3]}${colon[4]}`);
      return isRealDate(year, month, day) ? toPlainDate(year, month, day) : null;
    }
  }

  return null;
}

/**
 * Undoes Excel's autofill year-increment.
 *
 * Looks for runs of three or more consecutive entries sharing a day and month whose years
 * step up by exactly one, and flattens them onto the first year in the run. Requiring all
 * three conditions keeps this from touching real data: genuine spending never produces
 * `14 July` in five consecutive years.
 *
 * Operates positionally on the array, so callers must pass rows in sheet order.
 */
export function repairAutofillRuns(dates: (PlainDate | null)[]): {
  dates: (PlainDate | null)[];
  repaired: Map<number, string>;
} {
  const out = [...dates];
  const repaired = new Map<number, string>();

  let i = 0;
  while (i < out.length) {
    const start = out[i];
    if (!start) {
      i++;
      continue;
    }
    const a = plainDateParts(start);

    let end = i;
    while (end + 1 < out.length) {
      const next = out[end + 1];
      if (!next) break;
      const b = plainDateParts(next);
      const prev = plainDateParts(out[end]!);
      if (b.day !== a.day || b.month !== a.month || b.year !== prev.year + 1) break;
      end++;
    }

    const runLength = end - i + 1;
    if (runLength >= 3) {
      for (let k = i + 1; k <= end; k++) {
        const was = out[k]!;
        out[k] = toPlainDate(a.year, a.month, a.day);
        repaired.set(k, `autofill year corruption: ${was} -> ${out[k]}`);
      }
    }
    i = end + 1;
  }

  return { dates: out, repaired };
}

/**
 * Fills gaps from the nearest dated row in the same sheet.
 *
 * The sheet's own name is deliberately the *last* resort. Sheets routinely hold the next
 * month's spending — `September 2024` is full of mid-October rows — so a neighbouring row's
 * real date is better evidence of when an undated row happened than the tab it was typed on.
 *
 * Ties go to the row above, matching the order entries were written in.
 */
export function inferMissingDates(
  dates: (PlainDate | null)[],
  sheetMonth: number,
  sheetYear: number,
): DateResolution[] {
  const fallback = toPlainDate(sheetYear, sheetMonth, 1);

  return dates.map((date, idx) => {
    if (date) return { date, inferred: false };

    let up = -1;
    for (let k = idx - 1; k >= 0; k--) {
      if (dates[k]) {
        up = k;
        break;
      }
    }
    let down = -1;
    for (let k = idx + 1; k < dates.length; k++) {
      if (dates[k]) {
        down = k;
        break;
      }
    }

    if (up === -1 && down === -1) {
      return {
        date: fallback,
        inferred: true,
        note: `no dated row in sheet; fell back to first of ${sheetMonth}/${sheetYear}`,
      };
    }

    const pick =
      up === -1 ? down : down === -1 ? up : idx - up <= down - idx ? up : down;

    return {
      date: dates[pick]!,
      inferred: true,
      note: `inherited from nearest dated row (${pick < idx ? 'above' : 'below'}, ${Math.abs(idx - pick)} row${Math.abs(idx - pick) === 1 ? '' : 's'} away)`,
    };
  });
}
