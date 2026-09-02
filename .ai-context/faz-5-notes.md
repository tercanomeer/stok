# Faz 5 — Cari & alış faturası

**Tarih:** 2026-09-02 · **Durum:** kapandı — doğrulama geçti, üç faz ajanının bulguları işlendi

---

## Ne eklendi

**Modül** `apps/api/src/modules/contacts/`

- `contact.service.ts` — çekirdek `applyTransaction` primitifi (cari FOR UPDATE ile kilitli,
  işaretli hareket + `balanceAfter` + denormalize `balance`) ve müşteri/tedarikçi CRUD
- `contact-ledger.service.ts` — tahsilat/ödeme kaydı, ekstre (açılış-kapanış bakiyesi),
  borç yaşlandırma (FIFO), ekstre Excel çıktısı
- `dto/contact.dto.ts`, `contacts.controller.ts`, `contacts.module.ts`

**Modül** `apps/api/src/modules/purchases/`

- `purchase.service.ts` — alış faturası kaydı ve iptali; **tek transaction'da** stok girişi +
  ağırlıklı ortalama maliyet + tedarikçiye borç
- `dto/purchase.dto.ts`, `purchases.controller.ts`, `purchases.module.ts`

`ContactsModule` ve `PurchasesModule` app'e bağlandı. `TransformResponseInterceptor`
`StreamableFile`'ı zarflamadan geçirecek şekilde güncellendi (ekstre Excel indirmesi).

`schema.prisma`: `ContactTransactionType` enum'una bakiye konvansiyonu yorumu eklendi
(yapısal değişiklik yok, migration gerektirmedi).

---

## Alınan kararlar

### 1. Cari bakiye konvansiyonu — işaretli tek yazma yolu

`balance > 0` = cari **bize borçlu** (alacak), `< 0` = biz cariye borçluyuz. `DEBIT += amount`,
`CREDIT -= amount`. `Contact.balance` denormalize; **yalnız** `applyTransaction` içinde,
cari satırı `SELECT ... FOR UPDATE` ile kilitliyken yazılır (Faz 4 stok primitifiyle aynı desen).
`balanceAfter` çalışan bakiyeyi tutar. Alış = tedarikçiye borç = CREDIT (bakiye negatife gider),
iptal = DEBIT (geri döner). Tahsilat `collect`→CREDIT, ödeme `pay`→DEBIT.

### 2. Alış faturası — çok etkili tek transaction

`create()` tek `withTenant` transaction'ında: Purchase + kalemler yazılır, her kalem için ürün
`FOR UPDATE` kilitlenir, `applyMovement(type: PURCHASE)` ile stok girişi yapılır, ağırlıklı
ortalama maliyet güncellenir (`averageCost` Decimal 14,4, `lastPurchasePrice` 12,2), en son cari
CREDIT yazılır. Biri patlarsa hepsi geri alınır. `stock.low` event'i **commit'ten sonra**
`emitLowStock` ile yayınlanır (yan etki transaction sonrası — 03-mimari). Birim maliyet =
`lineTotal / quantity` (iskonto sonrası matrah / miktar, KDV hariç); aynı değer stok hareketine,
maliyete ve lastPurchasePrice'a beslenir. Para uçtan uca Decimal.

### 3. İptal — üç etkiyi de geri alır, atomik claim

`cancel()` aynı transaction'da: her kalem için `PURCHASE_RETURN` (ters işaretli), maliyet ters
formülle geri hesaplanır, cari DEBIT ile borç geri alınır. Çift iptal `updateMany(where status=
COMPLETED)` atomik claim'iyle engellenir (ikinci istek 409). Araya satış/fire girmişse ağırlıklı
ortalama **birebir eski değere dönmez** (ters kayıt modeli — hassasiyet kaybı kabul; negatif değil,
aşağıya bak).

### 4. Ağırlıklı ortalama negatife düşmez (debugger BUG1 + code-reviewer F4)

`weightedAverageReverse` yalnız `qtyBefore<=0` durumunu 0'a kelepçeliyordu; pay
(`qtyNow*avgNow − qtyIn*costIn`) negatif olduğunda negatif `averageCost` yazıyordu (araya satış
girip stok azaldıktan sonra çok ucuz büyük bir alış ortalamayı seyreltince). Negatif maliyet
sonraki alışlara sızıp COGS/kâr hesabını bozardı. → sonuç `< 0` ise **0'a kelepçelenir**.
Regresyon testi: 10@100 → fire 9 → 100@1 → A iptal → `averageCost >= 0`.

### 5. Yaşlandırma fazla ödemeyi ileri taşır (debugger BUG2)

`aging()` FIFO'da açık borçları aşan tahsilatın fazlası sessizce atılıyordu; müşteri fazla ödeyip
sonra yeni veresiye alınca `aging().total` gerçek `Contact.balance`'ı aşıyordu. → fazla tahsilat
`carry`'de peşin ödeme olarak tutulur, sonraki DEBIT'lerden düşülür. Regresyon: DEBIT 100 →
CREDIT 150 → DEBIT 80 ⇒ `aging().total = 30 = Contact.balance` (yamasız 80 olurdu).

### 6. Tutarlı kilit sırası — deadlock önleme (code-reviewer F1)

`create()` kalemleri client sırasında, `cancel()` sırasız Prisma sonucunda kilitliyordu; iki
eşzamanlı fatura ürünleri ters sırada kilitlerse deadlock. → her iki yol da **productId artan**
sırayla kilitler (`create` `computed`'i sıralar, `cancel` `orderBy: { productId: 'asc' }`).
Cari kilidi her zaman en sonda alınır.

### 7. Giriş doğrulaması — sıfır miktar ve %100+ iskonto reddedilir (code-reviewer F2, F3)

`quantity` regex `"0"`'ı geçiriyordu → `0/0 = NaN` maliyet. `discountRate` `>100`'ü geçiriyordu →
negatif satır matrahı → karışık faturada commit edilen negatif maliyet. → DTO'da `quantity > 0`
ve `discountRate <= 100` refine'ları eklendi (ikisi de 400).

### 8. Ekstre Excel; PDF web'e bırakıldı

Ekstre `GET /contacts/:id/statement.xlsx` ile ExcelJS'ten üretilir (Faz 3 import ile aynı ESM
default-import deseni). `StreamableFile` zarftan muaf tutuldu. PDF çıktısı yeni ağır bağımlılık
(pdfkit/puppeteer) gerektirdiği ve ekstre JSON'undan (`GET :id/statement`) web print görünümünde
üretmek daha uygun olduğu için Faz 5'te **eklenmedi** — bilinen eksik.

---

## Doğrulama çıktıları

```
pnpm lint          12/12 ✓
pnpm typecheck     12/12 ✓
pnpm test          12/12 ✓  (api 67 test; purchase.e2e 15)
pnpm build          8/8  ✓
pnpm format:check  ✓
```

Faz 5 doğrulama bloğu (e2e, gerçek Postgres):

- **Alış kaydı sonrası:** stok arttı (0→10), ağırlıklı ortalama maliyet doğru (sıfırdan 100;
  ikinci alışta `(10*100 + 10*200)/20 = 150`), cari borç oluştu (−1200 = grandTotal).
- **İptal sonrası:** üçü de eski haline döndü (stok 0, maliyet 0, bakiye 0); fatura CANCELLED;
  ikinci iptal 409.
- **Ekstre toplamı = cari bakiye:** kapanış (tüm-zaman aralığı) `Contact.balance` ile birebir eşit.

Ek e2e (test-automator + regresyon): iskontolu kalem, çok kalemli fatura, StockMovement kaydı
(PURCHASE/PURCHASE_RETURN + purchaseId), fire-arası iptal, cross-tenant izolasyon (404),
sıfır miktar/yüksek iskonto reddi, negatif maliyet kelepçesi, fazla ödeme yaşlandırması.

---

## Ajan bulguları

### `code-reviewer` — çekirdek doğru, 3 gerçek + 1 tasarım bulgusu

Çok etkili transaction'ın atomik olarak doğru olduğunu **kanıtladı** (tek `tx`, commit sonrası
event, uçtan uca Decimal, RLS/FOR UPDATE/atomik çift-iptal temiz). Düzeltilen: kilit sırası
deadlock (karar #6), `quantity="0"` → NaN (karar #7), `discountRate>100` → negatif maliyet
(karar #7). Tasarım notu (F4): tam-drenaj iptalinde maliyet 0 — karar #4'te ele alındı.

### `debugger` — 2 kanıtlanmış tutarsızlık, ikisi de düzeltildi

Negatif `averageCost` (BUG1 → karar #4) ve yaşlandırma fazla ödeme sapması (BUG2 → karar #5)
Node ile birebir tekrar üretilip düzeltildi. `Contact.balance` sayısal zincirinin FOR UPDATE ile
sağlam olduğunu (lost update yok) doğruladı.

### `test-automator` — üretim bug'ı yok, 5 gap testi ekledi

Mevcut 6 testin doğrulama bloğunu gerçekten (DB'den, deterministik) ölçtüğünü onayladı; iskontolu
kalem, çok kalemli fatura, StockMovement kaydı, fire-arası iptal, cross-tenant testlerini ekledi.
İki ardışık koşuda flaky değil.

---

## Bilinen eksikler / sonraki fazlara

| Konu                                                          | Neden / karar                                                                                                                                                                 | Ne zaman        |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| Ekstre **PDF** çıktısı                                        | Yeni ağır bağımlılık; ekstre JSON'undan web print görünümünde üretilecek                                                                                                      | Web / Faz UI    |
| Tahsilat/ödemenin **kasa hareketine** bağlanması              | Kasa/vardiya modülü Faz 6; şimdilik yalnız cari hareket + audit yazılıyor                                                                                                     | Faz 6           |
| Araya satış girince ağırlıklı ortalama birebir dönmez         | Ters kayıt modeli; negatif değil ama hassasiyet kaybı (karar #4). Gerçek geri-hesap için parti/lot takibi gerekir                                                             | Ölçek büyüyünce |
| Ledger `createdAt` sıralaması eşzamanlı yazımda ters olabilir | `createdAt` = transaction_timestamp; FOR UPDATE kilit sırası farklı olabilir. `balance` **değeri** doğru; yalnız raporlanan sıra etkilenir. Monotonik sequence kolonu gerekir | Ölçek büyüyünce |

---

## Sonraki faz için uyarılar

**Faz 6 (kasa, vardiya, satış + pos-core)**

- Satış (veresiye) cari `DEBIT` yazacak; `contacts.applyTransaction`'ı `type: 'DEBIT'`,
  `saleId` ile çağırmalı — ikinci bir bakiye yazma yolu açılmaz (`Contact.balance`'a yazan tek yer
  `contact.service.ts` `applyTransaction`).
- Tahsilat/ödeme (`contact-ledger.recordPayment`) Faz 6'da kasa hareketine bağlanmalı — şu an
  yalnız cari hareket + audit yazıyor; `paymentMethod` alanı hazır.
- Satış maliyeti (COGS) ürün `averageCost`'undan okunacak; averageCost artık negatife düşmüyor
  (karar #4), güvenle kullanılabilir.
- Kredi limiti kontrolü (`Contact.creditLimit`, `SALE_CREDIT_OVER_LIMIT` izni) veresiye satışta
  uygulanacak — alan ve izin hazır, mantık Faz 6.
