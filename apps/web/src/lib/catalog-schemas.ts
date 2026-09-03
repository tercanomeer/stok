import { z } from 'zod';

/**
 * Ürün / katalog / stok formlarının istemci doğrulaması — backend DTO'larıyla hizalı
 * (kaynak backend: products/dto, catalog/dto, stock/dto). Mesajlar Türkçe.
 *
 * Para ve miktar STRING taşınır (CLAUDE.md). Formda virgüllü giriş kabul edilir,
 * `toDecimalString` ile noktaya çevrilir; hesap yapılmaz.
 */

/** "12,50" → "12.50". Boş girdi boş string döner (isteğe bağlı alanlar için). */
export function toDecimalString(raw: string): string {
  return raw.trim().replace(',', '.');
}

const money = z
  .string()
  .trim()
  .min(1, 'Fiyat gerekli.')
  .transform(toDecimalString)
  .refine((v) => /^\d{1,10}(\.\d{1,2})?$/.test(v), 'Geçerli bir tutar girin (ör. 12,50).');

const optionalQuantity = z
  .string()
  .trim()
  .transform(toDecimalString)
  .refine((v) => v === '' || /^\d{1,9}(\.\d{1,3})?$/.test(v), 'Geçerli bir miktar girin.');

const requiredQuantity = z
  .string()
  .trim()
  .min(1, 'Miktar gerekli.')
  .transform(toDecimalString)
  .refine((v) => /^\d{1,9}(\.\d{1,3})?$/.test(v), 'Geçerli bir miktar girin.');

const reason = z
  .string()
  .trim()
  .min(1, 'Sebep zorunlu.')
  .max(200, 'Sebep en fazla 200 karakter olabilir.');

export const productSchema = z.object({
  name: z.string().trim().min(1, 'Ürün adı gerekli.').max(200),
  code: z.string().trim().max(60).optional(),
  categoryId: z.string().optional(),
  brandId: z.string().optional(),
  unitId: z.string().min(1, 'Birim seçin.'),
  salePrice: money,
  vatRate: z.coerce.number<number>().int().min(0).max(100),
  criticalLevel: optionalQuantity,
  trackStock: z.boolean(),
  isWeighed: z.boolean(),
  description: z.string().trim().max(1000).optional(),
});

export const barcodeSchema = z.object({
  value: z.string().trim().min(1, 'Barkod gerekli.').max(64),
});

export const categorySchema = z.object({
  name: z.string().trim().min(1, 'Kategori adı gerekli.').max(80),
  parentId: z.string().optional(),
});

export const brandSchema = z.object({
  name: z.string().trim().min(1, 'Marka adı gerekli.').max(80),
});

export const unitSchema = z.object({
  name: z.string().trim().min(1, 'Birim adı gerekli.').max(40),
  abbreviation: z.string().trim().min(1, 'Kısaltma gerekli.').max(10),
  allowsDecimal: z.boolean(),
});

export const bulkPriceSchema = z.object({
  mode: z.enum(['percent', 'amount']),
  /** Yüzde modunda oran ("10" = %10 zam, "-5" = %5 indirim), tutar modunda TL. */
  value: z
    .string()
    .trim()
    .min(1, 'Değer gerekli.')
    .transform(toDecimalString)
    .refine((v) => /^-?\d{1,10}(\.\d{1,2})?$/.test(v), 'Geçerli bir değer girin (ör. 10 veya -5).'),
  categoryId: z.string().optional(),
  brandId: z.string().optional(),
});

export const wasteSchema = z.object({
  quantity: requiredQuantity,
  reason,
});

export const adjustSchema = z.object({
  newQuantity: requiredQuantity,
  reason,
});

export const startCountSchema = z.object({
  note: z.string().trim().max(500).optional(),
});

export type ProductValues = z.input<typeof productSchema>;
export type ProductOutput = z.output<typeof productSchema>;
export type BarcodeValues = z.infer<typeof barcodeSchema>;
export type CategoryValues = z.infer<typeof categorySchema>;
export type BrandValues = z.infer<typeof brandSchema>;
export type UnitValues = z.infer<typeof unitSchema>;
export type BulkPriceValues = z.input<typeof bulkPriceSchema>;
export type BulkPriceOutput = z.output<typeof bulkPriceSchema>;
export type WasteValues = z.input<typeof wasteSchema>;
export type WasteOutput = z.output<typeof wasteSchema>;
export type AdjustValues = z.input<typeof adjustSchema>;
export type AdjustOutput = z.output<typeof adjustSchema>;
export type StartCountValues = z.infer<typeof startCountSchema>;

/**
 * KDV oranı seçenekleri. Tenant ayarındaki liste yetkisiz uçtan okunamadığı için
 * (sync/pull SALE_CREATE ister) Türkiye varsayılanları gösterilir; NİHAİ doğrulama
 * backend'de (`assertVatRate`) — tanımsız oran hata bandında görünür.
 */
export const VAT_RATE_OPTIONS: readonly number[] = [0, 1, 10, 20];
