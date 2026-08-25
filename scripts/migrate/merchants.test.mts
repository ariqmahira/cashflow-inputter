import { describe, expect, it } from 'vitest';
import { buildMerchantIndex } from './merchants.mts';
import { normalizeKey, similarity } from './text.mts';

/** Resolves a spelling to its canonical name, for readable assertions. */
const resolve = (names: string[], of: string) => buildMerchantIndex(names).lookup.get(of);

describe('normalizeKey', () => {
  it('collapses punctuation, case, and spacing', () => {
    const keys = ['Sei-Rock Ya', 'Seirock ya', 'Seirock-ya', 'Seirockya'].map(normalizeKey);
    expect(new Set(keys).size).toBe(1);
  });

  it('reduces A&W, AW, and Aw to one key', () => {
    expect(new Set(['A&W', 'AW', 'Aw'].map(normalizeKey)).size).toBe(1);
  });
});

describe('buildMerchantIndex', () => {
  it('merges spelling variants that normalize identically', () => {
    const names = ['Sei-Rock Ya', 'Seirock ya', 'Seirock-ya', 'Seirockya'];
    const idx = buildMerchantIndex(names);
    expect(idx.clusters).toHaveLength(1);
    expect(idx.clusters[0].count).toBe(4);
    expect(idx.clusters[0].variants).toHaveLength(4);
  });

  it('merges near-misses above the similarity threshold', () => {
    const names = ['Shihlin', 'Shihlin', 'Shilin'];
    expect(resolve(names, 'Shilin')).toBe('Shihlin');
  });

  it('applies hand-verified aliases that fuzzy matching cannot see', () => {
    // 0.72 similarity — far below the threshold, but the same restaurant.
    const names = ['Fried Chicken Master', 'Fried Chicken Master', 'Chicken Master'];
    expect(similarity(normalizeKey('Fried Chicken Master'), normalizeKey('Chicken Master')))
      .toBeLessThan(0.85);
    expect(resolve(names, 'Chicken Master')).toBe('Fried Chicken Master');
  });

  describe('refuses the known false positives', () => {
    it('keeps J.co and J.cool apart', () => {
      const idx = buildMerchantIndex(['J.co', 'J.co', 'J.cool']);
      expect(idx.clusters).toHaveLength(2);
    });

    it('keeps Sushi Blok M and Mie Blok M apart', () => {
      const idx = buildMerchantIndex(['Sushi Blok M', 'Mie Blok M']);
      expect(idx.clusters).toHaveLength(2);
    });

    it('keeps a tip distinct from the thing it was paid at', () => {
      const idx = buildMerchantIndex(['Meiso', 'Meiso', 'Tip Meiso']);
      expect(idx.clusters).toHaveLength(2);
    });
  });

  it('keeps the most frequent spelling as canonical', () => {
    const names = ['Yakiniku like', 'Yakiniku Like', 'Yakiniku Like'];
    expect(resolve(names, 'Yakiniku like')).toBe('Yakiniku Like');
  });

  it('is deterministic regardless of input order', () => {
    const names = ['Bakmi GM', 'bakmie gm', 'Shihlin', 'Shilin', 'A&W', 'Aw', 'J.co', 'J.cool'];
    const forward = buildMerchantIndex(names).clusters.map((c) => c.canonical);
    const backward = buildMerchantIndex([...names].reverse()).clusters.map((c) => c.canonical);
    expect(new Set(forward)).toEqual(new Set(backward));
  });

  it('ignores blank and whitespace-only names', () => {
    const idx = buildMerchantIndex(['Chagee', '', '   ', 'Chagee']);
    expect(idx.clusters).toHaveLength(1);
    expect(idx.clusters[0].count).toBe(2);
  });

  it('trims a trailing space rather than creating a second merchant', () => {
    // `'Juni 2026'!I12` holds `"Mineral "`.
    const idx = buildMerchantIndex(['Mineral', 'Mineral ']);
    expect(idx.clusters).toHaveLength(1);
  });
});
