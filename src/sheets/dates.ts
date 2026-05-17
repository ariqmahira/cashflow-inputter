/**
 * Google Sheets stores dates as serial numbers (days since 1899-12-30, Lotus 1-2-3 epoch).
 * Encode/decode without timezone drift by using local-date components only.
 */

const SHEETS_EPOCH_MS = Date.UTC(1899, 11, 30);
const MS_PER_DAY = 86_400_000;

export function dateToSerial(d: Date): number {
  const utcMidnight = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.round((utcMidnight - SHEETS_EPOCH_MS) / MS_PER_DAY);
}

export function serialToDate(serial: number): Date {
  const ms = SHEETS_EPOCH_MS + Math.round(serial) * MS_PER_DAY;
  const d = new Date(ms);
  return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

export function todayLocal(): Date {
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), n.getDate());
}

/** YYYY-MM-DD for <input type="date"> */
export function toDateInputValue(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export function fromDateInputValue(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

const DAY_MS = 86_400_000;
export function daysAgo(d: Date): number {
  const today = todayLocal();
  return Math.round((today.getTime() - d.getTime()) / DAY_MS);
}

const FMT_ID = new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: 'long', year: 'numeric' });
export function formatDateID(d: Date): string {
  return FMT_ID.format(d);
}
