/** Small string helpers shared by merchant and place canonicalization. */

/**
 * Reduces a name to a comparison key: lowercase, no punctuation, no whitespace.
 *
 * Dropping spaces entirely is deliberate — `Seirock ya`, `Sei-Rock Ya`, `Seirock-ya` and
 * `Seirockya` are one restaurant written four ways, and they collapse to the same key
 * without any fuzzy matching at all. Same for `A&W` / `AW` / `Aw`.
 */
export function normalizeKey(raw: string): string {
  return raw
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

/** Collapses runs of whitespace and trims. Used for display names, which keep their spaces. */
export function tidyDisplay(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ');
}

/** Levenshtein edit distance. Iterative, two-row, so long lists stay cheap. */
export function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  let curr = new Array<number>(b.length + 1);

  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[b.length];
}

/** 1 for identical strings, 0 for nothing in common. */
export function similarity(a: string, b: string): number {
  const longest = Math.max(a.length, b.length);
  if (longest === 0) return 1;
  return 1 - editDistance(a, b) / longest;
}
