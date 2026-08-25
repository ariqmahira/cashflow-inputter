import { describe, expect, it } from 'vitest';
import { CATEGORIES, deriveCategory } from './categories.mts';
import { buildMerchantIndex } from './merchants.mts';

describe('deriveCategory', () => {
  describe('fixes what the workbook got wrong', () => {
    // These four are the reason the `jenis` column is ignored entirely.
    it('files a cinema ticket as Hiburan, not Makan', () => {
      expect(deriveCategory('XXI').category).toBe('Hiburan');
    });

    it('files a locker as Lainnya, not Makan', () => {
      expect(deriveCategory('LOKER MAHAL').category).toBe('Lainnya');
      expect(deriveCategory('Loker FX').category).toBe('Lainnya');
    });

    it('files ride-hailing as Transportasi, not Hiburan', () => {
      expect(deriveCategory('Gocar').category).toBe('Transportasi');
      expect(deriveCategory('Grab').category).toBe('Transportasi');
    });

    it('files a car wash as Transportasi', () => {
      expect(deriveCategory('Cuci Mobil').category).toBe('Transportasi');
    });
  });

  describe('splits the old Makan bucket', () => {
    it.each([
      ['Yakiniku Like', 'Restoran'],
      ['Bakmi GM', 'Restoran'],
      ['KFC', 'Restoran'],
      ['Chagee', 'Kopi & Minuman'],
      ['Air Mineral', 'Kopi & Minuman'],
      ['Kopi Tuku', 'Kopi & Minuman'],
      ['Beard Papa', 'Jajan & Snack'],
      ['Popcorn', 'Jajan & Snack'],
      ['Circle K', 'Groceries'],
      ['Family Mart', 'Groceries'],
    ])('%s becomes %s', (merchant, expected) => {
      expect(deriveCategory(merchant).category).toBe(expected);
    });
  });

  it('distinguishes the cinema from its concession stand', () => {
    expect(deriveCategory('XXI').category).toBe('Hiburan');
    expect(deriveCategory('XXI Cafe').category).toBe('Restoran');
    expect(deriveCategory('XXI Lemonade').category).toBe('Kopi & Minuman');
  });

  it('reports how each decision was reached', () => {
    expect(deriveCategory('Gocar').confidence).toBe('merchant');
    expect(deriveCategory('Nasi Kapau').confidence).toBe('keyword');
    expect(deriveCategory('Qq').confidence).toBe('fallback');
  });

  it('lands unknown merchants in Lainnya rather than guessing at food', () => {
    const unknown = deriveCategory('Zzzz Unknown Merchant');
    expect(unknown.category).toBe('Lainnya');
    expect(unknown.confidence).toBe('fallback');
  });

  it('always returns a category from the agreed list of ten', () => {
    for (const name of ['Sushi Tei', 'Qq', 'Uniqlo', 'Tol', 'Photobooth']) {
      expect(CATEGORIES).toContain(deriveCategory(name).category);
    }
  });

  it('matches on whole words, so `air` does not fire inside another word', () => {
    // Guards the drink rule against names like "Fairmont" or "Chairman".
    expect(deriveCategory('Fairmont Steak').category).toBe('Restoran');
  });
});

describe('canonicalization feeding derivation', () => {
  it('routes every spelling of a merchant to the same category', () => {
    const names = ['Sei-Rock Ya', 'Seirock ya', 'Seirock-ya', 'Seirockya'];
    const idx = buildMerchantIndex(names);
    const categories = names.map((n) => deriveCategory(idx.lookup.get(n)!).category);
    expect(new Set(categories)).toEqual(new Set(['Restoran']));
  });

  it('keeps a hand-verified canonical name over a more frequent misspelling', () => {
    // `Taichan` appears twice and `Sate Taichan` once, but the alias map is authoritative —
    // and only the full name reaches the `sate` keyword rule.
    const idx = buildMerchantIndex(['Taichan', 'Taichan', 'Sate Taichan']);
    expect(idx.lookup.get('Taichan')).toBe('Sate Taichan');
    expect(deriveCategory(idx.lookup.get('Taichan')!).category).toBe('Restoran');
  });

  it('resolves the four-way Thai restaurant misspelling to one category', () => {
    const names = ['Chien Kang Thai', 'Chang Thai', 'Cheng Kang Tang', 'Chien Khang Thang'];
    const idx = buildMerchantIndex(names);
    expect(new Set(names.map((n) => idx.lookup.get(n)))).toEqual(new Set(['Chien Kang Thai']));
    expect(deriveCategory('Chien Kang Thai').category).toBe('Restoran');
  });
});
