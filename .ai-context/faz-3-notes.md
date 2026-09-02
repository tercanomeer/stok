# Faz 3 — Katalog & ürün

**Tarih:** 2026-09-02 · **Durum:** kapandı — doğrulama geçti, üç faz ajanının bulguları işlendi

---

## Ne eklendi

**Modüller** (`apps/api/src/modules/`)

- `catalog/` — kategori (ağaç), marka, birim CRUD. Soft delete, kullanımdaki kayıt silinemez (409)
- `products/` — ürün CRUD, çoklu barkod, arama, toplu fiyat, Excel import, barkod etiketi
- `storage/` (`apps/api/src/storage/`) — S3/MinIO; ürün görseli + PDF, MIME/boyut kontrolü

**Altyapı**

- `common/pagination/` — ortak sayfalama (`?page&limit&sort&search`), güvenli `parseSort` whitelist
- `ImportJob` modeli + migration + RLS politikası (Faz 1 architect notundaki eksik model)
- BullMQ (`@nestjs/bullmq`) — Excel import kuyruğu, worker API ile aynı süreçte
- `@stokk/types/defaults.ts` — varsayılan birim/kategori/gider kategorisi (tek kaynak)

---

## Alınan kararlar

### 1. Kayıt akışı varsayılan katalog oluşturuyor (yol boyunca yakalandı)

Faz 2 kayıt akışı tenant + rol + Patron + kasa oluşturuyordu ama **birim yoktu** — birim
zorunlu olduğu için yeni tenant ürün ekleyemiyordu. Varsayılan birim/kategori listesi
`@stokk/types`'a taşındı; hem `register` (apps/api) hem `db:seed` (packages/db) buradan okuyor,
ikinci bir liste tutulmuyor.

### 2. Türkçe sıralama sorgu bazında COLLATE (sütuna gömülmedi)

Cluster locale'i C.UTF-8 (Faz 1). Ürün adı sıralaması `Intl.Collator('tr')` ile DB'de
sayfalamadan **önce** yapılıyor (aşağıda, database-optimizer bulgusu). Sütun collation'ı
trigram GIN indeksini etkileyeceği için tercih edilmedi. Migration'da gerekmedi.

### 3. Excel import: BullMQ worker, satır bazlı kısmi başarı

Dosya kuyruğa alınır, worker her satırı **ayrı transaction** ile işler — bir satırın hatası
diğerlerini geri almaz (kısmi başarı). `ImportJob.errors` JSON'unda satır bazlı hata raporu.
Job retention açık (removeOnComplete/removeOnFail), aksi halde base64 payload'lar Redis'te birikirdi.

### 4. Ürün KDV oranı tenant ayarındaki listeden olmalı

`assertVatRate` — Faz 1 architect notundaki "Product.vatRate tenant vatRates'e bağlı değil"
boşluğu servis katmanında kapatıldı (Zod DB'ye erişemediği için).

---

## Doğrulama çıktıları

```
pnpm lint          12/12 ✓
pnpm typecheck     12/12 ✓
pnpm test          12/12 ✓  (api 38 test dahil)
pnpm build          8/8  ✓
pnpm format:check  ✓
pnpm db:reset      ✓ 9 migration + app rolü + seed
```

Faz 3 doğrulama bloğu (e2e, gerçek Postgres + Redis + MinIO):

- **5.000 ürün seed → arama < 100 ms** (test ölçüyor: `elapsed < 100`)
- **1.000 satır Excel import → 3 hata raporlanır, 997 ürün oluşur** (job COMPLETED beklenip
  `errorCount===3`, `createdCount===997` doğrulanıyor)
- **Aynı barkod 2. kez → 409**

Ek e2e (gap testleri): barkod araması, Türkçe insensitive arama, toplu fiyat (preview/uygula +
fiyat geçmişi + negatif→0), kullanımdaki marka/birim silinemez (409), cross-tenant ürün 404,
soft-delete listede görünmez, soft-delete barkodu serbest bırakır, etiket PDF, görsel yükleme,
Türkçe sıralama sayfalama tutarlılığı.

---

## Ajan bulguları

### `code-reviewer` — Q6 bulguları düzeltildi

- **Dosya boyutu sınırı yoktu** (FileInterceptor) → import 10 MB, görsel 5 MB limiti eklendi.
- **Job retention yoktu** → base64 payload'lar Redis'te birikecekti → removeOnComplete/removeOnFail.
- **PROCESSING update try dışındaydı** → hata durumunda job PENDING'de takılırdı → try içine alındı.
- **Öksüz S3 nesnesi** (görsel yüklenip ürün yoksa) → yüklemeden önce ürün varlık kontrolü.
- storage string yerine `ValidationError` fırlatıyor (DomainError felsefesi).
- Temiz: tenant izolasyonu (her sorgu `withTenant`), `$queryRawUnsafe`'te SQL injection yok
  (yalnız `tr-x-icu` sabiti interpolate), transaction atomikliği.

### `test-automator` — 7 gap testi ekledi + 1 gerçek bug buldu

**Bug (düzeltildi):** soft-delete edilen ürünün barkodu serbest kalmıyordu — `remove()` barkodlara
dokunmuyordu, `(tenantId, value)` unique yüzünden aynı barkodla yeni ürün 409 alıyordu. → `remove()`
barkod satırlarını fiziksel siliyor. Regresyon testi eklendi.

### `database-optimizer` — 2 bulgu düzeltildi

- **Türkçe sıralama sayfalama bug'ı (correctness):** sayfayı DB varsayılan sırasıyla çekip yalnız
  o sayfayı bellekte sıralıyordum → yanlış kayıtlar sayfaya giriyordu. → filtreye uyan (id, name)
  çekilip Türkçe collator ile sıralanıyor, sayfa dilimleniyor, tam satırlar sıra korunarak
  yükleniyor. Sayfalama tutarlılık testi eklendi.
- **Barkod araması `contains` → tam eşleşme:** okuyucu tam kodu verir; `value = term` mevcut
  `(tenantId, value)` unique indeksini kullanıyor, substring'e göre ~300x hızlı (0.016 ms vs 4.7 ms).

**Ölçüm:** <100 ms bütçesi karşılanıyor (en kötü 38 ms, JIT dahil). Ama bu emniyet payı
**tenant-scoped btree indekslerden** geliyor, trigram indekslerinden değil.

### RLS + trigram etkileşimi (database-optimizer'ın kilit tespiti — bilinen sınır)

`ILIKE` (`~~*`) leakproof olmayan bir operatör. PostgreSQL RLS, leakproof olmayan qual'ları ancak
leakproof bir qual (bizde `tenantId = <literal>`) satırları tenant'a daralttıktan **sonra**
çalıştırıyor. Sonuç: planlayıcı **her zaman** tenant btree indeksini seçip `ILIKE`'ı bellekte
Filter olarak uyguluyor; `products_name_idx` (ve `contacts_name_idx`) trigram indeksleri
**bu RLS + ILIKE tasarımında planlayıcı tarafından hiç seçilmiyor** — yazma yükü getiriyor ama
kullanılmıyor. Hedef pazarda (tenant kataloğu ≤ 20.000) fallback yolu (tenant-btree → bellek ILIKE)
zaten ucuz olduğu için performans sorunu yok.

---

## Bilinen eksikler / sonraki fazlara

| Konu                                        | Neden                                                                                                                                                                                                   | Ne zaman                   |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| Trigram indeksleri RLS altında ölü ağırlık  | `products_name_idx`/`contacts_name_idx` planlayıcı tarafından seçilmiyor. Tenant kataloğu 100k+ satırı geçerse `btree_gin` ile `(tenantId, name gin_trgm_ops)` bileşiğine çevrilmeli (leakproof-uyumlu) | Ölçek büyüyünce            |
| `code`/`barkod substring` araması indekssiz | Seq Scan (4-5 ms, bütçe içinde) ama O(katalog boyutu). Barkod artık tam eşleşme; kod substring nadir                                                                                                    | Gerektiğinde               |
| bulkPrice döngüsü sıralı (1000'e kadar)     | Uzun transaction; nadir admin işlemi. `updateMany` + batch ile iyileştirilebilir                                                                                                                        | Gerektiğinde               |
| Decimal serileştirme tutarsızlığı           | `salePrice` bazen `"100"` bazen `"100.00"` (trailing zero düşüyor). POS ekranında beklenmeyen gösterim olabilir                                                                                         | Faz 13 öncesi gözden geçir |
| JIT overhead (~7-11 ms)                     | Planlayıcı OR predicate'inde satır sayısını fazla tahmin ediyor, `jit_above_cost` eşiğini aşıyor. Bütçeyi bozmuyor                                                                                      | Faz 7 (rapor sorguları)    |

---

## Sonraki faz için uyarılar

**Faz 4 (stok)**

- `Product.stockQuantity` denormalize alan; stok hareketi ledger'ı Faz 4'te yazılıyor. Ürün oluştururken
  stok 0 başlıyor, elle set edilmiyor (CLAUDE.md: stok hareket defterinden türetilir).
- `assertBarcodesFree` ve barkod benzersizliği DB `(tenantId, value)` unique'e dayanıyor;
  yarışta P2002 → 409 (kod bunu çeviriyor). Soft-delete artık barkodu fiziksel siliyor.
- Yeni tenant tablosu eklenirse: `@stokk/types/tenant-scoped.ts` listesine ekle **ve** RLS
  politikası migration'ı yaz (otomatik gelmez — Faz 2 notu, ImportJob'da uygulandı).
- Import worker deseni (BullMQ + ayrı transaction/satır) stok toplu işlemlerinde tekrar kullanılabilir.
