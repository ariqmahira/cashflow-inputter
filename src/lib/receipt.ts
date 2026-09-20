/**
 * Reading a receipt's text.
 *
 * The OCR itself is somebody else's problem — this module starts from lines of recognised
 * text and ends at the three fields the expense form needs. It is deliberately free of any
 * Capacitor import so it runs anywhere, including under a test runner with no device.
 *
 * Everything here is allowed to give up. A receipt that yields a date but no total returns a
 * date and no total; the form's own save gate handles the rest. Guessing would be worse than
 * blank, because a wrong number that looks plausible gets saved.
 */

import { daysBetween, isRealDate, toPlainDate, type PlainDate } from './plain-date';
import { parseReceiptAmount } from './money';
import type { Merchant } from './queries';

export type ParsedReceipt = {
  amountIdr?: number;
  merchantText?: string;
  occurredOn?: PlainDate;
};

export function parseReceipt(
  lines: string[],
  { today, merchants }: { today: PlainDate; merchants: Merchant[] },
): ParsedReceipt {
  const clean = lines.map((l) => l.trim()).filter(Boolean);
  return {
    amountIdr: findTotal(clean),
    merchantText: findMerchant(clean, merchants),
    occurredOn: findDate(clean, today),
  };
}

/* ------------------------------------------------------------------ amount */

/** The line that carries the figure actually owed. */
const TOTAL_ANCHOR = /total|jumlah/i;

/**
 * Lines that look like a total and are not one.
 *
 * `TUNAI` / `CASH` is what the customer handed over and `KEMBALI` is what came back, and
 * both are printed *below* the total in the same label-and-figure shape. Pay Rp 50.000 on a
 * Rp 43.500 bill and any "biggest number" or "last number" rule reads 50.000. This is the
 * single most likely way for the scanner to be confidently wrong, so the exclusions are
 * checked before the anchor rather than after.
 */
const NOT_A_TOTAL =
  /sub\s*-?\s*total|tunai|cash|kembali|kembalian|change|tukar|item|qty|barang|pcs|diskon|discount/i;

/**
 * The range a real bill falls in.
 *
 * The ceiling catches a misread phone number or NPWP. The floor catches the more likely
 * mistake: `TOTAL ITEM 3` is a count, not money, and nothing in this country costs Rp 3. Any
 * label carrying a count rather than a price is already excluded above; this is the net under
 * that, for the ones phrased in a way nobody anticipated.
 */
const MIN_PLAUSIBLE_IDR = 100;
const MAX_PLAUSIBLE_IDR = 100_000_000;

function findTotal(lines: string[]): number | undefined {
  const candidates: number[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (NOT_A_TOTAL.test(line) || !TOTAL_ANCHOR.test(line)) continue;

    // The figure usually sits on the same line, right-aligned. When the label wraps, it is
    // the first thing on the next one.
    const amount = lastAmountIn(line) ?? (i + 1 < lines.length ? lastAmountIn(lines[i + 1]) : null);
    if (amount !== null && amount >= MIN_PLAUSIBLE_IDR && amount <= MAX_PLAUSIBLE_IDR) {
      candidates.push(amount);
    }
  }

  // The last surviving candidate wins, so `TOTAL BAYAR` beats an earlier `TOTAL ITEM`.
  return candidates.at(-1);
}

/** Receipts print the label left and the figure right, so the rightmost number is the one. */
function lastAmountIn(line: string): number | null {
  const tokens = line.match(/\d[\d.,]*/g);
  if (!tokens) return null;
  for (let i = tokens.length - 1; i >= 0; i--) {
    const value = parseReceiptAmount(tokens[i]);
    if (value !== null) return value;
  }
  return null;
}

/* ---------------------------------------------------------------- merchant */

/** Header lines that are the shop's paperwork rather than its name. */
const NOT_A_NAME =
  /^(jl|jln|jalan|no|telp|telepon|phone|npwp|kasir|cashier|struk|receipt|bill|invoice|tel)\b|^[\d\W]+$/i;

/**
 * The shop's name, from the top of the receipt.
 *
 * A match against a known merchant is worth far more than the raw text, because the form
 * turns a known merchant into a category by itself. A miss still returns the header line:
 * it is editable before saving, and half-right beats empty.
 */
function findMerchant(lines: string[], merchants: Merchant[]): string | undefined {
  const header = lines.filter((l) => !NOT_A_NAME.test(l) && /\p{L}/u.test(l)).slice(0, 3);
  if (header.length === 0) return undefined;

  for (const line of header) {
    const known = matchKnown(line, merchants);
    if (known) return known;
  }
  return tidyName(header[0]);
}

/**
 * Matches a header line against every canonical name and alias.
 *
 * Containment either way, because OCR reads the whole sign: the line is often
 * `ALFAMART CIPINANG` when the merchant is `Alfamart`, and occasionally the reverse. Longer
 * merchant names win, so `Sushi Tei` is preferred over a stray `Tei` if both were to match.
 */
function matchKnown(line: string, merchants: Merchant[]): string | null {
  const key = normalize(line);
  if (key.length < 3) return null;

  let best: { name: string; length: number } | null = null;
  for (const merchant of merchants) {
    for (const candidate of [merchant.name, ...merchant.aliases]) {
      const candidateKey = normalize(candidate);
      if (candidateKey.length < 3) continue;
      if (!key.includes(candidateKey) && !candidateKey.includes(key)) continue;
      if (!best || candidateKey.length > best.length) {
        best = { name: merchant.name, length: candidateKey.length };
      }
    }
  }
  return best?.name ?? null;
}

function normalize(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** Tills shout. The rest of the app does not, and neither do the seeded merchant names. */
function tidyName(line: string): string {
  const collapsed = line.replace(/\s+/g, ' ').trim();
  if (collapsed !== collapsed.toUpperCase()) return collapsed;
  return collapsed
    .toLowerCase()
    .replace(/\b\p{Ll}/gu, (c) => c.toUpperCase());
}

/* -------------------------------------------------------------------- date */

const MONTH_NAMES: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, mei: 5, may: 5, jun: 6, jul: 7,
  agu: 8, agt: 8, aug: 8, sep: 9, okt: 10, oct: 10, nov: 11, des: 12, dec: 12,
};

/** `12/03/2026`, `12-3-26`, `12.03.2026` — day first, and often glued to a time. */
const NUMERIC_DATE = /(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/;
/** `2026-03-12`, which tills configured in English sometimes print. */
const ISO_DATE = /(\d{4})-(\d{2})-(\d{2})/;
/** `12 Mar 2026`, `12 Maret 2026`. */
const NAMED_DATE = /(\d{1,2})\s+(\p{L}{3,})\s+(\d{2,4})/u;

/**
 * How far back a scanned date is allowed to reach.
 *
 * `12/03/2026` is day-first here and month-first in half the world's software, and for any
 * day under 13 the two readings are both valid dates. Assuming Indonesian order is right far
 * more often than not; this window is what stops the rare wrong reading from landing a
 * purchase in the middle of last year. Anything outside it falls back to today, which is
 * what the form would have used anyway.
 */
const MAX_AGE_DAYS = 90;

function findDate(lines: string[], today: PlainDate): PlainDate | undefined {
  for (const line of lines) {
    const parsed = parseDateIn(line);
    if (!parsed) continue;
    const age = daysBetween(parsed, today);
    if (age < 0 || age > MAX_AGE_DAYS) continue;
    return parsed;
  }
  return undefined;
}

function parseDateIn(line: string): PlainDate | null {
  const iso = ISO_DATE.exec(line);
  if (iso) return build(Number(iso[1]), Number(iso[2]), Number(iso[3]));

  const numeric = NUMERIC_DATE.exec(line);
  if (numeric) {
    return build(expandYear(Number(numeric[3])), Number(numeric[2]), Number(numeric[1]));
  }

  const named = NAMED_DATE.exec(line);
  if (named) {
    const month = MONTH_NAMES[named[2].slice(0, 3).toLowerCase()];
    if (month) return build(expandYear(Number(named[3])), month, Number(named[1]));
  }

  return null;
}

function expandYear(year: number): number {
  return year < 100 ? 2000 + year : year;
}

function build(year: number, month: number, day: number): PlainDate | null {
  return isRealDate(year, month, day) ? toPlainDate(year, month, day) : null;
}
