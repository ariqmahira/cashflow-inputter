/**
 * Category derivation.
 *
 * The workbook's own `Jenis Pengeluaran` column is NOT used as input. It has degenerated
 * into a catch-all: `Makan` covers 218 of 292 rows and contains a cinema ticket (`XXI`,
 * 145,000), a locker (`LOKER MAHAL`, 36,000) and a bowl of noodles alike, while `Gocar` and
 * `Grab Car` sit under `Hiburan`. Carrying those values forward would import the mess.
 *
 * Instead each row's category is derived from its canonical merchant, in three layers:
 *
 *   `merchant` — an explicit, hand-checked mapping. Highest confidence.
 *   `keyword`  — a word in the merchant name that reliably implies a category.
 *   `fallback` — nothing matched; the row lands in `Lainnya` and is listed in the report.
 *
 * The confidence level travels into the migration report so the guesses can be reviewed
 * separately from the certainties.
 */

import { normalizeKey } from './text.mts';

export const CATEGORIES = [
  'Restoran',
  'Kopi & Minuman',
  'Jajan & Snack',
  'Groceries',
  'Transportasi',
  'Hiburan',
  'Foto & Aktivitas',
  'Belanja',
  'Hadiah',
  'Lainnya',
] as const;

export type Category = (typeof CATEGORIES)[number];

export type CategoryDerivation = {
  category: Category;
  confidence: 'merchant' | 'keyword' | 'fallback';
  /** The rule that fired, for the report. */
  matched?: string;
};

/**
 * Explicit merchant assignments. Keyed by normalized name so spelling variants all land
 * here. Only merchants whose category a keyword would get wrong, or would not reach at all.
 */
const MERCHANT_CATEGORY: Record<string, Category> = {
  // Cinema — `XXI` alone is a ticket, but the cafe and the lemonade are food and drink.
  xxi: 'Hiburan',
  xxicafe: 'Restoran',
  xxilemonade: 'Kopi & Minuman',
  cgv: 'Hiburan',
  bioskop: 'Hiburan',
  nonton: 'Hiburan',
  metropole: 'Hiburan',

  // Attractions and outings.
  funworld: 'Hiburan',
  timezone: 'Hiburan',
  jakartaaquarium: 'Hiburan',
  tmii: 'Hiburan',
  ancol: 'Hiburan',
  ancoltiket: 'Hiburan',
  masukmuseumseni: 'Hiburan',
  tiketmasukparkir: 'Hiburan',
  belitiketboyziimen: 'Hiburan',
  kipasboyziimen: 'Hiburan',
  burung: 'Hiburan',
  sepeda: 'Hiburan',
  skorz: 'Hiburan',
  meiso: 'Hiburan',
  tipmeiso: 'Hiburan',

  // Activities you do rather than watch.
  photobooth: 'Foto & Aktivitas',
  photoboothabe: 'Foto & Aktivitas',
  selfietime: 'Foto & Aktivitas',
  potterybakarkeramik: 'Foto & Aktivitas',
  sticker: 'Foto & Aktivitas',

  // Retail.
  uniqlo: 'Belanja',
  kkv: 'Belanja',
  kaoskakiskorz: 'Belanja',

  // Gifts, which are about intent rather than what was bought.
  bungaodoy: 'Hadiah',
  burungmonas: 'Hadiah',
  fcmaudreyenda: 'Hadiah',

  // Groceries and convenience.
  circlek: 'Groceries',
  familymart: 'Groceries',
  kmart: 'Groceries',
  foodhallcourt: 'Groceries',

  // Transport.
  gocar: 'Transportasi',
  grab: 'Transportasi',
  maxim: 'Transportasi',
  angkot: 'Transportasi',
  tol: 'Transportasi',
  cucimobil: 'Transportasi',
  greensm: 'Transportasi',

  // `loker` is a locker, not a job and not lunch.
  lokerfx: 'Lainnya',
  lokermahal: 'Lainnya',
  locket: 'Lainnya',
  paxel: 'Lainnya',
  paxelbox: 'Lainnya',
  card: 'Lainnya',
  tip: 'Lainnya',
  tipcheng: 'Lainnya',

  // Drinks whose names carry no category-bearing word.
  chagee: 'Kopi & Minuman',
  tomoro: 'Kopi & Minuman',
  banban: 'Kopi & Minuman',
  boost: 'Kopi & Minuman',
  koi: 'Kopi & Minuman',
  aqua: 'Kopi & Minuman',
  pocari: 'Kopi & Minuman',
  pocariaqua: 'Kopi & Minuman',
  mizone: 'Kopi & Minuman',
  nutrisari: 'Kopi & Minuman',
  leminerale: 'Kopi & Minuman',
  mineralguardian: 'Kopi & Minuman',
  dumdum: 'Kopi & Minuman',
  coldmoo: 'Kopi & Minuman',
  tebu: 'Kopi & Minuman',
  kelapamuda: 'Kopi & Minuman',
  yole: 'Kopi & Minuman',
  minum: 'Kopi & Minuman',

  // Snacks and desserts.
  beardpapa: 'Jajan & Snack',
  jco: 'Jajan & Snack',
  jcool: 'Jajan & Snack',
  soursally: 'Jajan & Snack',
  mochimochi: 'Jajan & Snack',
  rotiboy: 'Jajan & Snack',
  cinnabon: 'Jajan & Snack',
  crepes: 'Jajan & Snack',
  auntieannes: 'Jajan & Snack',
  dairyqueen: 'Jajan & Snack',
  icecream: 'Jajan & Snack',
  popcorn: 'Jajan & Snack',
  kerupuk: 'Jajan & Snack',
  justcoco: 'Jajan & Snack',
  shihlin: 'Jajan & Snack',
  mendoan: 'Jajan & Snack',
  pipiltin: 'Jajan & Snack',
  trufflebelly: 'Jajan & Snack',
  nasipuddingsusu: 'Jajan & Snack',
  endorphin: 'Jajan & Snack',
  heottoekgatau: 'Jajan & Snack',

  // Restaurants whose names contain no dish word.
  yoshinoya: 'Restoran',
  aw: 'Restoran',
  kfc: 'Restoran',
  wingstop: 'Restoran',
  hokben: 'Restoran',
  solaria: 'Restoran',
  haidilao: 'Restoran',
  ootoya: 'Restoran',
  isshin: 'Restoran',
  santhai: 'Restoran',
  popolamama: 'Restoran',
  kimukatsu: 'Restoran',
  sederhana: 'Restoran',
  leko: 'Restoran',
  sura: 'Restoran',
  mala: 'Restoran',
  laobao: 'Restoran',
  ojju: 'Restoran',
  monami: 'Restoran',
  nannys: 'Restoran',
  papaloma: 'Restoran',
  beringin: 'Restoran',
  gentongmas: 'Restoran',
  saritatu: 'Restoran',
  sariratu: 'Restoran',
  payakumbuah: 'Restoran',
  ciganea: 'Restoran',
  chikuro: 'Restoran',
  kazuko: 'Restoran',
  sushiro: 'Restoran',
  futagoya: 'Restoran',
  hokkaido: 'Restoran',
  hokkaidoya: 'Restoran',
  halalguys: 'Restoran',
  edogawasushi: 'Restoran',
  kappasushi: 'Restoran',
  seirockya: 'Restoran',
  yakinikulike: 'Restoran',
  taliwangbali: 'Restoran',
  menaralaut: 'Restoran',
  dragonhotpot: 'Restoran',
  koreanflamebbq: 'Restoran',
  sielongbao: 'Restoran',
  sujisuancaiyu: 'Restoran',
  tninetynine: 'Restoran',
  youmayoula: 'Restoran',
  yomayoula: 'Restoran',
  kedaiharapanibu: 'Restoran',
  maddgang: 'Restoran',
  manggang: 'Restoran',
  makanmetropole: 'Restoran',
  steak21: 'Restoran',
  burgerking: 'Restoran',
  burgerblokm: 'Restoran',
  bakmigm: 'Restoran',
  bakmigolek: 'Restoran',
  chienkangthai: 'Restoran',
  rakthai: 'Restoran',
  hangtuah: 'Restoran',
  almaz: 'Restoran',
  pancakeco: 'Jajan & Snack',
  yakunkayatoast: 'Restoran',
  satetaichan: 'Restoran',
  sateblora: 'Restoran',
  blora: 'Restoran',
  espisangijo: 'Jajan & Snack',
  airmineral: 'Kopi & Minuman',
  duren: 'Jajan & Snack',
};

/**
 * Ordered keyword rules; first match wins, so specific patterns come before general ones.
 * Word-boundary anchored against the ORIGINAL name (spaces intact), not the normalized key.
 */
const KEYWORD_RULES: { pattern: RegExp; category: Category; label: string }[] = [
  { pattern: /\b(gocar|grab|gojek|ojek|taksi|angkot|parkir|bensin|tol)\b/i, category: 'Transportasi', label: 'transport' },
  { pattern: /\b(tiket|konser|museum|aquarium|arcade)\b/i, category: 'Hiburan', label: 'outing' },
  { pattern: /\b(kopi|coffee|teh|tea|boba|juice|jus|air|mineral|minum|es)\b/i, category: 'Kopi & Minuman', label: 'drink' },
  { pattern: /\b(donut|dessert|pudding|pisang goreng|snack|jajan|mochi)\b/i, category: 'Jajan & Snack', label: 'snack' },
  {
    pattern: /\b(sushi|sashimi|ramen|udon|katsu|yakiniku|gyoza|bbq|hotpot|pho|thai|nasi|mie|bakmi|bakso|soto|sate|ayam|bebek|ikan|seafood|laut|gudeg|uduk|penyet|kapau|padang|aceh|warung|kedai|resto|steak|burger|pizza|chicken|masakan|makan)\b/i,
    category: 'Restoran',
    label: 'dish or eatery',
  },
  { pattern: /\b(bunga|hadiah|kado|gift)\b/i, category: 'Hadiah', label: 'gift' },
  { pattern: /\b(foto|photo|selfie|keramik|pottery)\b/i, category: 'Foto & Aktivitas', label: 'activity' },
  { pattern: /\b(loker|locker|paxel|kirim)\b/i, category: 'Lainnya', label: 'errand' },
];

/**
 * Derives a category from a canonical merchant name. Never consults the workbook's own
 * category column — see the note at the top of this file.
 */
export function deriveCategory(merchant: string): CategoryDerivation {
  const key = normalizeKey(merchant);

  const explicit = MERCHANT_CATEGORY[key];
  if (explicit) return { category: explicit, confidence: 'merchant', matched: merchant };

  for (const rule of KEYWORD_RULES) {
    if (rule.pattern.test(merchant)) {
      return { category: rule.category, confidence: 'keyword', matched: rule.label };
    }
  }

  return { category: 'Lainnya', confidence: 'fallback' };
}
