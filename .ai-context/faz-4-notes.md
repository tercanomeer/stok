# Faz 4 — Stok

**Tarih:** 2026-09-02 · **Durum:** kapandı — doğrulama geçti, üç faz ajanının bulguları işlendi

---

## Ne eklendi

**Modül** `apps/api/src/modules/stock/`

- `stock.service.ts` — çekirdek `applyMovement` primitifi (FOR UPDATE ile kilitli), fire,
  manuel düzeltme, hareket geçmişi, kritik seviye listesi
- `stock-count.service.ts` — sayım: başlat / kalem gir (barkod) / tamamla / iptal
- `stock.events.ts` + `stock-low.listener.ts` — `stock.low` domain event'i (EventEmitter2)
- `EventEmitterModule.forRoot()` app'e bağlandı

---

## Alınan kararlar

### 1. `applyMovement` — tek stok yazma yolu, FOR UPDATE ile serileşen

Stok = hareket defteri. `Product.stockQuantity` denormalize kopya, **yalnız** `applyMovement`
içinde güncellenir (grep ile doğrulandı; Faz 3 ürün create/update stockQuantity'ye dokunmuyor).
`applyMovement`:

1. Ürün satırını `SELECT ... FOR UPDATE` ile kilitler (ham SQL — Prisma FOR UPDATE üretmiyor;
   RLS `app.tenant_id` ayarı transaction'da kurulu olduğu için yalnız tenant'ın satırı görünür).
2. `balanceAfter = current + quantity` hesaplar.
3. Negatif stok politikasını kontrol eder (WARN: log + devam, BLOCK: hata).
4. StockMovement yazar, `stockQuantity`'yi günceller.

Çağıran bir transaction içinde olmalı (`withTenant`). Satış/alış (Faz 5/6) bu primitifi çağıracak.

### 2. Eşzamanlılık: withTenant transaction penceresi + connection pool

Faz 1 architect/postgres-pro uyarısı (ledger ↔ denormalize kilitleme) burada karşılandı.
50 paralel düşüm testinde Prisma interactive transaction'ın varsayılan `maxWait` (2s) yetmiyordu:
`withTenant`'a `{ timeout: 15_000, maxWait: 10_000 }` verildi, `APP_DATABASE_URL`'e
`connection_limit=20` eklendi. FOR UPDATE serileştirmesi lost-update'i engelliyor.

### 3. Sayım: fark tek düzeltme hareketi, ara adımda stok sabit

Kalem girişi (addItem) StockMovement üretmez, yalnız `countedQuantity` yazar; stok yalnız
`complete`'te değişir. Her ürün için (sayılan − sistem) farkı tek `COUNT_ADJUSTMENT` olur;
fark sıfırsa hareket üretilmez. Aynı ürün üst üste okutulunca countedQuantity birikir.

### 4. Sayım tamamlama/iptal atomik claim (code-reviewer bulgusu)

`complete`/`cancel` status'u kilitsiz okuyordu → iki eşzamanlı complete çift düzeltme yapabiliyordu.
Koşullu `updateMany({ where: { id, status: 'IN_PROGRESS' }, data: {...} })` ile atomik claim:
count satırı kilitlenir, ikinci istek `count===0` alıp reddedilir (409). Regresyon testi eklendi.

### 5. `stock.low` event'i transaction SONRASI (code-reviewer bulgusu / 03-mimari)

Event `applyMovement` içinde emit ediliyordu (transaction içi). Rollback olursa yanlış "kritik
stok" bildirimi giderdi (özellikle sayım complete'inde bir ürün BLOCK'a takılırsa öncekiler için).
→ `applyMovement` event payload'ını **döndürüyor**, çağıranlar (recordWaste/adjust/complete)
`withTenant` COMMIT'inden sonra `emitLowStock` ile yayınlıyor.

---

## Doğrulama çıktıları

```
pnpm lint          12/12 ✓
pnpm typecheck     12/12 ✓
pnpm test          12/12 ✓  (api 52 test; stok 14: stock.e2e 7 + stock-gap 7)
pnpm build          8/8  ✓
pnpm format:check  ✓
```

Faz 4 doğrulama bloğu (e2e, gerçek Postgres):

- **Aynı ürüne 50 paralel stok düşümü → ledger toplamı = denormalize alan** (`Promise.allSettled`,
  gerçekten eşzamanlı; invaryant: sum = denormalize = 100−başarılı, balanceAfter zinciri tutarlı;
  aşağıya bak).
- **Sayım tamamlandığında tek COUNT_ADJUSTMENT; ara adımlarda stok değişmez** (DB'den doğrulanıyor).

Ek e2e (test-automator gap dosyası): fire+düzeltme paralel (ledger zinciri tutarlı), sayım
birikme, tamamlanmış/iptal sayıma kalem ekleme 400 / tekrar tamamlama 409, fark sıfır → 0 düzeltme,
cross-tenant izolasyon, /stock/low doğru ürünler. Kendi eklediklerim: negatif stok WARN/BLOCK,
çift-tamamlama yarışı (yalnız biri 201, diğeri 409, tek düzeltme).

---

## Ajan bulguları

### `code-reviewer` — 2 gerçek bulgu, ikisi de düzeltildi

- **`stock.low` transaction içinde emit** (03-mimari ihlali) → commit sonrasına taşındı (karar #5).
- **Çift-tamamlama yarışı** → atomik claim (karar #4).
- Temiz: transaction sınırları (iç içe transaction yapısal olarak imkânsız — `TenantTransaction`
  `$transaction`'ı Omit'liyor), `applyMovement` tek yazma yolu, hata sözleşmesi, SQL injection yok
  (tagged template), RLS tenant izolasyonu.

### `test-automator` — üretim bug'ı yok, 7 gap testi ekledi

Doğrulama bloğunun ikisini de gerçekten ölçtüğünü onayladı (5+ ardışık koşu, flaky değil).
Önemli gözlem: `balanceAfter` her zaman benzersiz DEĞİL — `adjust` mutlak hedefe kilitlendiğinde
iki farklı yol rastlantısal aynı bakiyeye ulaşabilir (lost update değil). Bu yüzden karışık-tip
testi benzersizlik yerine **zincir tutarlılığı** (`balanceAfter[i] = balanceAfter[i-1] + quantity[i]`)
kontrol ediyor. (Benim 50-paralel testim yalnız fire -1 kullandığı için orada benzersizlik geçerli.)

### `postgres-pro` — FOR UPDATE kanıtlandı, 3 gerçek bulgu düzeltildi

Canlı iki psql oturumuyla FOR UPDATE'i **kanıtladı**: Session B, A commit edene kadar bloklandı
ve stale 100 değil A'nın yazdığı yeni 90 değerini okudu. RLS + FOR UPDATE birlikte doğru çalışıyor,
tenant filtresi kilidi bozmuyor; READ COMMITTED altında ikinci tx en güncel commit'i okuyor.
Transaction yarıda kalırsa Prisma otomatik ROLLBACK, invaryant korunuyor.

Düzeltilen 3 bulgu:

- **`connection_limit=20` sessizce yok sayılıyordu.** `@prisma/adapter-pg` `pg.Pool` kullanıyor;
  o URL'deki `connection_limit`'i değil yalnız `max` seçeneğini okuyor (ampirik: pool max=10).
  → `createPrismaClient` URL'den `connection_limit`'i ayrıştırıp `PrismaPg({ max })`'a geçiyor.
- **`complete()` deadlock riski:** `items` sorgusunda `orderBy` yoktu; iki sayım ürünleri farklı
  sırayla kilitlerse deadlock. → `orderBy: { productId: 'asc' }` (global kilit sırası kuralı).
- **`addItem` trackStock kontrol etmiyordu:** takipsiz ürün sayıma girerse `complete` tüm
  transaction'ı geri alır ve sayım bir daha tamamlanamaz (kalem silme yok). → girişte reddediliyor.

Temiz: FOR UPDATE serileştirmesi, negatif stok okuması, sayım stok sabitliği. Mikro not: `adjust`
aynı satırı iki kez FOR UPDATE ediyor (self-deadlock değil, fazladan round-trip — ölçek notu).

### 50-paralel test: invaryant-odaklı (yol boyunca)

Tek satıra 50-yönlü kontenşın patolojik: N > pool olduğunda bazı istekler transaction'a başlamak
için bağlantı bekleyip `maxWait`'e takılıyor (34/50 gibi). FOR UPDATE lost-update'i engelliyor —
testin asıl kanıtı **invaryant**: kaç istek başarılıysa `ledger toplamı = denormalize = 100−başarılı`
ve balanceAfter zinciri tutarlı (`her balanceAfter = önceki + quantity`). "Tam 50 tamamlansın"
şartı kaldırıldı; 3 ardışık koşu flaky değil.

---

## Bilinen eksikler / sonraki fazlara

| Konu                                                                | Neden                                                                                                                                              | Ne zaman        |
| ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| N-yönlü tek-satır yazımda pool < N ise bazı istekler timeout        | connection_limit gerçekten 20; N=50 istekte 30'u bağlantı bekler. Gerçek POS'ta tek ürüne 50 eşzamanlı yazım yok (1-3 kasa). Test invaryant-odaklı | İzlenir         |
| `adjust` aynı satırı iki kez kilitliyor                             | Fazladan round-trip (self-deadlock değil). Okunan stockQuantity applyMovement'a geçilerek atlanabilir                                              | Gerektiğinde    |
| `lock_timeout` ayarlı değil                                         | Sıcak satırda tx 15s'e kadar bağlantı tutabilir; `SET LOCAL lock_timeout` erken 'tekrar dene' hatasına çevirir (postgres-pro önerisi)              | Ölçek büyüyünce |
| `expectedQuantity` kalem ilk okutmada donuyor (sayım başında değil) | Uzun sayımda satış olursa ürün başına expected farklı anları yakalar. Hedef ölçekte kabul edilebilir                                               | Gerektiğinde    |
| Store-wide sayım (binlerce SKU) tek transaction                     | `complete` tüm ürün satırlarını 15s boyunca kilitler; hedef pazarda (tek dükkan) sorun değil                                                       | Ölçek büyüyünce |

---

## Sonraki faz için uyarılar

**Faz 5 (cari & alış faturası)**

- Alış faturası kaydı `applyMovement`'ı `type: 'PURCHASE'`, pozitif miktar, `unitCost` (KDV hariç)
  ve `purchaseId` ile çağırmalı — stok girişi + ağırlıklı ortalama maliyet güncellemesi + cari borç
  **tek transaction'da** (01-proje.md). Maliyet alanları `Decimal(14,4)` (Faz 1 kararı).
- `applyMovement` artık `{ movement, lowStock }` döndürüyor; Faz 5/6 çağrıları `emitLowStock`'u
  commit sonrası çağırmalı (yan etki transaction sonrası).
- Alış faturası iptali `applyMovement`'ı ters işaretli `PURCHASE_RETURN` ile çağırıp maliyeti ve
  cariyi geri almalı — ama ağırlıklı ortalama araya satış girdiyse tam geri alınamaz (Faz 1 notu:
  "ters kayıt/düzeltme" modeli, "eski değere dönmez").
- Ağırlıklı ortalama maliyet hesabı: Faz 1 notunda `averageCost` `Decimal(14,4)` yapılmıştı; her
  alışta `totalCostValue / stockQuantity` deseni önerilmişti — Faz 5'te uygulanacak.
