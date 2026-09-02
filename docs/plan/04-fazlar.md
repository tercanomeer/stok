# 04 — Fazlar

Faz sırası bağlayıcıdır: **her ekranın backend'i kendinden önceki fazda hazır olur.**
Bir faz, doğrulama adımları geçmeden kapanmaz.

**Her fazın sonunda ritüel:**

1. Doğrulama komutlarını çalıştır, çıktıyı raporla
2. **Fazın "Kullanılacak ajanlar" tablosundaki ajanları çalıştır**, bulgularını kapat
3. `/code-review` çalıştır, çıkan bulguları kapat
4. `.ai-context/faz-N-notes.md` yaz (ne eklendi / hangi karar / bilinen eksik / sonraki faz uyarısı)
5. Commit: yapılan işi anlatan Conventional Commit (`feat(product): barkod ile ürün arama`).
   "Faz N tamamlandı" biçiminde mesaj yazılmaz; birden çok konu varsa commit işe göre bölünür.

**Ajan kullanım kuralı:** Her fazın ajan tablosu o fazın tamamlanma koşuludur; kullanıcı ayrıca
istemese de çalıştırılır. Bağımsız olanlar paralel başlatılır, her birine dar ve doğrulanabilir
bir görev verilir. Ajan raporu bulgudur — kritik iddia kodda doğrulanır. Açık kritik bulgu varken
faz kapanmaz; kapatılamayan bulgu faz notlarına gerekçesiyle yazılır. Sıradan kodlama işi
ajana devredilmez, doğrudan yapılır.

---

## Faz 0 — Temel & altyapı

**Amaç:** Boş dizinden, üç uygulamayı ayağa kaldıran ve CI'da yeşil yanan bir iskelet.
**Süre:** 2–3 gün · **Bağımlılık:** yok

### Yapılacak işler

- [x] `pnpm-workspace.yaml` (`apps/*`, `packages/*`) + kök `package.json` script'leri
- [x] `turbo.json`: dev (persistent, cache'siz), build, lint, test, typecheck, clean pipeline'ları
- [x] `tsconfig.base.json` — `strict: true`, ES2022, path alias'ları
- [x] `@stokk/config` — eslint flat config (base / node / react), tsconfig preset'leri, tailwind preset'i
- [x] Prettier, `.editorconfig`, `.nvmrc` (Node 24), husky + lint-staged pre-commit
- [x] `docker-compose.yml` — postgres 17, redis 7, minio; hepsi healthcheck'li
- [x] `.env.example` + Zod env şeması (eksik değişkende uygulama açılmaz)
- [x] `apps/api` — NestJS iskelet, `/health` endpoint'i, global zarf interceptor'ı
- [x] `apps/web` — Next.js iskelet, boş layout
- [x] `apps/pos` — klasör yapısı ve build hedefi (içerik Faz 12'de)
- [x] `packages/db`, `types`, `pos-core`, `ui` iskeletleri + export noktaları
- [x] Vitest workspace kurulumu; her pakette çalışan bir örnek test
- [x] Playwright kurulumu (web + electron projeleri tanımlı, testler sonraki fazlarda)
- [x] GitHub Actions `ci.yml`: install → lint → typecheck → test → build (pnpm + turbo cache)
- [x] `.gitignore` — `node_modules`, `.env*` (`.env.example` hariç), `dist`, `.next`, `.turbo`,
      `*.db`/`*.sqlite`, `coverage`, `release`
- [x] `CLAUDE.md` kök dizinde, plan dosyaları `docs/plan/` altında, `.ai-context/` klasörü açık

### Kullanılacak ajanlar

| Ajan                                  | Ne için                                                            |
| ------------------------------------- | ------------------------------------------------------------------ |
| `Plan`                                | Kurulum sırasını ve paket sınırlarını netleştirmek                 |
| `voltagent-qa-sec:test-automator`     | Vitest workspace + Playwright + CI iş akışını kurmak               |
| `voltagent-qa-sec:architect-reviewer` | Paket sınırları ve bağımlılık yönü doğru mu — kurulum biter bitmez |

**Skill:** `run` (ayağa kaldırma doğrulaması), `update-config` (hook ve izin ayarları)

### Doğrulama

```bash
pnpm install && pnpm lint && pnpm typecheck && pnpm test && pnpm build
docker compose up -d && docker compose ps        # üçü de healthy
curl http://localhost:3001/health                # { "ok": true, ... }
open http://localhost:3000                       # boş ama hatasız sayfa
```

CI PR'da yeşil yanmalı.

---

## Faz 1 — Veri modeli

**Amaç:** Tüm iş alanını karşılayan Prisma şeması, ilk migration ve idempotent seed.
**Süre:** 3–4 gün · **Bağımlılık:** Faz 0

### Yapılacak işler

- [x] **Kimlik & yetki:** `Tenant`, `User`, `Role`, `Permission`, `RolePermission`, `UserRole`, `RefreshToken`, `AuditLog`
- [x] **Katalog & ürün:** `Category`, `Brand`, `Unit`, `Product`, `Barcode`, `ProductPriceHistory`
- [x] **Stok:** `StockMovement` (ledger), `StockCount`, `StockCountItem`
- [x] **Cari & alış:** `Contact`, `ContactTransaction`, `Purchase`, `PurchaseItem`
- [x] **Kasa & satış:** `Register` (kasa), `CashSession`, `CashMovement`, `Sale`, `SaleItem`, `SalePayment`, `SaleReturn`
- [x] **Finans & yasal:** `Expense`, `ExpenseCategory`, `Income`, `EInvoice`, `TenantSettings`
- [x] Her tabloda `tenantId` + `createdAt/updatedAt`; parasal alanlar `Decimal(12,2)`, miktar `Decimal(12,3)`
- [x] Kısıtlar: `(tenantId, barcode)` unique, `(tenantId, receiptNo)` unique, `(tenantId, clientSaleId)` unique
- [x] İndeksler: `(tenantId, createdAt)`, ürün arama için trigram, stok hareketinde `(tenantId, productId, createdAt)`
- [x] İlk migration üretimi (`db push` değil — migration dosyası commit edilir)
- [x] Seed: izin kataloğu, 3 sistem rolü (Patron/Yönetici/Kasiyer), birimler, KDV oranları, varsayılan kategoriler, varsayılan kasa
- [x] `@stokk/db` export'ları: PrismaClient, tipler, enum'lar

### Kullanılacak ajanlar

| Ajan                                   | Ne için                                                                |
| -------------------------------------- | ---------------------------------------------------------------------- |
| `voltagent-data-ai:postgres-pro`       | Şema tasarımı, kısıtlar, indeks stratejisi, Decimal hassasiyeti        |
| `voltagent-data-ai:database-optimizer` | Sık sorgular için indeks planı; ledger tasarımının ölçeklenmesi        |
| `voltagent-qa-sec:architect-reviewer`  | Şemanın iş kurallarını (01-proje.md) gerçekten karşıladığının kontrolü |

### Doğrulama

```bash
pnpm db:validate
pnpm db:reset          # migration + seed sıfırdan temiz geçmeli
pnpm db:seed           # ikinci kez çalıştır — idempotent olmalı, hata vermemeli
pnpm db:studio         # tablolar ve seed verisi görünür
```

---

## Faz 2 — Kimlik, tenant izolasyonu, yetki

**Amaç:** Güvenli giriş ve kırılmaz tenant sınırı. Bundan sonraki her faz bunun üstüne kurulur.
**Süre:** 4–5 gün · **Bağımlılık:** Faz 1

### Yapılacak işler

- [x] Config modülü: Zod ile env doğrulama, tipli erişim
- [x] Global altyapı: `TransformResponseInterceptor`, `HttpExceptionFilter`, `ZodValidationPipe`, `DomainError` sınıfları
- [x] `PrismaService` + **tenant middleware** (tenant'a bağlı modellerde otomatik `tenantId` filtresi)
- [x] `RedisService`: refresh token blacklist, rate limit sayaçları, pub/sub
- [x] Auth: `register` (tenant + ilk Patron), `login`, `refresh` (rotasyonlu), `logout`, `forgot-password`, `reset-password`, `me`
- [~] Opsiyonel 2FA (TOTP) altyapısı — `totpSecret` alanı ve login kontrolü hazır; kayıt/etkinleştirme akışı Faz 11
- [x] Yetki: izin sabitleri `@stokk/types`'ta, `@Permissions()` decorator + `PermissionsGuard`
- [x] `users` ve `roles` modülleri: kullanıcı CRUD, rol atama, özel rol oluşturma
- [x] `audit` modülü: kritik işlemlerde kim/ne/ne zaman kaydı
- [x] Rate limit (auth 5/dk/IP, genel 100/dk), helmet, CORS whitelist
- [x] Swagger `/docs` (yalnız development)

### Kullanılacak ajanlar

| Ajan                                  | Ne için                                                                                             |
| ------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `voltagent-qa-sec:security-auditor`   | Tehdit modeli ve auth akışı denetimi (token ömrü, rotasyon, blacklist)                              |
| `voltagent-qa-sec:penetration-tester` | Tenant sınırını kırmayı denemek: başka tenant id'siyle istek, token manipülasyonu, rate limit aşımı |
| `voltagent-qa-sec:test-automator`     | Auth e2e testleri + "cross-tenant erişim 404" test şablonu                                          |

**Skill:** `security-review` (faz sonunda zorunlu)

### Doğrulama

```bash
# register → login → me zinciri
# başka tenant'ın kaydına erişim → 404 (200 veya 403 değil)
# refresh rotasyonu: eski refresh ikinci kez kullanılamaz
# 6. giriş denemesi → 429
pnpm test --filter @stokk/api
```

---

## Faz 3 — Katalog & ürün

**Amaç:** Ürün kartı, barkod ve toplu veri girişi.
**Süre:** 4–5 gün · **Bağımlılık:** Faz 2

### Yapılacak işler

- [x] Kategori / marka / birim CRUD — kullanımdaki kayıt silinemez (409), soft delete
- [x] Ürün CRUD: ad, kod, kategori, marka, birim, alış/satış fiyatı, KDV oranı, kritik seviye, tartılı ürün bayrağı
- [x] Çoklu barkod: bir ürüne n barkod, tenant içinde unique
- [x] Arama: ad / barkod / ürün kodu — trigram indeks ile, 20.000 üründe hızlı
- [x] Excel import: dosya yükle → kuyruk job → satır bazlı hata raporu → kısmi başarı
- [x] Barkod/etiket görseli üretimi (`bwip-js`), yazdırılabilir PDF sayfa düzeni
- [x] Toplu fiyat güncelleme: seçime göre yüzde/tutar, önizleme + fiyat geçmişi kaydı
- [x] Ürün görseli yükleme (S3/MinIO), MIME ve boyut kontrolü

### Kullanılacak ajanlar

| Ajan                                   | Ne için                                              |
| -------------------------------------- | ---------------------------------------------------- |
| `voltagent-qa-sec:code-reviewer`       | Modül sınırı, servis/repository ayrımı, hata kodları |
| `voltagent-qa-sec:test-automator`      | CRUD + import + barkod çakışması testleri            |
| `voltagent-data-ai:database-optimizer` | Arama sorgusunun plan analizi ve indeks doğrulaması  |

### Doğrulama

```bash
# 5.000 ürünlük seed ile arama yanıtı < 100 ms
# 1.000 satırlık Excel import: 3 hatalı satır raporlanır, 997 ürün oluşur
# aynı barkod ikinci kez → 409
```

---

## Faz 4 — Stok

**Amaç:** Stok hareketi defteri ve sayım akışı.
**Süre:** 3–4 gün · **Bağımlılık:** Faz 3

### Yapılacak işler

- [x] `StockMovement` ledger'ı: satış, iade, alış, sayım farkı, fire, düzeltme tipleri
- [x] Anlık stok: hareketlerden türetilen değer + performans için `Product.stockQuantity` denormalize alanı (transaction içinde güncellenir)
- [x] Kritik seviye listesi + `stock.low` domain event'i
- [x] Sayım: başlat → kalem gir (barkodla hızlı giriş) → tamamla (fark tek düzeltme hareketi) → iptal
- [x] Fire kaydı (sebep zorunlu), manuel düzeltme (yetki + sebep)
- [x] Hareket geçmişi: ürün/tarih/tip filtreli, sayfalı
- [x] Negatif stok politikası: tenant ayarı (uyar / engelle)

### Kullanılacak ajanlar

| Ajan                              | Ne için                                                       |
| --------------------------------- | ------------------------------------------------------------- |
| `voltagent-data-ai:postgres-pro`  | Ledger + denormalize alanın tutarlılığı; kilitleme stratejisi |
| `voltagent-qa-sec:test-automator` | Eşzamanlılık testleri (aynı ürüne paralel satış)              |
| `voltagent-qa-sec:code-reviewer`  | Transaction sınırları                                         |

### Doğrulama

```bash
# aynı ürüne 50 paralel stok düşümü → ledger toplamı ile denormalize alan birebir eşit
# sayım tamamlandığında tek bir düzeltme hareketi oluşur, ara adımlarda stok değişmez
```

---

## Faz 5 — Cari & alış faturası

**Amaç:** Veresiye defteri ve mal girişi.
**Süre:** 4–5 gün · **Bağımlılık:** Faz 4

### Yapılacak işler

- [x] `Contact` CRUD: müşteri / tedarikçi / ikisi, vergi bilgileri, kredi limiti, risk durumu
- [x] Cari hareket defteri: borç / alacak kayıtları, çalışan bakiye
- [x] Tahsilat ve ödeme kaydı (nakit/kart/havale) — kasa hareketine bağlama Faz 6
- [x] Ekstre: tarih aralığı, açılış-kapanış bakiyesi, Excel export (PDF web print'e bırakıldı)
- [x] Borç yaşlandırma (0-30, 31-60, 61-90, 90+)
- [x] Alış faturası: tedarikçi, kalemler, iskonto, KDV → **tek transaction'da** stok girişi + ağırlıklı ortalama maliyet güncellemesi + tedarikçiye borç kaydı
- [x] Alış faturası iptali: tüm etkileri geri alır

### Kullanılacak ajanlar

| Ajan                              | Ne için                                                 |
| --------------------------------- | ------------------------------------------------------- |
| `voltagent-qa-sec:code-reviewer`  | Çok etkili transaction'ın doğruluğu                     |
| `voltagent-qa-sec:debugger`       | Bakiye tutarsızlığı çıkarsa kök neden analizi           |
| `voltagent-qa-sec:test-automator` | Alış → stok → maliyet → cari zincirinin uçtan uca testi |

### Doğrulama

```bash
# alış faturası kaydı sonrası: stok arttı, ağırlıklı ortalama maliyet doğru, cari borç oluştu
# fatura iptali sonrası üçü de eski haline döndü
# ekstre toplamı ile cari bakiye birebir eşit
```

---

## Faz 6 — Kasa, vardiya, satış + `pos-core`

**Amaç:** Sistemin kalbi. Para hesabının tek doğruluk kaynağı ve satış akışı.
**Süre:** 5–7 gün · **Bağımlılık:** Faz 5

### Yapılacak işler

- [x] `@stokk/pos-core`: `calculateSaleTotals`/`calculateSaleBreakdown`, para üstü, tartılı ürün, terazi barkod parse — **saf fonksiyonlar, framework bağımsız**
- [x] `pos-core` birim testleri: kuruş yuvarlama, karışık KDV oranları, %100 indirim, sıfır tutarlı satış, negatif senaryolar (%100 kapsam)
- [x] Kasa (`Register`) tanımı ve vardiya: aç (sayılan nakit), kasa hareketleri, kapat (özet + fark)
- [x] Satış oluşturma: `clientSaleId` ile **idempotent**, stok düşümü, parçalı ödeme doğrulaması, veresiye limit kontrolü, ardışık fiş numarası (boşluksuz)
- [x] Satış iptali (aynı vardiya, kapanmadan) ve iade (kalem bazlı, stok geri, ödeme yöntemine göre)
- [x] Park / geri alma
- [x] Fiş verisi endpoint'i (yazdırma için tam yapı)
- [x] Sync endpoint'leri: `GET /sync/pull?since=`, `POST /sync/sales` (toplu, idempotent)

### Kullanılacak ajanlar

| Ajan                                    | Ne için                                                                                  |
| --------------------------------------- | ---------------------------------------------------------------------------------------- |
| `voltagent-qa-sec:test-automator`       | `pos-core` kapsamını %95+'e taşımak; satış e2e senaryoları                               |
| `voltagent-qa-sec:qa-expert`            | Test senaryosu matrisi: iade, iptal, parçalı ödeme, limit aşımı, offline tekrar gönderim |
| `voltagent-data-ai:postgres-pro`        | Fiş numarası ardışıklığı için sequence / advisory lock tasarımı                          |
| `voltagent-qa-sec:performance-engineer` | Satış oluşturma yolunun 200 ms bütçesinde kalması                                        |
| `voltagent-qa-sec:security-auditor`     | İndirim ve iade yetkilerinin sunucu tarafında gerçekten zorlanması                       |

### Doğrulama

```bash
# 100 eşzamanlı satış → fiş numaraları boşluksuz ve çakışmasız
# aynı clientSaleId 3 kez gönderildi → tek satış, tek stok düşümü
# kredi limiti aşan veresiye → 400 + anlamlı hata kodu
# pos-core coverage %95+
```

---

## Faz 7 — Finans, raporlar, export, yasal adapter'lar

**Amaç:** Karar verdiren sayılar ve yasal entegrasyon iskeleti.
**Süre:** 4–5 gün · **Bağımlılık:** Faz 6

### Yapılacak işler

- [x] Gelir / gider kayıtları + gider kategorileri; kasa ve cari ile ilişki
- [x] Raporlar: dashboard özeti, satış raporu, kâr raporu, en çok satanlar, kasiyer performansı, saatlik yoğunluk, stok değeri, cari yaşlandırma, ödeme yöntemi dağılımı, günlük vardiya özeti
- [x] Yetki filtresi: maliyet ve kâr yalnız yetkili rollerde döner
- [x] Excel (`exceljs`) ve PDF (`pdfkit`) export — BullMQ job'ı, istemci `jobId` ile durumu sorgular
- [x] `EInvoiceProvider` interface'i (`createInvoice`, `getStatus`, `getPdf`, `cancel`) + mock implementasyon
- [x] `OkcProvider` interface'i (`sendSale`, `sendRefund`, `getDailyReport`, `ping`) + mock implementasyon
- [x] `EInvoice` kayıt tablosu ve durum akışı: DRAFT → SENT → ACCEPTED / REJECTED
- [x] Satıştan e-arşiv oluşturma akışı, konfigüre edilebilir tutar eşiği

### Kullanılacak ajanlar

| Ajan                                    | Ne için                                                                  |
| --------------------------------------- | ------------------------------------------------------------------------ |
| `voltagent-data-ai:database-optimizer`  | Rapor sorguları: indeks, agregasyon, gerekiyorsa materialized view       |
| `voltagent-data-ai:data-analyst`        | Rapor metriklerinin tanımı (kâr nasıl hesaplanıyor, hangi kesit anlamlı) |
| `voltagent-qa-sec:performance-engineer` | Büyük veri setinde rapor süresi                                          |
| `voltagent-qa-sec:security-auditor`     | Maliyet/kâr verisinin yetkisiz role sızmaması                            |

**Skill:** `dataviz` — Faz 11'deki grafiklerin ihtiyaç duyacağı veri şeklini burada belirle

### Doğrulama

```bash
# 100.000 satırlık satış seed'i ile her rapor < 1 s
# kasiyer token'ı ile kâr raporu → 403
# export job'ı tamamlanıp indirilebilir dosya üretiyor
# mock e-fatura: DRAFT → SENT → ACCEPTED, PDF dönüyor
```

---

## Faz 8 — Tasarım sistemi + web iskelet + giriş ekranları

**Amaç:** Panelin görsel dili, ortak component katmanı ve kimlik akışı.
**Süre:** 4–5 gün · **Bağımlılık:** Faz 2 (auth) — pratikte Faz 7 sonrası başlanır

### Yapılacak işler

- [ ] Next.js App Router kurulumu, route grupları: `(auth)` ve `(dashboard)`
- [ ] Tailwind 4 + tasarım token'ları: renk, tipografi, spacing, radius; açık/koyu tema
- [ ] shadcn/ui component'lerinin `@stokk/ui`'ye alınması (button, input, select, dialog, table, toast, form) — POS da bunları kullanacak
- [ ] `@stokk/ui` formatlayıcıları: para (`tr-TR`, TRY), tarih (`date-fns` + tr), miktar
- [ ] Layout: sidebar (izne göre filtrelenen menü), topbar (vardiya durumu, tema, kullanıcı), breadcrumb
- [ ] Veri katmanı: TanStack Query + axios interceptor (401 → sessiz refresh → tekrar dene)
- [ ] Auth store (Zustand), route guard, izin bazlı `<Can permission="...">` component'i
- [ ] Form altyapısı: react-hook-form + zod resolver + ortak hata gösterimi
- [ ] Ekranlar: giriş, kayıt (işletme + patron), şifremi unuttum, şifre sıfırlama
- [ ] Dashboard: günün cirosu, kâr, satış adedi, kritik stok, son satışlar, saatlik grafik
- [ ] Boş durum / yükleniyor / hata (error boundary) desenleri

### Kullanılacak ajanlar

| Ajan                                    | Ne için                                                              |
| --------------------------------------- | -------------------------------------------------------------------- |
| `voltagent-qa-sec:ui-ux-tester`         | Giriş → dashboard akışının gerçek tarayıcıda sürülmesi               |
| `voltagent-qa-sec:accessibility-tester` | Klavye gezinme, odak sırası, kontrast — kasa ortamında klavye kritik |
| `voltagent-qa-sec:code-reviewer`        | Component sınırları: neyin `@stokk/ui`'ye, neyin uygulamada kalacağı |

**Skill:** `frontend-design` (tasarım dili kurulurken), `dataviz` (dashboard grafikleri), `run` (ekran doğrulama), `claude-in-chrome` (akış testi)

### Doğrulama

```bash
# giriş → dashboard; token süresi dolunca sessiz refresh, kullanıcı düşmüyor
# yetkisiz menü öğeleri sidebar'da görünmüyor
# koyu/açık tema, klavyeyle tam gezinme
```

---

## Faz 9 — Web: ürün & stok ekranları

**Amaç:** Günlük en çok kullanılan yönetim ekranları.
**Süre:** 4–5 gün · **Bağımlılık:** Faz 3, 4, 8

### Yapılacak işler

- [ ] Ürün listesi: sunucu taraflı sayfalama, arama, kategori/marka/stok durumu filtreleri, sütun görünürlüğü
- [ ] Ürün formu (yeni/düzenle): çoklu barkod, fiyat + KDV, kritik seviye, görsel yükleme, tartılı ürün
- [ ] Toplu import sihirbazı: dosya → sütun eşleme → önizleme → sonuç raporu (hatalı satırlar indirilebilir)
- [ ] Etiket / barkod basımı: seçim → sayfa düzeni → PDF önizleme
- [ ] Toplu fiyat güncelleme: filtre → yüzde/tutar → önizleme → uygula
- [ ] Kategori, marka, birim yönetim ekranları
- [ ] Stok listesi + kritik stok uyarı bandı
- [ ] Sayım ekranı: barkodla hızlı giriş, canlı fark tablosu, tamamla/iptal
- [ ] Fire ve manuel düzeltme ekranları (sebep zorunlu)
- [ ] Stok hareket geçmişi: ürün/tarih/tip filtreli

### Kullanılacak ajanlar

| Ajan                                    | Ne için                                                   |
| --------------------------------------- | --------------------------------------------------------- |
| `voltagent-qa-sec:ui-ux-tester`         | Import sihirbazı ve sayım gibi çok adımlı akışların testi |
| `voltagent-qa-sec:performance-engineer` | Uzun listelerde sanal kaydırma, gereksiz render           |
| `voltagent-qa-sec:accessibility-tester` | Sayım ekranında barkod odağının kaybolmaması              |
| `voltagent-qa-sec:code-reviewer`        | Tekrarlayan tablo/form mantığının ortaklaştırılması       |

**Skill:** `run`, `claude-in-chrome`, `simplify` (tekrar eden liste/form kodu için)

### Doğrulama

```bash
# 5.000 ürünlük listede kaydırma ve filtreleme akıcı
# import: hatalı satır numarası ve sebebi doğru raporlanıyor
# sayım tamamlandığında stok tek seferde düzeliyor
```

---

## Faz 10 — Web: cari, alış, finans ekranları

**Amaç:** Veresiye defteri ve mal girişinin ekran karşılığı.
**Süre:** 3–4 gün · **Bağımlılık:** Faz 5, 8

### Yapılacak işler

- [ ] Cari listesi: bakiye, risk durumu, borçlu/alacaklı filtresi
- [ ] Cari detay: ekstre tablosu, bakiye kartı, tahsilat/ödeme formu, PDF/Excel export
- [ ] Veresiye defteri görünümü: limit aşanlar, yaşlandırma tablosu
- [ ] Alış faturası ekranı: tedarikçi seçimi, kalem girişi (barkodla), iskonto/KDV, stok etkisi önizlemesi
- [ ] Alış faturası listesi + detay + iptal
- [ ] Gelir / gider ekranları, gider kategorileri yönetimi
- [ ] Kasa ve vardiya geçmişi: vardiya detayı, fark raporu

### Kullanılacak ajanlar

| Ajan                              | Ne için                                                      |
| --------------------------------- | ------------------------------------------------------------ |
| `voltagent-qa-sec:ui-ux-tester`   | Alış faturası kalem girişi akışı (en çok veri girilen ekran) |
| `voltagent-qa-sec:test-automator` | Tahsilat → bakiye → ekstre tutarlılığının E2E testi          |
| `voltagent-qa-sec:code-reviewer`  | Para gösterimi ve yuvarlamanın her ekranda aynı olması       |

### Doğrulama

```bash
# tahsilat sonrası bakiye, ekstre ve yaşlandırma birbiriyle tutarlı
# alış faturası kaydında stok etkisi önizlemesi gerçekleşenle birebir aynı
```

---

## Faz 11 — Web: satış, raporlar, e-fatura, kullanıcı, ayarlar

**Amaç:** Yönetim panelinin tamamlanması.
**Süre:** 4–5 gün · **Bağımlılık:** Faz 6, 7, 8

### Yapılacak işler

- [ ] Satış listesi: tarih/kasiyer/ödeme tipi filtreleri, satış detayı, fiş önizleme
- [ ] İade ekranı: fiş ara → kalem seç → iade sebebi → onay
- [ ] Rapor ekranları: grafik + tablo + tarih aralığı + Excel/PDF indirme
- [ ] e-Fatura ekranları: liste, durum takibi, PDF görüntüleme, yeniden gönderme
- [ ] Kullanıcı yönetimi: davet/oluştur, rol atama, aktif/pasif
- [ ] Rol yönetimi: izin matrisi (kategori bazlı gruplanmış onay kutuları)
- [ ] Ayarlar: firma bilgileri, fiş şablonu, KDV oranları, yazıcı varsayılanları, e-fatura kimlik bilgileri (maskeli), SMS, abonelik görünümü
- [ ] Denetim kaydı (audit log) görüntüleyici

### Kullanılacak ajanlar

| Ajan                                    | Ne için                                                                 |
| --------------------------------------- | ----------------------------------------------------------------------- |
| `voltagent-data-ai:data-analyst`        | Rapor ekranlarının okunabilirliği: hangi grafik hangi soruyu cevaplıyor |
| `voltagent-qa-sec:ui-ux-tester`         | İade ve izin matrisi gibi hata maliyeti yüksek akışlar                  |
| `voltagent-qa-sec:security-auditor`     | İzin matrisinin sunucu tarafında da zorlandığının doğrulanması          |
| `voltagent-qa-sec:accessibility-tester` | Grafiklerde renk körlüğü ve kontrast                                    |

**Skill:** `dataviz` (grafikler), `code-review` (faz sonu)

### Doğrulama

```bash
# kasiyer hesabıyla giriş → kâr raporu menüde yok, doğrudan URL ile de 403
# her rapor ekranı Excel ve PDF indiriyor
# ayarlarda kimlik bilgisi maskeli, kaydedince yeniden yazılmadıkça değişmiyor
```

---

## Faz 12 — Electron iskelet, offline depo, senkronizasyon

**Amaç:** Kasa önü uygulamasının çalışan iskeleti ve internetsiz hayatta kalma yeteneği.
**Süre:** 5–7 gün · **Bağımlılık:** Faz 6 (sync endpoint'leri), Faz 8 (`@stokk/ui`)

### Yapılacak işler

- [ ] Electron + Vite + React kurulumu; main / preload / renderer ayrımı
- [ ] Sertleştirme: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, preload'da yalnız beyaz listeli IPC kanalları
- [ ] IPC kanalları: `auth`, `sync`, `printer`, `scale`, `posDevice`, `cashDrawer`, `system` (donanım olanları Faz 14'te doldurulacak stub)
- [ ] better-sqlite3 şeması (WAL): cache tabloları + `local_sales`, `sync_queue`, `sessions`
- [ ] Sync servisi: açılışta full pull, sonra `since` ile delta, 30 sn arka plan döngüsü, kuyruk push, exponential backoff, kalıcı hata kuyruğu
- [ ] Ağ durumu izleme (online/offline + `/health` ping) ve topbar göstergesi
- [ ] Token saklama: `electron.safeStorage`; offline giriş yolu
- [ ] Ekran akışı: splash → sunucu kurulumu (URL) → giriş → kasa seçimi → vardiya açılış
- [ ] Paketleme: `electron-builder` ile Windows MSI + portable; `electron-updater` ile otomatik güncelleme
- [ ] Renderer'ın doğrudan HTTP atmaması: tüm istekler main process üzerinden

### Kullanılacak ajanlar

| Ajan                                  | Ne için                                                                   |
| ------------------------------------- | ------------------------------------------------------------------------- |
| `voltagent-qa-sec:architect-reviewer` | Main / preload / renderer sınırı ve IPC yüzeyinin tasarımı                |
| `voltagent-qa-sec:security-auditor`   | Electron sertleştirme kontrolü, IPC yüzeyinin daraltılması, token saklama |
| `voltagent-qa-sec:debugger`           | Native modül (better-sqlite3) derleme ve rebuild sorunları                |
| `voltagent-qa-sec:test-automator`     | Playwright Electron driver ile açılış ve sync testleri                    |

**Skill:** `run` (uygulamayı ayağa kaldırıp ekran görüntüsüyle doğrulama)

### Doğrulama

```bash
# MSI kurulumu temiz bir Windows'ta çalışıyor
# ilk açılış: sunucu URL → giriş → kasa seç → vardiya aç
# ağ kapalı: cached token ile giriş yapılabiliyor, ürün cache'i okunabiliyor
# kuyrukta bekleyen kayıt, ağ gelince tek seferde ve tek kopya olarak gidiyor
```

---

## Faz 13 — POS satış ekranı

**Amaç:** Kasiyerin bütün gün baktığı ekran. Hız ve klavye burada belirleyici.
**Süre:** 5–7 gün · **Bağımlılık:** Faz 12

### Yapılacak işler

- [ ] Ana layout: barkod girişi, kategori/ürün gridi, sepet, toplam paneli, topbar, park listesi
- [ ] Klavye kısayolları: F1–F10 (ödeme, müşteri, indirim, park, iade, tartı, vardiya kapat), ESC, `+`/`−`
- [ ] Barkod algılama: 150 ms sessizlik = barkod tamamlandı; odak her zaman barkod alanına döner
- [ ] Terazi barkodu ayrıştırma (ağırlık/fiyat gömülü barkod desenleri, tenant ayarından prefix)
- [ ] Sepet state (Zustand) + tüm hesap `@stokk/pos-core` üzerinden — POS'ta ayrı formül yazılmaz
- [ ] Ödeme modalı: parçalı ödeme, hızlı nakit butonları, kart, para üstü, veresiye
- [ ] Yardımcı modallar: müşteri seçimi, indirim (yetki kontrollü), satır notu, park edilmiş satışlar, iade
- [ ] Satış gönderimi: online → API, offline → yerel kuyruk; her iki yolda da fiş verisi üretilir
- [ ] Satış sonrası: fiş önizleme / yazdırma (Faz 14'te gerçek yazıcıya bağlanacak)

### Kullanılacak ajanlar

| Ajan                                    | Ne için                                                                       |
| --------------------------------------- | ----------------------------------------------------------------------------- |
| `voltagent-qa-sec:performance-engineer` | Sepet güncellemesinde 16 ms bütçesi, gereksiz render avı                      |
| `voltagent-qa-sec:ui-ux-tester`         | Kasiyer akışının fareye dokunmadan tamamlanabildiğinin testi                  |
| `voltagent-qa-sec:test-automator`       | Offline satış → sync senaryosunun otomatik testi                              |
| `voltagent-qa-sec:qa-expert`            | Kenar durum matrisi: sıfır tutar, tam indirim, iade sonrası iade, limit aşımı |

**Skill:** `run`, `frontend-design` (satış ekranı yoğunluk/okunabilirlik dengesi)

### Doğrulama

```bash
# 20 kalem + nakit/kart parçalı ödeme, tamamı klavyeyle < 60 sn
# sepet güncelleme ölçümü 16 ms altında
# ağ kablosu çekili: satış tamamlanıyor; ağ gelince sunucuda tek kopya görünüyor
```

---

## Faz 14 — Donanım entegrasyonları

**Amaç:** Fiş, tartı, müşteri ekranı ve ödeme cihazları.
**Süre:** 4–6 gün · **Bağımlılık:** Faz 13 · **Not:** fiziksel test donanımı gerekir

### Yapılacak işler

- [ ] Termal yazıcı (ESC/POS): USB / seri / ağ bağlantısı, CP857 veya WPC1254 ile Türkçe karakter, logo basımı, fiş şablonu, para çekmecesi komutu
- [ ] Yazıcı yoksa davranış: uyarı göster, **satışı asla engelleme**, fişi yeniden yazdırma kuyruğuna al
- [ ] Terazi: seri port okuma, yaygın ASCII protokolleri, F-tuşu ile tartı çekme
- [ ] Müşteri ekranı: ikinci monitörde tam ekran pencere veya seri VFD; main process'ten IPC yayını
- [ ] Banka POS adapter interface'i + mock (gerçek SDK'lar sözleşmeye bağlı)
- [ ] ÖKC adapter interface'i + mock; satış → fiscal no → fiş üzerinde karekod
- [ ] Ayarlar ekranında test butonları: "Test fişi bas", "Tartıyı oku", "POS ping", "Çekmece aç"
- [ ] Donanım hatalarının kullanıcıya anlaşılır Türkçe mesajla dönmesi

### Kullanılacak ajanlar

| Ajan                               | Ne için                                                                               |
| ---------------------------------- | ------------------------------------------------------------------------------------- |
| `voltagent-qa-sec:debugger`        | Seri port, karakter kodlama ve sürücü kaynaklı sorunlar                               |
| `voltagent-qa-sec:qa-expert`       | Donanım test matrisi (bağlı / bağlı değil / kağıt yok / zaman aşımı)                  |
| `voltagent-qa-sec:error-detective` | Saha hatalarının korelasyonu ve anlamlı hata mesajlarına dönüştürülmesi               |
| `voltagent-qa-sec:code-reviewer`   | Adapter interface'lerinin gerçek cihaz eklendiğinde değişmeyecek şekilde tasarlanması |

### Doğrulama

```bash
# gerçek yazıcıdan: ş ç ğ ü ö ı İ Ğ Ş Ç Ü Ö hepsi doğru basılıyor
# yazıcı kablosu çıkarıldı → satış tamamlanıyor, uyarı çıkıyor
# para çekmecesi yalnız nakit satışta açılıyor
# müşteri ekranı sepetle eşzamanlı güncelleniyor
```

---

## Faz 15 — SaaS abonelik + production

**Amaç:** Ticari kullanım ve canlıya çıkış.
**Süre:** 4–6 gün · **Bağımlılık:** Faz 14

### Yapılacak işler

- [ ] Planlar: BASIC / PLUS / PREMIUM — kullanıcı, kasa, ürün limitleri ve özellik bayrakları
- [ ] Plan limiti middleware'i: limit aşımında 402 + yükseltme yönlendirmesi
- [ ] Süresi dolmuş tenant: salt okunur mod + uyarı bandı; satış durur, veri erişimi kalır
- [ ] `PaymentProvider` interface'i + mock; abonelik faturası kaydı ve PDF
- [ ] Güvenlik sertleştirme turu: bağımlılık taraması, secret taraması, başlıklar, oturum politikaları
- [ ] Production Docker: her uygulama için multi-stage image, `docker-compose.prod.yml`, Caddy ile otomatik SSL
- [ ] GitHub Actions: `deploy.yml` (main → image push → sunucuda güncelleme), `electron-release.yml` (tag → Windows installer → Release)
- [ ] Sentry (api + web + pos), uptime kontrolü, structured log
- [ ] Yedekleme: günlük PostgreSQL dump → S3, 30 gün saklama, **geri yükleme provası**
- [ ] KVKK: aydınlatma metni, gizlilik politikası, veri saklama ve silme politikası
- [ ] Dokümantasyon: README (1 saatte ortam kurulumu), kurulum kılavuzu, API dokümanı

### Kullanılacak ajanlar

| Ajan                                                                            | Ne için                                                             |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `voltagent-qa-sec:security-auditor`                                             | Canlıya çıkış öncesi tam denetim                                    |
| `voltagent-qa-sec:penetration-tester`                                           | Dış yüzeyin sınanması (auth, yükleme, rate limit, IDOR)             |
| `voltagent-qa-sec:compliance-auditor` + `voltagent-qa-sec:gdpr-ccpa-compliance` | KVKK / veri koruma gereklilikleri ve metinleri                      |
| `voltagent-qa-sec:chaos-engineer`                                               | Postgres veya Redis düştüğünde sistemin davranışı, kurtarma provası |
| `voltagent-qa-sec:performance-engineer`                                         | Yük testi ve kaynak sınırlarının belirlenmesi                       |

**Skill:** `security-review` (zorunlu), `code-review` (kapsamlı tur)

### Doğrulama

```bash
# staging'de uçtan uca: kayıt → ürün → satış → rapor → e-fatura (mock)
# yedekten geri yükleme provası başarılı
# Sentry'ye bilerek atılan hata düşüyor
# rollback denendi: önceki image'a dönüş çalışıyor
# limit aşımı → 402 ve yükseltme ekranı
```

---

## Faz sonrası

Fazlar bittiğinde ürün canlıda ve pilot müşteriye hazırdır. Sıradaki iş kalemleri
(sıra ve öncelik pilot geri bildirimine göre belirlenir):

- Gerçek e-fatura entegratörü ve ÖKC SDK entegrasyonu (sözleşme sonrası)
- Gerçek ödeme sağlayıcısı (İyzico / PayTR / Stripe)
- Performans: 1M+ satışta materialized view, günlük özet tabloları, arşivleme
- Çoklu dil ve para birimi altyapısı
- Mobil görünüm / patron için mobil uygulama
