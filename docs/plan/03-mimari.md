# 03 — Mimari

## Monorepo yapısı

```
stokk/
├── apps/
│   ├── api/            @stokk/api       NestJS backend           :3001
│   ├── web/            @stokk/web       Next.js admin paneli     :3000
│   └── pos/            @stokk/pos       Electron masaüstü POS    :5173 (dev)
├── packages/
│   ├── db/             @stokk/db        Prisma şema + client
│   ├── types/          @stokk/types     Paylaşılan tipler, izin sabitleri, API sözleşmesi
│   ├── pos-core/       @stokk/pos-core  Saf hesaplama: toplam, KDV, indirim, para üstü
│   ├── ui/             @stokk/ui        Paylaşılan React componentleri (web + POS)
│   └── config/         @stokk/config    eslint / tsconfig / tailwind ortak ayarları
├── docs/plan/          Bu plan seti
├── .ai-context/        Faz notları
├── docker-compose.yml  postgres + redis + minio
└── turbo.json
```

**Bağımlılık yönü** — oklar "import edebilir" demek, ters yön yasak:

```
@stokk/config   (leaf — build-time ayarlar)
@stokk/types    (leaf — hiçbir şeye bağlı değil)
      ↑
   @stokk/db          → types
      ↑
   @stokk/api         → db, types, pos-core
@stokk/pos-core       → types          (framework-agnostik, saf fonksiyon)
@stokk/ui             → types          (React componentleri)
   @stokk/web         → types, ui, pos-core
   @stokk/pos         → types, ui, pos-core
```

Kural: `web` ve `pos`, backend'in **iç kodunu** import edemez. Paylaşılan tek şey HTTP sözleşmesidir
(`@stokk/types`) ve saf hesaplama (`@stokk/pos-core`).

`@stokk/ui`'ye ne girer: iki uygulamada da kullanılan primitive'ler (button, input, dialog, table,
para/tarih formatlayıcı). Tek uygulamaya özgü component uygulamanın kendi `components/` klasöründe kalır.

## Backend modül yapısı

```
apps/api/src/
├── main.ts                     bootstrap: helmet, compression, cors, swagger
├── app.module.ts
├── config/                     env şeması (Zod ile doğrulanır) + typed erişim
├── common/
│   ├── decorators/             @Permissions, @Public, @CurrentUser, @TenantId
│   ├── guards/                 JwtAuthGuard, PermissionsGuard, ThrottlerGuard
│   ├── interceptors/           TransformResponseInterceptor  ({ ok, data } zarfı)
│   ├── filters/                HttpExceptionFilter          ({ ok, error } zarfı)
│   ├── pipes/                  ZodValidationPipe
│   └── errors/                 DomainError sınıfları
├── prisma/                     PrismaService + tenant middleware
├── redis/                      RedisService (blacklist, cache, pub/sub)
└── modules/
    └── <modul>/
        ├── dto/                zod şemaları + türetilen tipler
        ├── <modul>.controller.ts
        ├── <modul>.service.ts
        ├── <modul>.module.ts
        ├── <modul>.repository.ts   (opsiyonel — karmaşık sorgular)
        └── <modul>.spec.ts
```

**Modül listesi:** auth, users, roles, tenants, settings, audit, catalog (kategori/marka/birim),
products, stock, contacts, purchases, cash (vardiya), sales, expenses, incomes, reports, einvoice, jobs.

## API sözleşmesi

Her yanıt zarflıdır — istisnasız:

```jsonc
// başarılı
{ "ok": true, "data": { "id": "...", "name": "..." } }

// hatalı
{ "ok": false, "error": { "code": "CREDIT_LIMIT_EXCEEDED", "message": "Kredi limiti aşıldı", "details": { "limit": "5000.00", "current": "5200.00" } } }
```

| Durum           | Kod                                  |
| --------------- | ------------------------------------ |
| 200 / 201 / 204 | Başarılı                             |
| 400             | Validation veya iş kuralı ihlali     |
| 401             | Kimlik doğrulanamadı (yeniden giriş) |
| 402             | Plan limiti aşıldı                   |
| 403             | Yetki yok                            |
| 404             | Bulunamadı                           |
| 409             | Çakışma (aynı barkod, çift kayıt)    |
| 422             | Anlamsal hata (veri tutarsız)        |
| 500             | Sunucu hatası                        |

- **Sayfalama:** `?page=1&limit=20&sort=createdAt:desc&search=` → `{ items, meta: { total, page, limit, pages } }`
- **Tarih:** ISO 8601 UTC (`2026-09-01T15:30:00Z`). Frontend `date-fns` + `tr` locale ile çevirir.
- **Para:** string olarak döner (`"123.45"`). Frontend `Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' })`.
- Hata kodları `@stokk/types` içinde sabit; frontend mesajı koda göre yerelleştirir.

## Kimlik & yetki

- **JWT:** access 15 dk, refresh 30 gün. Refresh rotasyonlu; kullanılan refresh token Redis'te blacklist'e girer.
- **Kayıt:** tek adımda tenant + ilk Patron kullanıcı oluşur, sistem rolleri ve varsayılan ayarlar seed'den kopyalanır.
- **İzinler** `resource.action` biçiminde string sabitler (`sale.create`, `product.manage`, `report.profit.view`).
  Rol = izin kümesi. Endpoint `@Permissions('sale.create')` ile korunur; guard token içindeki izin listesine bakar.
- **POS token'ları** `electron.safeStorage` ile şifreli saklanır. Offline giriş: cached token süresi
  dolmuşsa bile, son başarılı girişin parolası ile yerel doğrulama yapılır (yapılandırılabilir süre sınırıyla).

## Multi-tenancy

Row-level izolasyon: her tabloda `tenantId`.

Üç katmanlı savunma — tek katmana güvenilmez:

1. **Token** — `tenantId` JWT payload'ında; istemciden gelen `tenantId` asla kabul edilmez.
2. **Prisma middleware** — tenant'a bağlı modellerde her `find/update/delete` sorgusuna `tenantId` filtresi otomatik enjekte edilir.
3. **Test** — her modül için "başka tenant'ın kaydına erişim 404 döner" testi zorunlu.

## Offline & senkronizasyon

**Yerel şema (SQLite):** `products`, `barcodes`, `contacts`, `settings` (salt okunur cache) +
`local_sales`, `local_sale_items`, `local_payments`, `sync_queue`, `sessions` (yazılabilir).

**Akış**

```
Satış tamamlandı
   └→ SQLite'a yaz (transaction)          ← kullanıcı için iş burada biter
      └→ sync_queue'ya kayıt (status: pending)
         └→ 30 sn'lik arka plan döngüsü / online olur olmaz
            └→ POST /sync/sales  (clientSaleId ile idempotent)
               ├→ 200 → status: synced, gerçek receiptNo yazılır
               ├→ 409 → zaten işlenmiş, synced sayılır
               └→ hata → retry sayacı + exponential backoff, 5 denemeden sonra manuel kuyruk
```

- **Pull:** açılışta full snapshot, sonra `?since=<timestamp>` ile delta. Ürün/fiyat değişiklikleri Socket.IO ile de push edilir.
- **Idempotency:** `clientSaleId` (UUID, POS üretir) sunucuda unique. Aynı ID ikinci kez gelirse mevcut satış döner, yeni kayıt açılmaz.
- **Renderer doğrudan HTTP atmaz.** Her istek main process üzerinden geçer — token yönetimi ve offline fallback tek yerde.

## Ortak patternler

- **Transaction:** parasal/stok etkili her işlem `prisma.$transaction` içinde. Kuyruk job'ı, webhook, yazdırma gibi yan etkiler transaction **sonrası** tetiklenir.
- **Hata:** domain hataları `DomainError` alt sınıfı → global filter uygun HTTP koduna çevirir. Prisma `P2002` → 409, `P2025` → 404. Bilinmeyen → 500 + Sentry.
- **Event:** `sale.created`, `stock.low`, `einvoice.sent` gibi domain event'leri; süreç içi `EventEmitter2`, örnekler arası Redis pub/sub.
- **Log:** her serviste kendi `Logger` örneği. Production'da JSON structured log; hassas alanlar maskelenir.
- **Ağır işler:** Excel/PDF export, toplu import, rapor ısıtma → BullMQ job. İstemci `jobId` alır, durumu sorgular.

## Güvenlik

- Secret yalnız env'den; `.env` commit edilmez, `.env.example` şablon olarak durur.
- Şifre bcrypt 12 round. Şifre sıfırlama tek kullanımlık, süreli token ile.
- Auth endpoint'lerinde rate limit (5/dk/IP), genel API'de 100/dk.
- Helmet + CORS whitelist. Electron: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, preload'da yalnız beyaz listeli IPC kanalları.
- Audit log: kim, ne zaman, hangi kayıtta ne değiştirdi. Şifre/kart verisi asla yazılmaz.
- Dosya yükleme: MIME + boyut kontrolü, rastgele isim, uygulama dizini dışında saklama.

## Test stratejisi

| Katman           | Araç                         | Kapsam                                                                        |
| ---------------- | ---------------------------- | ----------------------------------------------------------------------------- |
| `pos-core`       | Vitest                       | %100'e yakın birim testi — para hesabının tek doğruluk kaynağı                |
| `api` servisleri | Vitest                       | İş kuralı testleri; kritik modüllerde (auth, sale, stock, cash) edge case'ler |
| `api` uçtan uca  | Vitest + Supertest           | Her modülde happy path + yetki + tenant izolasyonu                            |
| `web`            | Vitest + Testing Library     | Form doğrulama, hesaplama gösterimi, kritik component'ler                     |
| `web` E2E        | Playwright                   | Giriş → ürün ekle → satış listele → rapor aç                                  |
| `pos` E2E        | Playwright (Electron driver) | Giriş → vardiya aç → satış → offline satış → sync                             |

Hedef: backend satır kapsamı %70+, `pos-core` %95+. CI yeşil olmadan merge yok.

## Ortam değişkenleri

```bash
NODE_ENV=development
APP_URL=http://localhost:3000
API_URL=http://localhost:3001

DATABASE_URL=postgresql://stokk:stokk@localhost:5432/stokk?schema=public
REDIS_URL=redis://localhost:6379

JWT_SECRET=            # prod'da 64+ karakter rastgele
JWT_REFRESH_SECRET=

S3_ENDPOINT=http://localhost:9000
S3_ACCESS_KEY=
S3_SECRET=
S3_BUCKET=stokk

SMS_PROVIDER=log       # dev'de log'a düşer
EINVOICE_PROVIDER=mock
PAYMENT_PROVIDER=mock
SENTRY_DSN=
```

Env şeması Zod ile doğrulanır; eksik veya biçimsiz değişkenle uygulama **açılmaz**.
