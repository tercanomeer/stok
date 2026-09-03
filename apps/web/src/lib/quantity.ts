/**
 * Miktar aritmetiği — YALNIZ gösterim için (sayım fark sütunu).
 *
 * Miktarlar API'den string gelir ve en fazla 3 ondalık taşır. Doğrudan float
 * çıkarma `0.30000000000000004` gibi artıklar üretir; burada binde birlik tam sayıya
 * ölçekleyip çıkarıyoruz. Stoğa yazılan gerçek fark SUNUCUDA Decimal ile hesaplanır
 * (CLAUDE.md: hesap backend/pos-core'da) — bu fonksiyon o sonucu belirlemez.
 */

const SCALE = 1000;

function toScaled(value: string): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? Math.round(parsed * SCALE) : 0;
}

/** `counted - expected`, 3 ondalığa kadar kayıpsız; sonuç string döner. */
export function quantityDifference(counted: string, expected: string): string {
  const diff = toScaled(counted) - toScaled(expected);
  return (diff / SCALE).toFixed(3).replace(/\.?0+$/, '') || '0';
}

/** Fark yönü: fazla / eksik / tam. */
export function differenceTone(difference: string): 'success' | 'danger' | 'neutral' {
  const value = Number.parseFloat(difference);
  if (value > 0) return 'success';
  if (value < 0) return 'danger';
  return 'neutral';
}
