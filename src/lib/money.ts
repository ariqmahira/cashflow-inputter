/**
 * Rupiah formatting.
 *
 * Amounts are whole rupiah as `bigint`-backed numbers; there are no cents to show and
 * showing them would be noise. Grouping uses the Indonesian convention (`Rp1.250.000`).
 */

const full = new Intl.NumberFormat('id-ID', {
  style: 'currency',
  currency: 'IDR',
  maximumFractionDigits: 0,
});

const plain = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 });

/** `Rp1.250.000` — for anywhere the currency is not already obvious from context. */
export function formatIdr(amount: number): string {
  return full.format(amount);
}

/** `1.250.000` — for tables and keypads, where a repeated `Rp` is just clutter. */
export function formatAmount(amount: number): string {
  return plain.format(amount);
}

/**
 * Shortens large figures for tight spaces: `1.2M`, `450k`.
 */
export function formatIdrShort(amount: number): string {
  const abs = Math.abs(amount);
  const sign = amount < 0 ? '-' : '';
  if (abs >= 1_000_000) {
    const millions = abs / 1_000_000;
    return `${sign}${millions.toFixed(millions >= 10 ? 0 : 1)}M`;
  }
  if (abs >= 1_000) return `${sign}${Math.round(abs / 1_000)}k`;
  return `${sign}${abs}`;
}

/**
 * Reads what someone typed into an amount field.
 *
 * Accepts the separators people actually use — `50.000`, `50 000`, `50,000` — and returns
 * null rather than a wrong number when the input is not salvageable. `Rp` prefixes and
 * stray spaces are ignored.
 */
export function parseAmount(input: string): number | null {
  const cleaned = input.replace(/rp/gi, '').replace(/[.,\s]/g, '').trim();
  if (!cleaned || !/^\d+$/.test(cleaned)) return null;
  const value = Number(cleaned);
  return Number.isSafeInteger(value) ? value : null;
}
