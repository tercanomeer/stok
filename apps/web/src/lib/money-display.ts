/**
 * Gösterim amaçlı para toplama — YALNIZ ekranda gösterilen bir ara toplam için
 * (ör. alış faturası satırının KDV dahil tutarı = matrah + KDV).
 *
 * Float toplama yasak (CLAUDE.md). Değerler kuruşa (tam sayı) ölçeklenip toplanır,
 * sonuç 2 ondalıklı string döner — kayıpsız ve `0.1 + 0.2 = 0.30000000000000004`
 * sorunundan bağışık. Kaydedilen tutarlar sunucuda / pos-core'da Decimal ile hesaplanır;
 * bu fonksiyonun sonucu hiçbir zaman API'ye gönderilmez.
 */

const CENTS = 100;

function toCents(value: string): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? Math.round(parsed * CENTS) : 0;
}

export function addMoney(...values: string[]): string {
  const total = values.reduce((sum, value) => sum + toCents(value), 0);
  return (total / CENTS).toFixed(2);
}
