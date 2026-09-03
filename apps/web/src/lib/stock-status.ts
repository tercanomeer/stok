import type { Product } from './api-types';

/**
 * Ürün listesi ve stok listesinin ortak stok durumu kuralları.
 *
 * Kritik tanımı SUNUCUDAKİYLE aynı olmalı (`/products?stock=low` ve `/stock/low`):
 * takipli ürün + kritik seviye tanımlı (> 0) + stok o seviyenin altında/eşit.
 * Seviyesi tanımsız ürün "kritik" değildir, olsa olsa "tükenmiş"tir.
 *
 * `parseFloat` burada yalnız EŞİK KARŞILAŞTIRMASI için; miktar ve para hesabı
 * sunucuda Decimal ile yapılır (CLAUDE.md). Nihai filtre de sunucudadır, bu
 * fonksiyon yalnız rozeti ve satır vurgusunu belirler.
 */
export function isLowStock(product: Product): boolean {
  if (!product.trackStock) return false;
  const critical = Number.parseFloat(product.criticalLevel);
  if (!Number.isFinite(critical) || critical <= 0) return false;
  const quantity = Number.parseFloat(product.stockQuantity);
  return Number.isFinite(quantity) && quantity <= critical;
}

/** Takipli ürünün stoğu tükendi mi (kritik seviyeden bağımsız). */
export function isOutOfStock(product: Product): boolean {
  if (!product.trackStock) return false;
  const quantity = Number.parseFloat(product.stockQuantity);
  return Number.isFinite(quantity) && quantity <= 0;
}

/** Kritik seviye tanımlanmış mı — listede "—" yerine sayı gösterilsin mi. */
export function hasCriticalLevel(product: Product): boolean {
  return Number.parseFloat(product.criticalLevel) > 0;
}
