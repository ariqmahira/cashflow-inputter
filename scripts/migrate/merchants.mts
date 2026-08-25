/**
 * Merchant canonicalization.
 *
 * 214 distinct spellings across 292 rows, 167 of them appearing exactly once. Most variants
 * collapse on normalization alone (`Seirock ya` / `Sei-Rock Ya` / `Seirock-ya` / `Seirockya`
 * all key to `seirockya`). The rest need fuzzy matching, which is where the risk lives:
 * `J.co` and `J.cool` are one edit apart and are different businesses.
 *
 * Three layers, in order of trust:
 *   1. `KNOWN_ALIASES` — hand-verified pairs that fuzzy matching misses entirely.
 *   2. `NEVER_MERGE`   — hand-verified pairs that fuzzy matching would wrongly join.
 *   3. Fuzzy clustering at `SIMILARITY_THRESHOLD`, for everything else.
 */

import { normalizeKey, similarity, tidyDisplay } from './text.mts';

/**
 * Below this, two normalized names are treated as different merchants.
 *
 * 0.85 is tuned against the real data: it joins `shihlin`/`shilin` (0.857) and
 * `bakmigm`/`bakmiegm` (0.875), while leaving `jco`/`jcool` (0.60) and
 * `sushiblokm`/`mieblokm` (0.70) apart.
 */
const SIMILARITY_THRESHOLD = 0.85;

/**
 * Same business, but too far apart for fuzzy matching to see. Canonical name first.
 * Verified by hand against the workbook.
 */
const KNOWN_ALIASES: Record<string, string[]> = {
  'Fried Chicken Master': ['Chicken Master', 'FCM'],
  'Nasi Uduk OK': ['Uduk Ok'],
  'Ya Kun Kaya Toast': ['Kun Kaya Toast'],
  // The same Thai restaurant, misspelled four ways across two different categories.
  'Chien Kang Thai': ['Chang Thai', 'Cheng Kang Tang', 'Chien Khang Thang'],
  // Ride-hailing, with the route typed into the merchant field.
  Gocar: ['Gocar Klender-MKG', 'Gocar Lotte-Rwm-TRA', 'Gocar MKG-Rwm-Apart'],
  Grab: ['Grab Car'],
  'Sate Taichan': ['Taichan', 'Taichan Mampang', 'Sate Taichan Mampang'],
  'Es Pisang Ijo': ['Es Pisang Ijo Pemuda', 'Pisang Ijo'],
  'Air Mineral': ['Mineral', 'Mineral Water'],
  Meiso: ['Meiso + Tip'],
};

/**
 * Never join these, whatever the similarity score says. Each pair is a real false positive
 * found while exploring the data.
 */
const NEVER_MERGE: [string, string][] = [
  ['J.co', 'J.cool'], // donuts vs the ice cream spin-off
  ['Sushi Blok M', 'Mie Blok M'], // two different places that share a location suffix
  ['Meiso', 'Tip Meiso'], // the claw machine, and the tip left at it
];

export type MerchantCluster = {
  canonical: string;
  /** Every original spelling seen, including the canonical one. */
  variants: string[];
  count: number;
};

export type MerchantIndex = {
  clusters: MerchantCluster[];
  /** Original spelling (tidied) to canonical name. */
  lookup: Map<string, string>;
  /** Merges the fuzzy layer performed, for the report. */
  fuzzyMerges: { canonical: string; absorbed: string; score: number }[];
};

function neverMergeKeys(): Set<string> {
  const s = new Set<string>();
  for (const [a, b] of NEVER_MERGE) {
    const [ka, kb] = [normalizeKey(a), normalizeKey(b)].sort();
    s.add(`${ka}::${kb}`);
  }
  return s;
}

function isBlocked(blocked: Set<string>, a: string, b: string): boolean {
  const [x, y] = [a, b].sort();
  return blocked.has(`${x}::${y}`);
}

/**
 * Picks the spelling to keep: most frequent wins, then longest (it usually carries the full
 * name rather than an abbreviation), then alphabetical so the result is deterministic.
 */
function pickCanonical(variants: Map<string, number>): string {
  return [...variants.entries()].sort(
    (a, b) => b[1] - a[1] || b[0].length - a[0].length || a[0].localeCompare(b[0]),
  )[0][0];
}

export function buildMerchantIndex(names: string[]): MerchantIndex {
  const blocked = neverMergeKeys();

  // Layer 1: exact key match. This alone resolves most of the variance.
  const byKey = new Map<string, Map<string, number>>();
  for (const raw of names) {
    const display = tidyDisplay(raw);
    if (!display) continue;
    const key = normalizeKey(display);
    if (!key) continue;
    const bucket = byKey.get(key) ?? new Map<string, number>();
    bucket.set(display, (bucket.get(display) ?? 0) + 1);
    byKey.set(key, bucket);
  }

  // Layer 2: hand-verified aliases, applied before fuzzy so they anchor the canonical name.
  //
  // The map key is the canonical name by fiat — it must NOT be re-derived by frequency
  // afterwards, or a common misspelling wins. `Taichan` (2 uses) would otherwise outvote
  // `Sate Taichan` (1), and `Chien Khang Thang` would beat `Chien Kang Thai` on length.
  const forcedCanonical = new Map<string, string>();
  for (const [canonical, aliases] of Object.entries(KNOWN_ALIASES)) {
    const canonicalKey = normalizeKey(canonical);
    const target = byKey.get(canonicalKey) ?? new Map<string, number>();
    let merged = false;
    for (const alias of aliases) {
      const aliasKey = normalizeKey(alias);
      if (aliasKey === canonicalKey) continue;
      const bucket = byKey.get(aliasKey);
      if (!bucket) continue;
      for (const [name, n] of bucket) target.set(name, (target.get(name) ?? 0) + n);
      byKey.delete(aliasKey);
      merged = true;
    }
    if (merged || byKey.has(canonicalKey)) {
      byKey.set(canonicalKey, target);
      forcedCanonical.set(canonicalKey, canonical);
    }
  }

  // Layer 3: fuzzy. Largest clusters absorb smaller ones, so the dominant spelling wins and
  // the pass is order-independent.
  const keys = [...byKey.keys()].sort((a, b) => {
    const size = (k: string) => [...byKey.get(k)!.values()].reduce((x, y) => x + y, 0);
    return size(b) - size(a) || a.localeCompare(b);
  });

  const canonicalFor = (key: string) => forcedCanonical.get(key) ?? pickCanonical(byKey.get(key)!);

  const fuzzyMerges: MerchantIndex['fuzzyMerges'] = [];
  const absorbed = new Set<string>();

  for (const key of keys) {
    if (absorbed.has(key)) continue;
    for (const other of keys) {
      if (other === key || absorbed.has(other)) continue;
      // A hand-verified cluster is never dissolved by a similarity score.
      if (forcedCanonical.has(other)) continue;
      if (isBlocked(blocked, key, other)) continue;
      const score = similarity(key, other);
      if (score < SIMILARITY_THRESHOLD) continue;

      const into = byKey.get(key)!;
      const from = byKey.get(other)!;
      fuzzyMerges.push({
        canonical: canonicalFor(key),
        absorbed: pickCanonical(from),
        score: Number(score.toFixed(3)),
      });
      for (const [name, n] of from) into.set(name, (into.get(name) ?? 0) + n);
      absorbed.add(other);
    }
  }

  const clusters: MerchantCluster[] = [];
  const lookup = new Map<string, string>();
  for (const [key, variants] of byKey) {
    if (absorbed.has(key)) continue;
    const canonical = canonicalFor(key);
    const count = [...variants.values()].reduce((a, b) => a + b, 0);
    const spellings = new Set([...variants.keys(), canonical]);
    clusters.push({ canonical, variants: [...spellings].sort(), count });
    for (const v of spellings) lookup.set(v, canonical);
  }

  clusters.sort((a, b) => b.count - a.count || a.canonical.localeCompare(b.canonical));
  return { clusters, lookup, fuzzyMerges };
}
