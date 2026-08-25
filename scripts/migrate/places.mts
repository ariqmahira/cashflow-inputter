/**
 * Place (lokasi) canonicalization.
 *
 * 60 distinct spellings for roughly 32 real venues, blank on 26 rows. Unlike merchants,
 * places are NOT fuzzy-matched: the variance here is abbreviation (`GI`, `Kokas`, `Gancit`)
 * rather than typo, and no edit-distance metric connects `GI` to `Grand Indonesia`. So the
 * alias map is explicit and hand-verified, and anything not in it is kept as written.
 *
 * Some cells record a trip rather than a place — `PI - MKG`, `Kuncit - Rwm - Taman Rasuna`.
 * These take the first venue and keep the original string as a note.
 */

import { normalizeKey, tidyDisplay } from './text.mts';

/**
 * Canonical name to the spellings that mean it. Case and punctuation are handled by
 * `normalizeKey`, so only genuinely different words need listing here.
 */
const PLACE_ALIASES: Record<string, string[]> = {
  'Grand Indonesia': ['GI', 'Sebrang GI'],
  Rawamangun: ['Rwm', 'RWM', 'RWN'],
  'Kota Kasablanka': ['Kokas'],
  'Plaza Indonesia': ['PI'],
  'Kelapa Gading': ['Gading'],
  'Gandaria City': ['Gancit'],
  'Kuningan City': ['Kuncit'],
  'Lotte Avenue': ['Lotte'],
  'Pacific Place': ['Pacitic Place'],
  'Mall of Indonesia': ['MOI'],
  'Taman Ismail Marzuki': ['TIM'],
};

/**
 * Plausible merges left UNAPPLIED because they are judgement calls, not typo fixes. They
 * surface in the migration report so they can be confirmed or rejected in the app later.
 *
 * `MKG` is the mall; `Kelapa Gading` is the district it sits in. In a spending log they
 * probably mean the same trip, but "probably" is not grounds for silently rewriting data.
 */
export const SUGGESTED_PLACE_MERGES: { keep: string; consider: string; why: string }[] = [
  {
    keep: 'MKG',
    consider: 'Kelapa Gading',
    why: 'MKG is the mall inside the Kelapa Gading district; these may be one destination',
  },
];

/** Separators that indicate a trip across several venues rather than a single place. */
const TRIP_SPLIT = /\s*-\s*/;

export type PlaceResolution = {
  /** Canonical place, or null when the cell was blank. */
  place: string | null;
  /** Set when the original recorded a multi-venue trip. */
  note?: string;
};

export type PlaceIndex = {
  /** Canonical name to every original spelling seen for it. */
  clusters: { canonical: string; variants: string[]; count: number }[];
  resolve: (raw: unknown) => PlaceResolution;
};

function buildAliasLookup(): Map<string, string> {
  const lookup = new Map<string, string>();
  for (const [canonical, aliases] of Object.entries(PLACE_ALIASES)) {
    lookup.set(normalizeKey(canonical), canonical);
    for (const a of aliases) lookup.set(normalizeKey(a), canonical);
  }
  return lookup;
}

export function buildPlaceIndex(rawValues: unknown[]): PlaceIndex {
  const aliases = buildAliasLookup();
  // Preserves the first-seen spelling for names that are not in the alias map, so the
  // user's own capitalisation survives.
  const seenSpelling = new Map<string, string>();

  const canonicalize = (name: string): string => {
    const key = normalizeKey(name);
    const alias = aliases.get(key);
    if (alias) return alias;
    if (!seenSpelling.has(key)) seenSpelling.set(key, tidyDisplay(name));
    return seenSpelling.get(key)!;
  };

  const resolve = (raw: unknown): PlaceResolution => {
    if (typeof raw !== 'string') return { place: null };
    const tidy = tidyDisplay(raw);
    if (!tidy) return { place: null };

    const legs = tidy.split(TRIP_SPLIT).filter(Boolean);
    if (legs.length > 1) {
      return {
        place: canonicalize(legs[0]),
        note: `recorded as a trip: "${tidy}"`,
      };
    }
    return { place: canonicalize(tidy) };
  };

  // Two passes: the first settles which spelling wins for each unseen name, the second
  // counts, so the counts describe the final canonical set rather than the discovery order.
  for (const raw of rawValues) resolve(raw);

  const counts = new Map<string, Map<string, number>>();
  for (const raw of rawValues) {
    if (typeof raw !== 'string') continue;
    const tidy = tidyDisplay(raw);
    if (!tidy) continue;
    const { place } = resolve(raw);
    if (!place) continue;
    const bucket = counts.get(place) ?? new Map<string, number>();
    bucket.set(tidy, (bucket.get(tidy) ?? 0) + 1);
    counts.set(place, bucket);
  }

  const clusters = [...counts.entries()]
    .map(([canonical, variants]) => ({
      canonical,
      variants: [...variants.keys()].sort(),
      count: [...variants.values()].reduce((a, b) => a + b, 0),
    }))
    .sort((a, b) => b.count - a.count || a.canonical.localeCompare(b.canonical));

  return { clusters, resolve };
}
