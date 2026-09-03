/**
 * Grafik renk rolleri (dataviz skill'i).
 *
 * Tek serili grafikler MARKA yeşilini kullanır (Tailwind `fill-brand`). Çok sınıflı
 * tek grafik olan ödeme dağılımı doğrulanmış kategorik paleti kullanır; sıra SABİTTİR,
 * döngüye sokulmaz ve 4 slottan fazlası "Diğer"e katlanır (üretilmiş 9. renk CVD
 * altında ayırt edilemez).
 *
 * Renkler CSS değişkeninde (`globals.css`): tema JS ile okunmaz, böylece sunucu ve
 * istemci ilk render'ı aynı olur. Palet `scripts/validate_palette.js` ile doğrulandı:
 *  - açık (#ffffff): tüm kontroller geçti, kontrast uyarısı → doğrudan etiket + tablo
 *  - koyu (#121a16): tüm kontroller geçti (en kötü komşu CVD ΔE 8.4)
 */

export const VIZ_SLOT_VARS = [
  'var(--viz-1)',
  'var(--viz-2)',
  'var(--viz-3)',
  'var(--viz-4)',
] as const;

export const MAX_CATEGORICAL_SLOTS = VIZ_SLOT_VARS.length;
