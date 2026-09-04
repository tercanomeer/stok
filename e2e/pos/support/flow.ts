import { expect, type Page } from '@playwright/test';

import type { TestTenant } from './api';

/**
 * Açılış akışının tamamı: sunucu adresi → giriş → kasa seçimi → vardiya açılışı.
 *
 * Faz 13'ün her testi satış ekranından başlıyor; akışın kendisi Faz 12'de
 * doğrulandı, burada yalnız oraya varmak için kullanılıyor.
 */
export async function completeBootstrap(
  page: Page,
  tenant: TestTenant,
  serverUrl: string,
): Promise<void> {
  await expect(page.getByRole('heading', { name: 'Sunucu adresi' })).toBeVisible({
    timeout: 30_000,
  });
  await page.getByLabel('Sunucu adresi').fill(serverUrl);
  await page.getByRole('button', { name: 'Bağlantıyı test et' }).click();
  await expect(page.getByText(/Sunucuya ulaşıldı/)).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: 'Kaydet ve devam et' }).click();

  await expect(page.getByRole('heading', { name: 'Giriş' })).toBeVisible({ timeout: 15_000 });
  await page.getByLabel('E-posta').fill(tenant.email);
  await page.getByLabel('Şifre').fill(tenant.password);
  await page.getByRole('button', { name: 'Giriş yap' }).click();

  await expect(page.getByRole('heading', { name: 'Kasa seçimi' })).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Kasa 1' }).click();

  // Kasada zaten açık bir vardiya varsa uygulama vardiya açılışını hiç sormaz,
  // doğrudan satış ekranına geçer. Yoksa açılış formu gelir.
  const ready = page.getByRole('textbox', { name: 'Barkod', exact: true });
  const openingCash = page.getByLabel('Kasada bulunan nakit');
  await expect(ready.or(openingCash)).toBeVisible({ timeout: 45_000 });

  if (!(await ready.isVisible())) {
    await openingCash.fill('250.00');
    await page.getByRole('button', { name: 'Vardiyayı aç' }).click();
  }

  await expect(ready).toBeVisible({ timeout: 30_000 });
}

/** Açılış çekişi 30 sn'lik döngüden bağımsız başlar; önbellekteki ürün sayısı. */
export async function cachedProductCount(page: Page): Promise<number> {
  const status = await page.evaluate(() => window.stokk.sync.status());
  return status.ok ? status.data.cachedProductCount : 0;
}

/** Gönderilmeyi bekleyen yerel satış sayısı. */
export async function pendingSaleCount(page: Page): Promise<number> {
  const status = await page.evaluate(() => window.stokk.sync.status());
  return status.ok ? status.data.pendingCount : -1;
}
