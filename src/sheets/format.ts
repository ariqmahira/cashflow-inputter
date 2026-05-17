const IDR = new Intl.NumberFormat('id-ID', {
  style: 'currency',
  currency: 'IDR',
  maximumFractionDigits: 0,
});

export function formatIDR(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return 'Rp 0';
  return IDR.format(n);
}

export function parseAmount(s: string): number | null {
  if (!s) return null;
  const cleaned = s.replace(/[^\d-]/g, '');
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}
