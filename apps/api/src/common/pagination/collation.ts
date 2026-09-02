/**
 * Türkçe sıralama. Cluster locale'i C.UTF-8 (bayt sırası) olduğu için `ORDER BY name`
 * Türkçe için yanlış (`Çay` > `Zeytin`). Sıralı gösterilen metin sorgularında
 * `ORDER BY "name" COLLATE "tr-x-icu"` kullanılıyor — sütuna gömmek yerine sorgu bazında,
 * çünkü sütun collation'ı trigram GIN ve unique indeksleri etkiler.
 */
export const TR_COLLATION = 'tr-x-icu';
