import { d } from './money';

/**
 * Terazi (tartılı ürün) barkodu ayrıştırma. Türkiye'de yaygın EAN-13 düzeni:
 *
 *   [prefix][ürün kodu][gömülü değer (5 hane)][kontrol (1 hane)]
 *
 * Gömülü değer ya fiyat (kuruş) ya da ağırlık (gram) taşır — hangisi olduğu terazinin
 * ayarına bağlıdır, bu yüzden HER İKİ yorum da döndürülür; çağıran tenant ayarına göre seçer.
 * Prefix tenant ayarından gelir (TenantSettings.scaleBarcodePrefixes, örn. "27", "28").
 * Boş prefix listesi = tartılı barkod kapalı → her zaman null.
 */
export interface ParsedScaleBarcode {
  /** Ürünü eşlemek için tartı ürün kodu (prefix ile kontrol hanesi arası, değer hariç). */
  productCode: string;
  /** Gömülü 5 haneli ham değer. */
  rawValue: string;
  /** Fiyat yorumu: değer / 100 → "N.NN" (kuruş gömülü). */
  embeddedPrice: string;
  /** Ağırlık yorumu: değer / 1000 → "N.NNN" kg (gram gömülü). */
  embeddedWeightKg: string;
}

/** 13 haneli sayısal barkodu, prefix'lerden biriyle başlıyorsa ayrıştırır; değilse null. */
export function parseScaleBarcode(
  barcode: string,
  prefixes: readonly string[],
): ParsedScaleBarcode | null {
  if (!/^\d{13}$/.test(barcode) || prefixes.length === 0) return null;

  const prefix = prefixes.find((p) => /^\d+$/.test(p) && barcode.startsWith(p));
  if (prefix === undefined) return null;

  // Düzen: kontrol = son hane, değer = kontrolden önceki 5 hane, ürün kodu = prefix ile değer arası.
  const valueStart = 13 - 1 - 5; // = 7
  if (prefix.length >= valueStart) return null; // ürün koduna yer kalmıyor

  const productCode = barcode.slice(prefix.length, valueStart);
  const rawValue = barcode.slice(valueStart, valueStart + 5);

  return {
    productCode,
    rawValue,
    embeddedPrice: formatScaled(rawValue, 2),
    embeddedWeightKg: formatScaled(rawValue, 3),
  };
}

/** 5 haneli tamsayıyı `decimals` ondalıkla böler: "01234", 2 → "12.34" (Decimal, float yok). */
function formatScaled(rawValue: string, decimals: number): string {
  return d(rawValue)
    .div(10 ** decimals)
    .toFixed(decimals);
}
