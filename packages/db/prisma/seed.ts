/**
 * Seed: izin kataloğu, sistem rolleri, birimler, KDV oranları, varsayılan kasa.
 * Faz 1'de doldurulur. İdempotent olmak zorunda — ikinci çalıştırma hata vermez.
 */
function main(): void {
  console.warn('[seed] Faz 0 iskeleti — eklenecek veri yok.');
}

try {
  main();
} catch (error: unknown) {
  console.error('[seed] başarısız:', error);
  process.exitCode = 1;
}
