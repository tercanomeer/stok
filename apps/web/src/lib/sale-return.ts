import type { SaleItemDetail } from './api-types';

/**
 * Bir kalemden HÂLÂ iade edilebilecek miktar.
 *
 * Sunucu `createReturn` içinde aynı kuralı uyguluyor (satılan − iade edilmiş);
 * ekran bunu önden gösterir ki kasiyer reddedilecek bir iadeyi yazmasın.
 * Miktarlar 3 ondalıklı; binde birlik tam sayıya ölçekleyip çıkarıyoruz —
 * float çıkarma `0.29999999` gibi kalıntı üretir ve "kalan 0" satırını
 * yanlışlıkla iade edilebilir gösterirdi.
 */
const SCALE = 1000;

function toScaled(value: string): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? Math.round(parsed * SCALE) : 0;
}

export function returnedQuantity(item: SaleItemDetail): string {
  const total = item.returnItems.reduce((sum, entry) => sum + toScaled(entry.quantity), 0);
  return (total / SCALE).toFixed(3).replace(/\.?0+$/, '') || '0';
}

export function remainingQuantity(item: SaleItemDetail): string {
  const remaining = toScaled(item.quantity) - toScaled(returnedQuantity(item));
  const safe = remaining > 0 ? remaining : 0;
  return (safe / SCALE).toFixed(3).replace(/\.?0+$/, '') || '0';
}

/** Girilen iade miktarı kalanı aşıyor mu (sunucu da RETURN_EXCEEDS_SOLD ile reddeder). */
export function exceedsRemaining(item: SaleItemDetail, requested: string): boolean {
  return toScaled(requested) > toScaled(remainingQuantity(item));
}

/** Satışta iade edilebilecek kalem kaldı mı. */
export function hasReturnableItems(items: SaleItemDetail[]): boolean {
  return items.some((item) => toScaled(remainingQuantity(item)) > 0);
}
