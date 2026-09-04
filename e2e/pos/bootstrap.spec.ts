import { expect, test } from '@playwright/test';

import { addProduct, apiReachable, seedTenant, type TestTenant } from './support/api';
import { cachedProductCount, completeBootstrap } from './support/flow';
import { GateProxy } from './support/gate-proxy';
import { launchPos, type LaunchedPos } from './support/pos-app';

/**
 * Faz 12 doğrulaması — Playwright Electron sürücüsü.
 *
 * Kapsam (plandaki doğrulama bloğu):
 *  - ilk açılış: sunucu URL → giriş → kasa seç → vardiya aç
 *  - ağ kapalı: cached token ile giriş yapılabiliyor, ürün cache'i okunabiliyor
 *  - preload yüzeyi: renderer'a yalnız beyaz listeli köprü açılıyor
 *
 * Önkoşul: `pnpm --filter @stokk/pos build` ve ayakta bir API (`docker compose up -d`
 * + `pnpm --filter @stokk/api dev`). API yoksa testler atlanır — yanlış yeşil vermez.
 */
const UPSTREAM = process.env.API_URL ?? 'http://localhost:3001';

let tenant: TestTenant;
let proxy: GateProxy;
let serverUrl: string;

test.beforeAll(async () => {
  test.skip(!(await apiReachable()), `API ${UPSTREAM} adresinde ayakta değil.`);
  tenant = await seedTenant();
  proxy = new GateProxy(UPSTREAM);
  serverUrl = await proxy.start();
});

test.afterAll(async () => {
  await proxy?.stop();
});

test.beforeEach(() => {
  proxy.open();
});

test('ilk açılış: sunucu adresi → giriş → kasa seçimi → vardiya açılışı', async () => {
  const pos: LaunchedPos = await launchPos();
  try {
    await completeBootstrap(pos.page, tenant, serverUrl);

    // Açılışta tam çekiş yapıldı: katalog yerelde.
    await expect.poll(() => cachedProductCount(pos.page), { timeout: 45_000 }).toBeGreaterThan(0);
    await expect(pos.page.getByText('Çevrimiçi')).toBeVisible();
  } finally {
    await pos.close();
  }
});

test('preload yüzeyi: renderer’a yalnız beyaz listeli köprü açılır', async () => {
  const pos = await launchPos();
  try {
    await expect(pos.page.getByRole('heading', { name: 'Sunucu adresi' })).toBeVisible({
      timeout: 30_000,
    });

    const surface = await pos.page.evaluate(() => ({
      namespaces: Object.keys(window.stokk).sort(),
      // Sertleştirme: bunların HİÇBİRİ renderer'da olmamalı.
      leaks: ['require', 'process', 'module', 'ipcRenderer', 'electron', 'Buffer'].filter(
        (key) => key in window,
      ),
    }));

    expect(surface.namespaces).toEqual([
      'auth',
      'cashDrawer',
      'catalog',
      'contacts',
      'posDevice',
      'printer',
      'sale',
      'scale',
      'shift',
      'sync',
      'system',
    ]);
    expect(surface.leaks).toEqual([]);

    // Donanım kanalları Faz 14'e kadar açıkça "hazır değil" der; sessizce çökmez.
    const printer = await pos.page.evaluate(() => window.stokk.printer.status());
    expect(printer).toMatchObject({ ok: true, data: { connected: false } });

    const receipt = await pos.page.evaluate(() => window.stokk.printer.printReceipt('x'));
    expect(receipt).toMatchObject({ ok: false, error: { code: 'NOT_IMPLEMENTED' } });

    // Uygulama bilgisi köprüden okunabiliyor (kanal gerçekten kayıtlı).
    const info = await pos.page.evaluate(() => window.stokk.system.appInfo());
    expect(info).toMatchObject({ ok: true });
  } finally {
    await pos.close();
  }
});

test('ağ kapalı: önbellekteki kimlikle giriş yapılır ve ürün önbelleği okunur', async () => {
  // 1. tur: çevrimiçi giriş — oturum ve katalog kasaya yazılır.
  const first = await launchPos();
  const userDataDir = first.userDataDir;
  try {
    await completeBootstrap(first.page, tenant, serverUrl);
    await expect.poll(() => cachedProductCount(first.page), { timeout: 45_000 }).toBeGreaterThan(0);
    await first.page.getByRole('button', { name: /Çıkış/ }).click();
    await expect(first.page.getByRole('heading', { name: 'Giriş' })).toBeVisible({
      timeout: 15_000,
    });
  } finally {
    await first.close();
  }

  // 2. tur: AYNI kasa, ağ yok.
  proxy.close();
  const second = await launchPos(userDataDir);
  try {
    await expect(second.page.getByRole('heading', { name: 'Giriş' })).toBeVisible({
      timeout: 30_000,
    });
    await expect(second.page.getByText(/Sunucuya ulaşılamıyor/)).toBeVisible({ timeout: 30_000 });

    await second.page.getByLabel('E-posta').fill(tenant.email);
    await second.page.getByLabel('Şifre').fill(tenant.password);
    await second.page.getByRole('button', { name: 'Giriş yap' }).click();

    // Çevrimdışı oturum açıldı — akış kasa seçimini hatırlıyor, vardiya sorulamıyor.
    await expect(second.page.getByRole('heading', { name: 'Vardiya açılışı' })).toBeVisible({
      timeout: 30_000,
    });

    // Ürün önbelleği çevrimdışı OKUNABİLİR.
    expect(await cachedProductCount(second.page)).toBeGreaterThan(0);

    // Yanlış parola çevrimdışında da geçmez.
    const rejected = await second.page.evaluate(
      (email) => window.stokk.auth.login({ email, password: 'yanlis-parola' }),
      tenant.email,
    );
    expect(rejected).toMatchObject({ ok: false, error: { code: 'INVALID_CREDENTIALS' } });
  } finally {
    await second.close();
  }
});

test('ağ geri gelince katalog kendiliğinden tazelenir', async () => {
  const pos = await launchPos();
  try {
    await completeBootstrap(pos.page, tenant, serverUrl);
    await expect.poll(() => cachedProductCount(pos.page), { timeout: 45_000 }).toBeGreaterThan(0);
    const beforeCount = await cachedProductCount(pos.page);

    // Ağ gitti, bu arada sunucuda yeni ürün açıldı.
    proxy.close();
    await expect(pos.page.getByText(/Sunucuya ulaşılamıyor|Çevrimdışı/)).toBeVisible({
      timeout: 45_000,
    });
    await addProduct(tenant, 'Ağ Kapalıyken Eklenen');

    // Ağ döndü: elle "Eşitle" beklenmeden delta çekiş yapılır.
    proxy.open();
    await expect(pos.page.getByText('Çevrimiçi')).toBeVisible({ timeout: 45_000 });
    await expect
      .poll(() => cachedProductCount(pos.page), { timeout: 60_000 })
      .toBeGreaterThan(beforeCount);
  } finally {
    await pos.close();
  }
});
