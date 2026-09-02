# Faz 1 — Veri modeli

**Tarih:** 2026-09-02 · **Durum:** kapandı — doğrulama geçti, üç ajanın da bulguları işlendi

---

## Ne eklendi

- `packages/db/prisma/schema.prisma` — **34 model**, 6 alan grubunda:
  kimlik & yetki, katalog & ürün, stok, cari & alış, kasa & satış, finans & yasal
- **5 migration**, hepsi commit'li (`db push` kullanılmadı). Sıfırdan reset ile beşinin de
  sırayla temiz uygulandığı doğrulandı:
  - `20260902073246_init` — 1104 satır, tüm şema + `pg_trgm` extension'ı
  - `20260902073414_root_category_unique` — kısmi unique indeks (elle yazıldı)
  - `20260902075055_sale_payment_date_index` — `database-optimizer` bulgusu
  - `20260902075500_cost_precision` — `postgres-pro` bulgusu (elle yazıldı)
  - `20260902080000_cash_document_fks` — `architect-reviewer` bulgusu (elle yazıldı)
- `packages/types/src/permissions.ts` — 45 izin sabiti + 3 sistem rolünün izin kümesi
- `packages/db/prisma/seed.ts` — idempotent seed
- `packages/types/src/permissions.spec.ts` — 6 test (katalog tutarlılığı, rol kısıtları)

---

## Alınan kararlar

### 1. `Permission` tenant'a bağlı değil (kullanıcıya soruldu, onaylandı)

CLAUDE.md "her tabloda `tenantId`" diyor. İzin kataloğu bunun **tek istisnası**: içinde tenant
verisi yok, sızıntı yüzeyi yok, tenant sınırı ona referans veren `Role` üzerinde. Planın kendi
seed talimatı da ("db:seed izin kataloğunu oluşturur") sistem geneli bir katalog ima ediyor.

`tenantId` taşımayan diğer tablolar ve gerekçeleri:

| Tablo              | Neden                                              |
| ------------------ | -------------------------------------------------- |
| `tenants`          | Tenant'ın kendisi                                  |
| `permissions`      | Sistem kataloğu (yukarıda)                         |
| `role_permissions` | Junction; tenant sınırı `Role` üzerinden           |
| `user_roles`       | Junction; tenant sınırı `User` ve `Role` üzerinden |

### 2. Kök kategorilerde benzersizlik kısmi indeksle çözüldü

`@@unique([tenantId, name, parentId])` kök kategorileri korumuyor: Postgres NULL'ları birbirinden
farklı sayar, dolayısıyla `parentId IS NULL` olan aynı isimli kategoriler tekrar eklenebiliyordu.
Prisma şema dilinde partial index ifade edilemediği için ikinci migration'a elle yazıldı.
Migration geçmişinin parçası olduğu için drift üretmiyor.

Diğer nullable bileşik unique kısıtlarında bu davranış **istenen**: `sales.clientSaleId` yalnız
offline satışlarda dolu (online satışların hepsi NULL, çakışmamalı), `products.code` /
`contacts.code` opsiyonel, `purchases.invoiceNo` aynı tedarikçiden faturasız birden çok giriş
olabilir, `e_invoices.externalId` taslaklarda boş.

### 3. Alış fiyatı KDV hariç, satış fiyatı KDV dahil

`purchase_items.unitPrice` KDV **hariç** (maliyet ve indirilecek KDV bu ayrımı gerektiriyor),
`sale_items.unitPrice` ve `products.salePrice` KDV **dahil** (01-proje.md "Para & KDV").
`products.averageCost` ve `sale_items.unitCost` KDV hariç. Bu, Faz 0 notlarında "cevabı olmayan
iş kuralı" olarak işaretlenen maddeydi; şemada karara bağlandı.

### 4. KDV kırılımı satış üzerinde saklanıyor

`sales.vatBreakdown` (Json) — oran bazında matrah/vergi. Faz 0 notlarındaki "karışık oranlı
sepette tek toplamda yuvarlama, oran bazlı kırılımla tutmayabilir" uyarısının veri tarafı.
`@stokk/pos-core`'daki `VatBreakdownEntry` sözleşmesiyle aynı şekil.

### 5. Satış kalemleri ürün adını ve maliyeti donduruyor

`sale_items.productName` ve `sale_items.unitCost` satış anındaki değerleri saklıyor. Ürün
sonradan yeniden adlandırılsa veya maliyeti değişse eski fiş ve kâr raporu değişmiyor.

---

## Prisma 7 davranış farkları (Faz 1'de ortaya çıktı)

- **`migrate reset` seed'i kendiliğinden çalıştırmıyor.** Plan "reset = migration + seed" diyor;
  `packages/db` `reset` script'ine `prisma db seed` açıkça zincirlendi.
- **Studio rastgele port seçiyor.** `--port 5555` ile plandaki porta sabitlendi.
- **`prisma migrate reset` AI ajanlarına karşı korumalı.** Prisma, Claude Code tarafından
  çağrıldığını tespit edip açık kullanıcı onayı istiyor; onay `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION`
  ile veriliyor. Sonraki fazlarda reset gerektiğinde kullanıcıya sorulmalı.

---

## Doğrulama çıktıları

```
pnpm db:validate   ✓ şema geçerli
pnpm db:reset      ✓ 2 migration + seed sıfırdan temiz geçti
pnpm db:seed       ✓ 2. ve 3. çalıştırmada da aynı sayılar (idempotent)
pnpm db:studio     ✓ HTTP 200 (:5555)

pnpm lint          12/12 ✓
pnpm typecheck     12/12 ✓
pnpm test          12/12 ✓  (17 test: types 8, api 6, pos-core 1, ui 1, db 1)
pnpm build          8/8  ✓
pnpm format:check  ✓
```

Seed sonucu (üç çalıştırmada da sabit):
`izin=45 rol=3 rol-izin=90 birim=9 kategori=7 gider-kat=8 kasa=1`

Şema doğrulaması (canlı DB'ye sorgu):

- 34 tablo + `_prisma_migrations`; `cash_movements.saleId`, `expenses.cashSessionId`,
  `incomes.cashSessionId` dahil eksik FK sayısı 0
- `pg_trgm` extension'ı kurulu, 2 GIN trigram indeksi (`products_name_idx`, `contacts_name_idx`)
- `(tenantId, value)` barkod, `(tenantId, receiptNo)`, `(tenantId, clientSaleId)` unique kısıtları yerinde
- `numeric` sütunlarının hepsi `(12,2)` veya `(12,3)`; `(5,2)` olanlar yalnız yüzde alanları
  (`discountRate`, `highDiscountThreshold`)

---

## Ortam sorunu — migration yanlış veritabanına gidiyordu

**Bu faz sırasında yakalandı ve düzeltildi.** Homebrew `postgresql@16` servisi
`127.0.0.1:5432` ve `[::1]:5432`'yi tutuyordu; Docker ise `*:5432`'ye bağlıydı. `localhost`
önce Homebrew'a gittiği için Prisma bizim container'ı değil, **eski projeden kalan yerel
`stokk` veritabanını** okuyordu ve `migrate reset` ile onu silmeyi öneriyordu (35 tablo, 223 satır).

Kullanıcı onayıyla: eski `stokk` veritabanı düşürüldü, `brew services stop postgresql@16`
çalıştırıldı, aynı örnekteki `novapos` veritabanı korundu.

**Sonraki fazlar için:** `pnpm db:*` çalıştırmadan önce 5432'yi kimin tuttuğunu doğrula:

```bash
lsof -nP -iTCP:5432 -sTCP:LISTEN     # yalnız com.docker olmalı
psql "$DATABASE_URL" -tAc "select version();"   # PostgreSQL 17.x = Docker
```

Homebrew Postgres tekrar başlatılırsa (`novapos` için) aynı çakışma geri gelir.

---

## Turbo grafiği düzeltmesi

`pnpm db:seed` turbo grafiğini atlıyordu ve bayat `@stokk/types/dist`'i import ederek taze klonda
kırılıyordu (`ALL_PERMISSIONS is not iterable`). Tüm `db:*` kök script'leri turbo üzerinden
geçirildi; `@stokk/db#seed` / `#reset` `^build`'e ve `@stokk/db#generate`'e bağlandı.
`prisma.config.ts`'teki seed komutu da `pnpm turbo run seed --filter @stokk/db` oldu.

---

## Ajan bulguları

### `postgres-pro` — 1 gerçek bulgu, **düzeltildi**

**Maliyet zincirinde yuvarlama birikimi.** `products.averageCost` `Decimal(12,2)` idi; ağırlıklı
ortalama her alışta yeniden hesaplanıp doğrudan bu sütuna yazıldığı için her adımda kuruşa
yuvarlanıyor ve sapma birikiyordu. 01-proje.md'nin "kuruş farkı tek yerde toplanır" kuralı
yalnız fiş toplamı için tanımlı, maliyet zinciri için telafi yok.

Canlı DB'de doğrulandı: `7×10.00 + 3×10.03` → gerçek ortalama `10.009`;
`Decimal(12,2)` → `10.01` (sapma 0.001, her alışta tekrar), `Decimal(14,4)` → `10.0090` (sapma 0).

→ `products.averageCost`, `stock_movements.unitCost`, `sale_items.unitCost` **`Decimal(14,4)`**
oldu (migration `20260902075500_cost_precision`). Şema başlığındaki para kuralına istisna olarak
yazıldı.

Temiz çıkanlar: nullable bileşik unique kısıtların hepsi (categories dışında) kasıtlı,
indeksler temiz, `Decimal(12,2)` üst sınırı hedef ölçek için fazlasıyla yeterli.

### `architect-reviewer` — FK bütünlüğü bulgusu **düzeltildi**, kalanlar aşağıda

**Düzeltildi:** `cash_movements.saleId`, `expenses.cashSessionId`, `incomes.cashSessionId`
serbest metin olarak kalmıştı — FK yoktu. Canlı DB'de doğrulandı (`FK YOK`), gerçek ilişkiye
çevrildi (migration `20260902080000_cash_document_fks`). Bu haliyle vardiya kapanış formülü
(`açılış + nakit satış + tahsilat − gider − nakit iade`) denetlenemiyordu: "bu gider hareketi
hangi gidere ait" sorusu cevapsızdı ve mükerrer kayıt engellenmiyordu.

**Faz 6'dan (satış/kasa) önce karara bağlanması gerekenler** — hepsi `pos-core` sözleşmesini
veya satış transaction'ının şeklini etkiliyor:

| #   | Bulgu                                                                                                                                                                               | Neden şimdi karar gerekiyor                                                                                                                                                                        |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `Sale.roundingAmount` yok; üstelik `sale_items` tutar alanları `Decimal(12,2)` olduğu için satır bazında yuvarlama zorunlu kılınmış                                                 | Kural "yuvarlama satır bazında değil fiş toplamında, kuruş farkı tek yerde toplanır" diyor — o tek yer şemada yok. `SaleTotals` sözleşmesinde de karşılığı yok                                     |
| 2   | Ardışık/boşluksuz fiş numarası için sayaç modeli yok; ayrıca `PARKED` satış zorunlu `receiptNo` tüketiyor, park iptal edilirse numara yanıyor                                       | `postgres-pro` de aynı sonuca vardı: sequence gapless değil, `MAX+1` string sıralamasında yanlış. `DocumentSequence{tenantId,type,lastNumber}` + satışla **aynı transaction**                      |
| 3   | `SaleReturn.refundMethod` tekil → parçalı ödenmiş fişin parçalı iadesi modellenemiyor. `SaleReturn.cashSessionId` de yok                                                            | Kural "ödeme yöntemine göre iade edilir"; kart iadesi vardiyasız kalıyor                                                                                                                           |
| 4   | Yetki/denetim alanları yok: `Sale.cancelledById`, `Sale.discountOverrideById`, `Sale.creditOverrideById`, `Sale.discountRate`, `CashSession.closedById`, `StockCount.completedById` | "%10 üzeri indirim izin ister" ve "limit aşımını yetkili onaylar" kurallarının onaylayanı hiçbir yere yazılmıyor; fiş geneli indirim **oranı** saklanmadığı için eşik aşımı sonradan türetilemiyor |
| 5   | Offline idempotency yalnız `Sale`'de; `CashSession`/`CashMovement` için client id yok                                                                                               | Sync at-least-once; vardiya iki kez açılabilir, nakit hareketi mükerrer yazılabilir                                                                                                                |

### `database-optimizer` — 1 ölçülmüş bulgu, **düzeltildi**

**`sale_payments` ödeme dağılımı raporu Seq Scan'e düşüyordu.** Mevcut
`(tenantId, method, createdAt)` indeksinin lider sütunu `method` yalnız 4 değer taşıyor;
rapor ise önce tarihe göre filtreleyip `method`'a göre grupluyor. 1M ödeme satırıyla ölçüldü:
**34 ms → 0.05 ms** (`(tenantId, createdAt)` indeksi eklendikten sonra). Eski indeks kaldırılmadı,
drill-down sorgularına hizmet ediyor.

Ölçülen diğer raporlar (günlük ciro, kâr, en çok satanlar, kasiyer performansı) 1M satış /
3M kalemle 0.02–0.08 ms — mevcut indeksler yeterli, ek indeks gerekmiyor.

**Ölçeklenme eşiği:** tarih aralıklı raporlar tablo boyutundan etkilenmiyor. İlk yavaşlayan şey
**tarihsiz "tüm zamanlar"** kâr raporu: 1M satışta 680 ms (Faz 7'nin 1 sn bütçesine yakın).
Somut eşik: tek tenant'ın `sales` tablosu ~1.5–2M satıra ulaştığında aşılır. Öneri —
rapor ekranlarında "tüm zamanlar" varsayılan olmasın; materialized view yerine günlük özet
tablosu (`Product.stockQuantity` ile aynı "transaction içinde güncelle" deseni) tercih edilsin.

**Trigram doğrulandı:** `name ILIKE '%kelime%'` (3+ karakter) GIN indeksini kullanıyor,
20.000 üründe 0.3–0.4 ms. 2 karakterlik aramalar indeks kullanmıyor (pg_trgm 3-gram tabanlı) —
20k ölçekte zararsız. Barkod tam eşleşmesi 0.011 ms (btree unique), ürün kodu prefix'i <0.03 ms;
bu ikisinde trigram gereksiz, mevcut tasarım doğru.

**Faz 2'de karar gerektiren yapısal bulgu:**

`(tenantId, id)` bileşik unique + bileşik FK yok. Servis katmanındaki bir hata `tenantId=A` olan
bir `SaleItem`'ı `tenantId=B` olan bir `Product`'a bağlayabilir ve **veritabanı kabul eder**.
CLAUDE.md bunu "kritik hata" sayıyor. Alternatifi RLS. Faz 2'nin tenant izolasyon kararıyla
birlikte verilmeli — Faz 0 notundaki Prisma `$use` uyarısıyla aynı başlık altında.

**Ertelenebilir (Faz 12/14):** `Barcode`'da `updatedAt`/`deletedAt` yok → silinen barkod POS
cache'inde tombstone olmadan kalır (Faz 12 sync). ÖKC mali fiş numarası alanları yok
(`Sale.fiscalReceiptNo`, `fiscalDeviceSerial` — Faz 14). Cari vade/yaşlandırma alanları yok
(`dueDate`, `paymentTermDays` — Faz 10, yoksa yaşlandırma işlem tarihine göre yapılır, plana yazılmalı).
"Hazır ürün kataloğu" kapsamda ama hiçbir fazda modeli yok (Faz 0 notunda da işaretliydi).

`database-optimizer`'dan ertelenenler: `products_name_idx` global GIN (tenantId içermiyor) —
tek tenant 20k üründe fark yok, ama tablo tüm tenant'lar toplamında birkaç yüz bin satırı
geçtiğinde `btree_gin` ile `(tenantId, name gin_trgm_ops)` bileşiğine çevrilmeli (600k satırda
8.3 ms → 0.365 ms ölçüldü). `products` tablosunda `fillfactor=90` (HOT update, `stockQuantity`
her satışta güncelleniyor) — ölçülmemiş öneri. Docker postgres varsayılan ayarlarla çalışıyor
(`shared_buffers=128MB`); Faz 7 performans doğrulaması production'a yakın config ile yapılmalı.
Cari yaşlandırma için `ContactTransaction` hangi borcun hangi tahsilatla kapandığını (FIFO
eşleştirme) modellemiyor — gerçek yaşlandırma bu ledger'dan türetilemez, Faz 5/10 kararı.

## Bilinen eksikler

| Konu                                 | Neden                                                                                                                                                                       | Ne zaman    |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| **Faz 1 ajan bulguları kapatılmadı** | `postgres-pro`, `database-optimizer`, `architect-reviewer` commit anında hâlâ çalışıyordu. Bulguları ayrı commit'te ele alınacak — **açık kritik bulgu varsa faz kapanmaz** | Hemen sonra |
| Türkçe sıralama (collation)          | Cluster `C.UTF-8`; sıralı gösterilen `text` sütunlarına ICU `tr-TR` collation'ı verilmedi. `ORDER BY name` şu an Türkçe için yanlış (`Çay` > `Zeytin`)                      | Faz 3       |
| Fiş numarası üretimi                 | `sales.receiptNo` String + unique kısıt var, ama "ardışık ve boşluksuz" üretim mekanizması (sequence / advisory lock / sayaç tablosu) yok                                   | Faz 6       |
| Ledger ↔ denormalize alan kilitleme  | `stock_movements.balanceAfter` ve `products.stockQuantity` var, eşzamanlılık stratejisi yok                                                                                 | Faz 4       |
| Seed kullanıcı oluşturmuyor          | bcrypt Faz 2'nin bağımlılığı; kayıt akışı orada yazılıyor                                                                                                                   | Faz 2       |

---

## Sonraki faz için uyarılar

**Faz 2 (auth & tenant izolasyonu)**

- **Faz 0 notundaki Prisma middleware uyarısı hâlâ geçerli ve artık aciliyetli:** `$use()` Prisma 7'de
  yok, `$extends` yeni client döndürüyor (`class PrismaService extends PrismaClient` deseni
  çalışmaz) ve query extension `$queryRaw`'ı kapsamıyor. 34 tablonun 30'u `tenantId` taşıyor;
  filtrenin nasıl zorlanacağı bu fazın ilk kararı olmalı.
- Kayıt akışı sistem rollerini `@stokk/types`'taki `SYSTEM_ROLE_PERMISSIONS`'tan kopyalamalı —
  seed ile aynı tanım, ikinci bir liste tutulmamalı.
- `Permission` global olduğu için kayıt akışı izin satırı **oluşturmaz**, yalnız `RolePermission`
  bağlar. Katalog `db:seed` ile gelir; production deploy'unda seed'in çalıştırılması şart.
- `refresh_tokens.tokenHash` unique ve `replacedById` alanı rotasyon zinciri için hazır.
- `audit_logs.changes` Json — PII (şifre, kart no, CVV) yazılmayacak, servis katmanında maskelenmeli.
