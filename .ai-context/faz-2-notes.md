# Faz 2 — Kimlik, tenant izolasyonu, yetki

**Tarih:** 2026-09-02 · **Durum:** kapandı — doğrulama geçti, üç güvenlik ajanının bulguları işlendi

---

## Ne eklendi

**Ortak altyapı** (`apps/api/src/common/`)

- `DomainError` sınıf ailesi + `HttpExceptionFilter` → `{ ok: false, error }` zarfı
- `ZodValidationPipe` (strict parse), `TransformResponseInterceptor` (başarı zarfı)
- `@Public()`, `@Permissions()`, `@CurrentUser()` decorator'ları
- `JwtAuthGuard` (global, varsayılan koruma) + `PermissionsGuard` (global)
- `TenantContextInterceptor` — tenant bağlamını handler'ın async zincirine kurar

**Tenant izolasyonu** — RLS + Prisma extension (kullanıcı kararı)

- `prisma/prisma.service.ts`: iki istemci — `app` (RLS'e tabi `stokk_app` rolü) ve
  `system` (sahip rolü, yalnız kimlik doğrulama öncesi dar sorgular). `withTenant()`
  transaction içinde `SET LOCAL app.tenant_id` yapıyor.
- `prisma/tenant-context.ts`: `AsyncLocalStorage` ile istek bağlamı
- `@stokk/db/tenant-scoped.ts`: tenant'a bağlı model listesi + şemayla senkron testi
- Migration `20260902090000_row_level_security`: 33 tabloda politika + `stokk_app` rolü

**Modüller**

- `auth`: register, login (bcrypt 12), refresh (rotasyonlu), logout, forgot/reset-password, me, TOTP doğrulama
- `users`, `roles` (izin matrisi katalog dahil), `audit` (PII redaksiyonu)
- `redis`: token kara listesi, giriş sayacı, tek kullanımlık reset token'ı (GETDEL)
- Rate limit (auth 5/dk/IP, genel 100/dk), helmet, CORS whitelist, Swagger `/docs`

---

## Alınan kararlar

### 1. Tenant izolasyonu: PostgreSQL RLS + Prisma extension (kullanıcıya soruldu)

`03-mimari.md`'nin "Prisma middleware" katmanı Prisma 7'de yok (`$use` kaldırıldı).
`$extends` alternatifi `$queryRaw`'ı **kapsamıyor** ve `02-teknoloji.md` ağır rapor
sorgularının `$queryRaw` ile yazılacağını söylüyor. Bu yüzden filtre veritabanına indirildi:

- Her tenant tablosunda `USING`/`WITH CHECK ("tenantId" = current_setting('app.tenant_id', true))`
  politikası. `$queryRaw` dahil HER sorgu kapsanıyor.
- Uygulama **tablo sahibi olmayan** `stokk_app` rolüyle bağlanıyor (Postgres'te tablo sahibi
  RLS'i baypas eder). Sahip rolü yalnız migration/seed/Studio.
- Ayar verilmezse `current_setting(..., true)` NULL döner → hiçbir satır görünmez (**fail-closed**).
- Prisma `$extends` extension'ı ayrıca model sorgularına `tenantId` enjekte ediyor (erken hata + okunabilirlik).
- `env.ts` refine'ı `APP_DATABASE_URL === DATABASE_URL` olmasını reddediyor — izolasyonun
  sessizce kapatılması engelleniyor.

`stokk_app` rolüne parola koda yazılmadan `db:setup-app-role` script'iyle (env'den) veriliyor;
rol migration'da NOLOGIN açılıyor. `03-mimari.md` ve `02-teknoloji.md` bu karara göre güncellendi.

### 2. Kullanıcı e-postası platform genelinde benzersiz

Giriş ekranında tenant seçici yok; kullanıcı yalnız e-posta + şifre ile giriyor. `(tenantId, email)`
yerine global `@unique`. Aynı kişi iki işletmede aynı e-postayla hesap açamıyor — hedef kitle için
kabul edilebilir. Migration `20260902093000_global_unique_email`.

### 3. Tenant bağlamı guard'da değil interceptor'da kurulur (yol boyunca yakalandı)

`AsyncLocalStorage.enterWith` guard'dan handler'a **taşınmıyor**: Nest `await guard.canActivate()`
dönüşünde çağıranın bağlamına geri dönüyor, handler bağlamı göremiyor. `TenantContextInterceptor`
`next.handle()` aboneliğini `storage.run()` içinde başlatıyor → handler ve altındaki tüm iş
bağlamı devralıyor. Testler bunu yakaladı.

---

## Doğrulama çıktıları

```
pnpm db:reset      ✓ 8 migration + app rolü kurulumu + seed
pnpm lint          12/12 ✓
pnpm typecheck     12/12 ✓
pnpm test          12/12 ✓  (39 test: api 22, types 8, db 1, pos-core 1, ui 1 + ...)
pnpm build          8/8  ✓
pnpm format:check  ✓
```

RLS durumu (canlı DB):

- 33 tabloda `rowsecurity=true` (30 tenant + `tenants` + 2 junction)
- `stokk_app`: `login=true bypassrls=false`

**e2e testleri** (22, gerçek Postgres + Redis) Faz 2 doğrulama bloğunu kapsıyor:

- register → login → me zinciri
- **başka tenant'ın kaydına erişim 404** (403/200 değil), liste ve roller tenant sınırında
- refresh rotasyonunda eski token 401, yeni token çalışıyor, logout sonrası ölü
- 6. giriş denemesi 429
- kasiyer kullanıcı yönetimine 403, Patron 200
- strict parse (fazla alan reddedilir), kısa şifre reddedilir

**Canlı doğrulama:** `/health` public, korumalı endpoint zarflı 401, register 45 izinli Patron,
alg:none saldırısı reddedildi, Swagger açık.

---

## Ajan bulguları

Üç güvenlik ajanı çalıştı: statik analiz (`general-purpose`), derin auth denetimi
(`security-review` alt görevi), ve canlı penetrasyon testi (`penetration-tester`).

### Penetrasyon testi (canlı exploitation) — KRİTİK/YÜKSEK YOK

Aktif saldırılar denendi, hepsi bloklandı: IDOR → 404, forged/alg:none/boş-secret token → 401,
RLS fail-closed (ayar yokken 0 satır), WITH CHECK cross-tenant INSERT'i reddetti, cross-tenant
UPDATE 0 satır, refresh replay → 401, expired token → 401. Tek bulgu: 429 gövdesinde
`INTERNAL_ERROR` kodu (kozmetik) — düzeltildi.

### Statik analiz bulguları — hepsi düzeltildi

| #   | Bulgu                                                                                                                                                                             | Şiddet              | Düzeltme                                                                                                                                                                                                   |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F1  | Pasifleştirilen/silinen kullanıcı refresh rotasyonuyla erişimini süresiz sürdürüyordu (`refresh` ve `loadPrincipal` status kontrol etmiyordu; `deactivate` token iptal etmiyordu) | **KRİTİK**          | `loadPrincipal` artık `status`/`deletedAt`/`tenant.status` kontrol ediyor (login, refresh, me üçünü de kapsar); `deactivate` ve `update(INACTIVE)` `revokeAllSessions` çağırıyor. Regresyon testi eklendi. |
| F2  | TOTP kodu hiç doğrulanmıyordu — yalnız varlığına bakılıyordu (2FA dekoratif)                                                                                                      | **YÜKSEK** (uyuyan) | `otplib` `verifySync` ile gerçek doğrulama. (otplib v13 API'si `authenticator` değil `verifySync`.)                                                                                                        |
| F3  | `user.manage` iznine sahip biri PATRON rolünü atayarak tüm yetkilere yükselebiliyordu; kendi rollerini değiştirebiliyordu                                                         | **ORTA**            | `assertRolesAssignable`: atanan rollerin izinleri çağıranın izinlerinin alt kümesi olmalı; kendi rollerini değiştirmek yasak. Regresyon testi eklendi.                                                     |
| —   | `MAIL_PROVIDER=log` production'da reset token'ını düz metin log'a yazıyordu, engel yoktu                                                                                          | **YÜKSEK**          | `env.ts` refine'ı prod + `log` kombinasyonunu reddediyor.                                                                                                                                                  |
| —   | `user_roles` RLS politikası `roleId`'nin tenant'ını doğrulamıyordu (DB katmanı cross-tenant rol bağlamayı engellemiyordu)                                                         | **ORTA**            | Migration `20260902100000`: politikaya `roleId` tenant kontrolü eklendi.                                                                                                                                   |
| —   | Refresh rotasyonunda TOCTOU yarışı (iki eşzamanlı istek iki geçerli zincir üretebiliyordu) + reuse tespiti yoktu                                                                  | YÜKSEK              | Rotasyon `updateMany({where:{revokedAt:null}}).count` ile atomik; iptal edilmiş token yeniden sunulursa kullanıcının TÜM oturumları düşürülüyor (reuse tespiti) + log.                                     |
| —   | 429 → `INTERNAL_ERROR` + İngilizce kütüphane mesajı; 5xx iç mesajı istemciye sızıyordu                                                                                            | ORTA                | `ErrorCode.RATE_LIMITED` eklendi, filter 429'u eşliyor + Türkçe mesaj; 5xx'te sabit mesaj.                                                                                                                 |
| —   | Dummy bcrypt hash 66 karakter (biçimsiz) — zamanlama savunması çalışmayabilirdi                                                                                                   | Düşük               | Gerçek 60 karakterlik bcrypt hash sabiti.                                                                                                                                                                  |

`system` istemcisinin 15 kullanımı tek tek denetlendi — tenant sınırını delen yok (hepsi kimlik
doğrulama öncesi veya imzalı token'dan gelen id'ye çapalı).

---

## Bilinen eksikler / sonraki fazlara

| Konu                                                    | Neden                                                                                                                                 | Ne zaman                                           |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| **Hesap bazlı kilit yok** (dağıtık credential stuffing) | Giriş sayacı `ip:email` çapalı; botnet farklı IP'lerle atlatır. Hesap kilidi ise mağdur-DoS açar; doğru çözüm captcha/anomali tespiti | Faz 15 (güvenlik sertleştirme)                     |
| **`trust proxy: 1` doğrulanmamış**                      | Proxy yoksa saldırgan `X-Forwarded-For` ile rate limit'i atlatır. Repoda proxy config yok                                             | Faz 15 (Caddy) — API doğrudan internete AÇILMAMALI |
| Throttler bellek içi                                    | Çok örnekli dağıtımda limit N katı; Redis'e bağlanmalı                                                                                | Faz 15                                             |
| Access token 15 dk pencere (reset sonrası)              | Durumsuz JWT; `passwordChangedAt` + `iat` kontrolü yok. Refresh iptali uzun vadeyi kapatıyor                                          | Gerektiğinde                                       |
| register e-posta numaralandırma                         | Global unique email + "kayıtlı" mesajı. Kayıt UX'i bunu gerektiriyor; e-posta doğrulamasıyla nötrlenebilir                            | Faz 15                                             |
| TOTP enrollment akışı                                   | `totpSecret` yazan endpoint yok; login doğrulaması artık hazır                                                                        | Faz 11 (ayarlar)                                   |
| `RefreshToken.ipAddress/userAgent` doldurulmuyor        | Oturum/cihaz listesi için veri toplanmıyor                                                                                            | Faz 11 (ayarlar)                                   |
| `(tenantId, id)` bileşik FK yok                         | Faz 1 notundan devam. RLS + WITH CHECK cross-tenant yazmayı zaten engelliyor; bileşik FK ek savunma                                   | Gerektiğinde                                       |

---

## Sonraki faz için uyarılar

**Faz 3 (katalog & ürün)**

- Yeni tenant'a bağlı model eklenince: (a) `@stokk/db/tenant-scoped.ts` listesine ekle
  (`tenant-scoped.spec.ts` seni zorlar), (b) **RLS politikası otomatik gelmez** — RLS migration'ının
  `DO` döngüsü yalnız o an var olan tabloları gezdi. Yeni tablo için politika migration'ı yaz,
  yoksa yalnız Prisma extension korur (`$queryRaw` açık kalır).
- İş kodu her zaman `prisma.withTenant()` ile yazılır; `prisma.app`'e doğrudan erişme.
  `prisma.system` yalnız kimlik doğrulama öncesi dar sorgular için.
- Yeni endpoint'lerde `@Permissions(...)` zorunlu; izin sabiti önce `@stokk/types/permissions.ts`'e
  eklenir, sonra `db:seed` yeniden çalıştırılır (yeni izin `Permission` tablosuna girsin).
- Ürün/cari aramasında trigram indeksi var ama Türkçe collation yok (Faz 1 notu) — `ORDER BY name`
  için ICU `tr-TR` collation'ı bu fazda verilmeli.
