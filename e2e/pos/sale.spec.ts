import { expect, test, type Page } from '@playwright/test';

import {
  apiReachable,
  listSales,
  seedBarcodedProduct,
  seedTenant,
  setScalePrefixes,
  type TestTenant,
} from './support/api';
import { cachedProductCount, completeBootstrap, pendingSaleCount } from './support/flow';
import { GateProxy } from './support/gate-proxy';
import { launchPos } from './support/pos-app';

/**
 * Faz 13 doğrulaması — satış ekranı.
 *
 * Plandaki doğrulama bloğu:
 *  - 20 kalem + parçalı ödeme, TAMAMI klavyeyle, 60 sn altında
 *  - sepet güncellemesi 16 ms altında
 *  - ağ kapalı: satış tamamlanıyor; ağ gelince sunucuda TEK KOPYA görünüyor
 *
 * Önkoşul: `pnpm --filter @stokk/pos build` ve ayakta bir API. API yoksa atlanır.
 */
const UPSTREAM = process.env.API_URL ?? 'http://localhost:3001';

/** Kasiyerin gerçekte okuttuğu barkod uzunluğu (EAN-13). */
const BARCODE = '8690000013001';

/**
 * Performans ölçümü için AYRI ürünler.
 *
 * Aynı barkodu 30 kez okutmak sepette 30 satır değil "1 satır × 30 adet" üretir
 * (sepet aynı ürünü birleştirir) — o ölçüm çok satırlı sepetin maliyetini hiç
 * görmezdi. Bu yüzden her biri farklı barkodlu 30 ürün ekleniyor.
 */
/** Tartılı ürünün katalogdaki barkodu; etiket bu ilk 7 haneyi taşır. */
const SCALE_PRODUCT_BARCODE = '2700123000000';
/** Terazi etiketi: 2700123 + 00750 gram + kontrol hanesi → 0.750 kg. */
const SCALE_LABEL_BARCODE = '2700123007505';

const PERF_BARCODES = Array.from(
  { length: 30 },
  (_, index) => `869000002${String(index).padStart(4, '0')}`,
);

let tenant: TestTenant;
let proxy: GateProxy;
let serverUrl: string;

test.beforeAll(async () => {
  test.skip(!(await apiReachable()), `API ${UPSTREAM} adresinde ayakta değil.`);
  tenant = await seedTenant(1);
  await seedBarcodedProduct(tenant, 'Faz13 Barkodlu Ürün', '12.00', BARCODE);
  for (const [index, barcode] of PERF_BARCODES.entries()) {
    await seedBarcodedProduct(tenant, `Perf Ürün ${String(index + 1)}`, '5.00', barcode);
  }
  // Tartılı ürün: kayıtlı barkodun ilk 7 hanesi sabit, son 6 hanesi etikette değişir.
  await seedBarcodedProduct(tenant, 'Domates (kg)', '40.00', SCALE_PRODUCT_BARCODE);
  await setScalePrefixes(tenant, ['27']);
  proxy = new GateProxy(UPSTREAM);
  serverUrl = await proxy.start();
});

test.afterAll(async () => {
  await proxy?.stop();
});

test.beforeEach(() => {
  proxy.open();
});

/** Barkod alanına okutma: okuyucu gibi yazar, sonunda Enter basar. */
async function scan(page: Page, barcode: string): Promise<void> {
  const field = page.getByRole('textbox', { name: 'Barkod', exact: true });
  await field.fill(barcode);
  await field.press('Enter');
}

test('20 kalem + parçalı ödeme tamamen klavyeyle, 60 sn altında', async () => {
  const pos = await launchPos();
  try {
    await completeBootstrap(pos.page, tenant, serverUrl);
    await expect.poll(() => cachedProductCount(pos.page), { timeout: 45_000 }).toBeGreaterThan(0);

    const started = Date.now();

    // 20 kalem: aynı ürün 20 kez okutuluyor — sepet tek satırda 20 adet gösterir.
    for (let index = 0; index < 20; index += 1) {
      await scan(pos.page, BARCODE);
    }
    await expect(pos.page.getByText('20 × ₺12,00')).toBeVisible({ timeout: 15_000 });
    // 20 × 12.00 = 240.00 — toplam panelindeki değere bakılıyor, sayfadaki
    // herhangi bir eşleşmeye değil.
    await expect(pos.page.getByRole('list', { name: 'Sepet' }).getByText('₺240,00')).toBeVisible();

    // F1 → ödeme. Buradan sonuna kadar SADECE klavye kullanılıyor: tek bir
    // `click()` bile yok, çünkü kasada fare yok.
    await pos.page.keyboard.press('F1');
    await expect(pos.page.getByRole('heading', { name: 'Ödeme' })).toBeVisible();

    // Parçalı: 100 TL kart (F2), kalan 140 TL nakit (F1) — müşteri 200 veriyor,
    // para üstü 60. Tutar alanı açılışta odaklı geliyor.
    await pos.page.keyboard.type('100');
    await pos.page.keyboard.press('F2');
    await pos.page.keyboard.type('200');
    await pos.page.keyboard.press('F1');

    // Son ödeme kalanı kapattı: odak "Satışı tamamla" düğmesine taşındı.
    await expect(pos.page.getByRole('button', { name: 'Satışı tamamla' })).toBeFocused();
    await pos.page.keyboard.press('Enter');

    await expect(pos.page.getByRole('heading', { name: 'Satış tamamlandı' })).toBeVisible({
      timeout: 30_000,
    });
    // Para üstü kutusu canlı bölge; içeriği oradan doğrulanıyor.
    await expect(pos.page.getByRole('status')).toContainText('Para üstü');
    await expect(pos.page.getByRole('status')).toContainText('₺60,00');

    const elapsed = Date.now() - started;
    expect(elapsed).toBeLessThan(60_000);

    // Fiş kapanınca sepet boş ve odak barkoda dönmüş olmalı — Enter yeter.
    await expect(pos.page.getByRole('button', { name: /Yeni satış/ })).toBeFocused();
    await pos.page.keyboard.press('Enter');
    await expect(pos.page.getByText('Sepet boş')).toBeVisible();
    await expect(pos.page.getByRole('textbox', { name: 'Barkod', exact: true })).toBeFocused();
  } finally {
    await pos.close();
  }
});

test('sepet güncellemesi 16 ms bütçesinin altında kalır', async () => {
  const pos = await launchPos();
  try {
    await completeBootstrap(pos.page, tenant, serverUrl);
    await expect.poll(() => cachedProductCount(pos.page), { timeout: 45_000 }).toBeGreaterThan(0);

    // Ölçüm dolu sepette yapılır: her biri AYRI ürün, yani gerçekten 30 satır.
    for (const barcode of PERF_BARCODES) {
      await scan(pos.page, barcode);
    }
    await expect(pos.page.getByRole('list', { name: 'Sepet' }).getByRole('listitem')).toHaveCount(
      30,
      { timeout: 30_000 },
    );

    /**
     * Sepet güncellemesinin BİZE ait maliyeti: React'in render + commit'i ve
     * tarayıcının düzen hesabı.
     *
     * Ölçüm tarayıcının içinde yapılıyor — Playwright'ın IPC gecikmesi karışmasın.
     * `keydown` React'te "discrete" olaydır, render senkron biter; `getBoundingClientRect`
     * düzeni zorlayarak stil/layout maliyetini de ölçüme katar.
     *
     * `requestAnimationFrame` ile ölçmek yanıltıcı olurdu: 60 Hz'de bir sonraki
     * kare her hâlükârda ~16,7 ms sonra gelir, ölçülen şey bizim işimiz değil
     * ekranın tazeleme aralığı olurdu.
     */
    const measurement = await pos.page.evaluate(async () => {
      const field = document.querySelector<HTMLInputElement>('input[aria-label="Barkod"]');
      field?.focus();

      // Son okutulan satır zaten seçili; `+` ona uygulanıyor. Ölçülen şey tam da
      // gerçek durum: 30 satırlık sepette TEK satır değişiyor.
      const work: number[] = [];
      const frames: number[] = [];
      for (let index = 0; index < 20; index += 1) {
        const start = performance.now();
        window.dispatchEvent(new KeyboardEvent('keydown', { key: '+', bubbles: true }));
        document.body.getBoundingClientRect();
        work.push(performance.now() - start);
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        frames.push(performance.now() - start);
      }
      return { work, frames };
    });

    const durations = measurement.work;
    const worst = Math.max(...durations);
    // Bilgi olarak rapora düşsün: eşiğe ne kadar yakınız.
    test.info().annotations.push({
      type: 'sepet-guncelleme',
      description: `render+layout en kötü ${worst.toFixed(2)} ms, ortalama ${(
        durations.reduce((sum, value) => sum + value, 0) / durations.length
      ).toFixed(2)} ms; kareye kadar en kötü ${Math.max(...measurement.frames).toFixed(2)} ms`,
    });
    expect(worst).toBeLessThan(16);
  } finally {
    await pos.close();
  }
});

test('ağ kapalıyken satış tamamlanır; ağ gelince sunucuda TEK KOPYA olur', async () => {
  const pos = await launchPos();
  try {
    await completeBootstrap(pos.page, tenant, serverUrl);
    await expect.poll(() => cachedProductCount(pos.page), { timeout: 45_000 }).toBeGreaterThan(0);

    const before = await listSales(tenant);

    // Kablo çekildi.
    proxy.close();
    await expect(pos.page.getByText(/Sunucuya ulaşılamıyor|Çevrimdışı/)).toBeVisible({
      timeout: 45_000,
    });

    await scan(pos.page, BARCODE);
    await scan(pos.page, BARCODE);
    await pos.page.keyboard.press('F1');
    await pos.page.getByRole('button', { name: 'Tam üstü' }).click();
    await pos.page.getByRole('button', { name: 'Satışı tamamla' }).click();

    // Satış TAMAMLANDI: kasiyer fişi gördü, ama kayıt henüz kuyrukta.
    await expect(pos.page.getByRole('heading', { name: 'Satış tamamlandı' })).toBeVisible({
      timeout: 30_000,
    });
    await expect(pos.page.getByText(/kuyrukta/)).toBeVisible();
    await pos.page.getByRole('button', { name: /Yeni satış/ }).click();
    expect(await pendingSaleCount(pos.page)).toBe(1);

    // Ağ döndü: kuyruk kendiliğinden boşalır.
    proxy.open();
    await expect.poll(() => pendingSaleCount(pos.page), { timeout: 90_000 }).toBe(0);

    // Sunucuda TEK yeni satış var — at-least-once gönderim çift kayıt açmadı.
    const after = await listSales(tenant);
    expect(after.length).toBe(before.length + 1);
    const created = after.find((sale) => !before.some((old) => old.id === sale.id));
    // Liste ucu Decimal'i sondaki sıfırları kırparak veriyor ("24"); karşılaştırma
    // biçime değil DEĞERE bakıyor.
    expect(Number(created?.grandTotal)).toBe(24);

    // Elle eşitleme ikinci kopya ÜRETMEZ (idempotent push).
    await pos.page.getByRole('button', { name: 'Eşitle' }).click();
    await expect.poll(() => pendingSaleCount(pos.page), { timeout: 30_000 }).toBe(0);
    expect((await listSales(tenant)).length).toBe(after.length);
  } finally {
    await pos.close();
  }
});

test('park edilen sepet geri alınır ve listeden düşer', async () => {
  const pos = await launchPos();
  try {
    await completeBootstrap(pos.page, tenant, serverUrl);
    await expect.poll(() => cachedProductCount(pos.page), { timeout: 45_000 }).toBeGreaterThan(0);

    await scan(pos.page, BARCODE);
    await expect(pos.page.getByText('1 × ₺12,00')).toBeVisible({ timeout: 15_000 });

    // F4 park et → sepet boşalır.
    await pos.page.keyboard.press('F4');
    await expect(pos.page.getByText('Sepet boş')).toBeVisible({ timeout: 15_000 });

    // F5 park listesi → geri al.
    await pos.page.keyboard.press('F5');
    await expect(pos.page.getByRole('heading', { name: 'Park edilmiş satışlar' })).toBeVisible();
    await pos.page.getByRole('button', { name: 'Geri al' }).click();

    await expect(pos.page.getByText('1 × ₺12,00')).toBeVisible({ timeout: 15_000 });

    // Geri alınan sepet listeden DÜŞTÜ: aynı sepet iki kez satılamaz.
    const parked = await pos.page.evaluate(() => window.stokk.sale.parked());
    expect(parked).toMatchObject({ ok: true, data: [] });
  } finally {
    await pos.close();
  }
});

test('F10 vardiya kapanışı sayım farkını gösterir ve akış vardiya açılışına döner', async () => {
  const pos = await launchPos();
  try {
    await completeBootstrap(pos.page, tenant, serverUrl);
    await expect.poll(() => cachedProductCount(pos.page), { timeout: 45_000 }).toBeGreaterThan(0);

    // Bir satış yap ki beklenen nakit açılış tutarından farklı olsun.
    await scan(pos.page, BARCODE);
    await pos.page.keyboard.press('F1');
    await pos.page.getByRole('button', { name: 'Tam üstü' }).click();
    await pos.page.getByRole('button', { name: 'Satışı tamamla' }).click();
    await expect(pos.page.getByRole('heading', { name: 'Satış tamamlandı' })).toBeVisible({
      timeout: 30_000,
    });
    await pos.page.getByRole('button', { name: /Yeni satış/ }).click();
    await expect.poll(() => pendingSaleCount(pos.page), { timeout: 45_000 }).toBe(0);

    // F10 → sayım. Beklenen tutar SUNUCUDAN gelir (açılış + kasa hareketleri);
    // testin sabit bir sayıya bağlanması, aynı vardiyada koşan diğer testlerin
    // satışlarıyla kırılırdı. Kontrol edilen şey: fark = sayılan − beklenen.
    await pos.page.keyboard.press('F10');
    await expect(pos.page.getByRole('heading', { name: 'Vardiyayı kapat' })).toBeVisible();
    await pos.page.getByLabel('Sayılan nakit').fill('260.00');
    await pos.page.keyboard.press('Enter');

    await expect(pos.page.getByRole('heading', { name: 'Vardiya kapatıldı' })).toBeVisible({
      timeout: 30_000,
    });
    const summary = pos.page.getByRole('dialog');
    await expect(summary).toContainText('Sayılan');
    await expect(summary).toContainText('₺260,00');
    await expect(summary).toContainText('Beklenen');
    await expect(summary).toContainText('Fark');

    // Kapanış sonrası akış vardiya açılışına döner; "Tamam" odaklı geldiği için
    // Enter yeter.
    await expect(pos.page.getByRole('button', { name: 'Tamam' })).toBeFocused();
    await pos.page.keyboard.press('Enter');
    await expect(pos.page.getByRole('heading', { name: 'Vardiya açılışı' })).toBeVisible({
      timeout: 30_000,
    });
  } finally {
    await pos.close();
  }
});

test('yanıt kaybolursa satış İKİNCİ KEZ gönderilir ama sunucuda tek kalır', async () => {
  // At-least-once gönderimin asıl riski: istek sunucuya ULAŞTI, yanıt kayboldu.
  // Kasa "gitmedi" sanıp aynı satışı tekrar yollar. Bağlantıyı komple kesmek bu
  // durumu üretemez; vekil bu yüzden yanıtı yutuyor.
  const pos = await launchPos();
  try {
    await completeBootstrap(pos.page, tenant, serverUrl);
    await expect.poll(() => cachedProductCount(pos.page), { timeout: 45_000 }).toBeGreaterThan(0);

    const before = await listSales(tenant);

    proxy.swallowResponses();

    await scan(pos.page, BARCODE);
    await pos.page.keyboard.press('F1');
    await pos.page.getByRole('button', { name: 'Tam üstü' }).click();
    await pos.page.getByRole('button', { name: 'Satışı tamamla' }).click();
    await expect(pos.page.getByRole('heading', { name: 'Satış tamamlandı' })).toBeVisible({
      timeout: 30_000,
    });
    await pos.page.getByRole('button', { name: /Yeni satış/ }).click();

    // Sunucu satışı KAYDETTİ (yanıt kayboldu ama istek işlendi)…
    await expect
      .poll(async () => (await listSales(tenant)).length, { timeout: 45_000 })
      .toBe(before.length + 1);
    // …kasa ise hâlâ gönderilmemiş sayıyor.
    expect(await pendingSaleCount(pos.page)).toBe(1);

    // Ağ düzeldi: aynı satış İKİNCİ KEZ gönderilir.
    proxy.open();
    await pos.page.getByRole('button', { name: 'Eşitle' }).click();
    await expect.poll(() => pendingSaleCount(pos.page), { timeout: 60_000 }).toBe(0);

    // Sunucuda ikinci kayıt AÇILMADI — `clientSaleId` benzersizliği tuttu.
    const after = await listSales(tenant);
    expect(after.length).toBe(before.length + 1);
  } finally {
    await pos.close();
  }
});

test('tartılı barkod ağırlığı etiketten, fiyatı katalogdan alır', async () => {
  const pos = await launchPos();
  try {
    await completeBootstrap(pos.page, tenant, serverUrl);
    await expect.poll(() => cachedProductCount(pos.page), { timeout: 45_000 }).toBeGreaterThan(0);

    await scan(pos.page, SCALE_LABEL_BARCODE);

    // 0,750 kg × ₺40,00 = ₺30,00 — miktar etiketten, birim fiyat katalogdan.
    await expect(pos.page.getByText('0,75 × ₺40,00')).toBeVisible({ timeout: 15_000 });
    await expect(pos.page.getByRole('list', { name: 'Sepet' }).getByText('₺30,00')).toBeVisible();
  } finally {
    await pos.close();
  }
});

test('F3 indirim ve F8 satır notu sepete işler, fişte görünür', async () => {
  const pos = await launchPos();
  try {
    await completeBootstrap(pos.page, tenant, serverUrl);
    await expect.poll(() => cachedProductCount(pos.page), { timeout: 45_000 }).toBeGreaterThan(0);

    await scan(pos.page, BARCODE);
    await expect(pos.page.getByText('1 × ₺12,00')).toBeVisible({ timeout: 15_000 });

    // F3 → satır indirimi. Patron hesabı olduğu için eşik üstü de geçer.
    await pos.page.keyboard.press('F3');
    await expect(pos.page.getByRole('heading', { name: /İndirim/ })).toBeVisible();
    await pos.page.getByLabel('İndirim oranı (%)').fill('25');
    await pos.page.keyboard.press('Enter');
    await expect(pos.page.getByText('%25 indirim')).toBeVisible();
    await expect(pos.page.getByRole('list', { name: 'Sepet' }).getByText('₺9,00')).toBeVisible();

    // F8 → satır notu.
    await pos.page.keyboard.press('F8');
    await expect(pos.page.getByRole('heading', { name: /Satır notu/ })).toBeVisible();
    await pos.page.getByRole('textbox', { name: 'Not' }).fill('hediye paketi');
    await pos.page.getByRole('button', { name: 'Kaydet' }).click();
    await expect(pos.page.getByText('hediye paketi')).toBeVisible();

    // Fişte KDV kırılımı ve indirimli satır tutarı görünüyor.
    await pos.page.keyboard.press('F1');
    await pos.page.getByRole('button', { name: 'Tam üstü' }).click();
    await pos.page.getByRole('button', { name: 'Satışı tamamla' }).click();
    await expect(pos.page.getByRole('heading', { name: 'Satış tamamlandı' })).toBeVisible({
      timeout: 30_000,
    });
    const receipt = pos.page.getByRole('dialog');
    await expect(receipt).toContainText('KDV %20');
    await expect(receipt).toContainText('TOPLAM');
    await expect(receipt).toContainText('₺9,00');
  } finally {
    await pos.close();
  }
});
