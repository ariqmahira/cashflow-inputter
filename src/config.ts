export const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? '';
export const SPREADSHEET_ID = import.meta.env.VITE_SPREADSHEET_ID ?? '';

export const SCOPES = 'https://www.googleapis.com/auth/spreadsheets';

export const EXPENSE_CATEGORIES = ['Makan', 'Hiburan', 'Transportasi'] as const;

export const DEFAULT_INCOME_CATEGORIES = ['Kas Ariq', 'Kas', 'Gaji', 'Transfer'];

export const MONTHS_ID = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
] as const;

export const sheetTitleFor = (d: Date) =>
  `${MONTHS_ID[d.getMonth()]} ${d.getFullYear()}`;

export const DATA_RANGE = {
  expense: { startRow: 5, cols: 'H:L' },
  income: { startRow: 5, cols: 'N:Q' },
} as const;
