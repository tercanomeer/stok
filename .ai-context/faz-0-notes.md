# Faz 0 — Temel & altyapı

**Tarih:** 2026-09-02 · **Durum:** kapandı — tüm doğrulama adımları geçti

---

## Ne eklendi

**Monorepo iskeleti**

- `pnpm-workspace.yaml`: `apps/*` + `packages/*`, tüm sürümler tek `catalog:` bloğunda exact
- `turbo.json`: build / typecheck / lint / test / test:e2e / dev / clean; `@stokk/db#generate` ayrı task
- `tsconfig.base.json` → `@stokk/config/tsconfig/base.json`'a bağlanır (tek doğruluk kaynağı)
- Prettier + `.editorconfig` + `.nvmrc` (24) + husky `pre-commit` → lint-staged
- `docker-compose.yml`: postgres 17 / redis 7 / minio, üçü healthcheck'li + bucket init job'ı
- `.env.example` (48 satır) + `apps/api/src/config/env.ts` Zod şeması
- `.github/workflows/ci.yml`: install → native smoke → format:check → lint → typecheck → test → build

**Paketler**

| Paket             | İçerik                                                                                                                               |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `@stokk/config`   | 7 tsconfig preset'i (base, library, node, nest, react-library, next, electron-main) + 4 eslint flat config (base, node, nest, react) |
| `@stokk/types`    | `ApiSuccess`/`ApiError`/`Paginated` zarfları, `ErrorCode` sabitleri                                                                  |
| `@stokk/pos-core` | Yalnız hesaplama **sözleşmesi** (`SaleCalculationInput`, `SaleTotals`, `VatBreakdownEntry`). Uygulama Faz 6                          |
| `@stokk/db`       | Prisma 7 client + `createPrismaClient()` (pg driver adapter)                                                                         |
| `@stokk/ui`       | İskelet + Tailwind 4 `@theme` giriş noktası. Bileşenler Faz 8                                                                        |
| `@stokk/api`      | NestJS 12 (ESM), `/health`, `TransformResponseInterceptor`, Zod env doğrulaması                                                      |
| `@stokk/web`      | Next 16 App Router, Tailwind 4, boş layout                                                                                           |
| `@stokk/pos`      | Electron main/preload + Vite renderer iskeleti. İçerik Faz 12–13                                                                     |

---

## Alınan kararlar

### 1. TypeScript **6.0.3** — 7.0 değil (kullanıcıya soruldu, onaylandı)

`typescript@7.0.2` native (Go) port; klasik JS derleyici API'sini paketlemiyor
(`require('typescript')` yalnız `{ version }` döndürüyor). `typescript-eslint@8` peer aralığı
`<6.1.0`, `@nestjs/cli@12` doğrudan `typescript: ~6.0.2`'ye bağımlı. Gerekçe ve karar kaydı:
`docs/plan/02-teknoloji.md`.

### 2. `apps/api` **ESM** — NestJS 12 ESM-only

`@nestjs/common` ve `@nestjs/core` `"type": "module"`. CommonJS hedefi TS1479 ile derlenmiyor.
`nest.json` preset'i `NodeNext`; relative import'lar `.js` uzantılı; `__dirname` yerine
`import.meta.dirname`.

### 3. Modül formatı: paylaşılan kütüphaneler **CJS**, `@stokk/ui` **ESM**

`types` / `pos-core` / `db` CommonJS derleniyor — bundler'lar (Next, Vite) CJS'i sorunsuz alıyor,
ESM `apps/api` de default interop ile alıyor. `@stokk/ui`'nin tek tüketicisi bundler olduğu için ESM.

### 4. Prisma 7 kırıcı değişiklikleri

- `datasource` bloğunda **`url` artık yok**. Migration/introspection bağlantısı `prisma.config.ts`
  içinde; runtime bağlantısı `PrismaClient`'a verilen **driver adapter** (`@prisma/adapter-pg`) ile.
- Prisma 7 `.env`'i kendiliğinden yüklemiyor → `prisma.config.ts` dotenv'i elle yüklüyor.
- Generator `prisma-client` (`prisma-client-js` değil), `output` zorunlu → `src/generated/prisma`
  (gitignore'da). Tüketiciler oraya doğrudan bakmaz, `@stokk/db` üzerinden re-export edilir.

### 5. `moduleResolution: "node"` (node10) TS 6'da deprecated

Tüm preset'ler `Node16` / `NodeNext` / `bundler`'a geçirildi.

### 6. Her pakette iki tsconfig

`tsconfig.json` (lint + typecheck, `noEmit`, spec ve config dosyaları dahil) ve
`tsconfig.build.json` (emit, `rootDir`/`outDir`, spec'ler hariç). Sebep: type-aware ESLint her
dosyanın bir tsconfig'de olmasını istiyor, build ise test dosyalarını `dist`'e yazmamalı.
`rootDir`/`outDir` **preset'e yazılamaz** — tsconfig extends'te göreli yollar preset dosyasına
göre çözülüyor.

`apps/pos` üç config taşıyor: `tsconfig.main.json` (Electron/Node, DOM yok),
`tsconfig.renderer.json` (DOM, Node yok) ve yalnız ESLint/editör için birleşik `tsconfig.json`.
Gerçek tip kontrolü ilk ikisiyle **ayrı ayrı** yapılır.

### 7. pnpm 11: `onlyBuiltDependencies` → **`allowBuilds`**

pnpm 11 ayarın adını değiştirmiş ve `pnpm-workspace.yaml`'ı kendisi yeniden yazıyor.
`pnpm approve-builds <pkg>` ile eklenir. Bu bloğun içine elle yorum yazma — pnpm siliyor.
`better-sqlite3` prebuild ile geliyor (`darwin-arm64.node`), derleme gerekmedi.

---

## Doğrulama çıktıları

```
pnpm lint        12/12 ✓
pnpm typecheck   12/12 ✓
pnpm test        12/12 ✓   (types 2, pos-core 1, ui 1, db 1, api 6 = 11 test)
pnpm build        8/8  ✓
pnpm test:e2e    ✓ (test yok, --pass-with-no-tests)
pnpm db:validate ✓
```

`generated/` ve tüm turbo cache'leri silinip taze klon simüle edildi; dört komut da elle
`prisma generate` gerekmeden geçti.

```
docker compose ps
minio      Up (healthy)
postgres   Up (healthy)
redis      Up (healthy)
```

Gerçek bağlantılar: `PostgreSQL 17.11 on aarch64-unknown-linux-musl`, `redis-cli PING -> PONG`,
MinIO `stokk` bucket'ı init job'ıyla oluştu.

Uygulamalar gerçekten ayağa kaldırıldı:

- `GET /health` → `{"ok":true,"data":{"status":"up","service":"@stokk/api","timestamp":"...","uptimeSeconds":18}}`
  — HTTP 200, 1.5 ms. Zarf sözleşmesine uygun.
- Web `/` → HTTP 200, `<title>Stokk</title>`, `lang="tr"`, sunucu logunda hata yok.
- Tailwind 4 zinciri uçtan uca: `@stokk/ui/styles.css` içindeki `@theme` token'ı
  (`--font-sans`) web'in production CSS'inde çıkıyor → `@source` direktifi çalışıyor,
  paylaşılan paket purge edilmiyor.

---

## Ajan bulguları ve ne yapıldı

**`Plan`** — kurulum sırası, 6 tsconfig preset'i, `verbatimModuleSyntax: false` +
`useDefineForClassFields: false` (Nest DI), Vitest 4 `projects`, Tailwind `@source`,
pnpm build-script tuzağı. Hepsi uygulandı.

**`architect-reviewer`** — 3 bulgu, 3'ü de kodda doğrulandı ve **düzeltildi**:

1. `import-x/no-extraneous-dependencies` `includeTypes` olmadan `import type`'ı hiç kontrol
   etmiyordu. Repodaki tek cross-package import'un kendisi tip-only olduğu için emniyet ağı
   tam da en çok kullanılacak yerde delikti. → `includeTypes: true` eklendi.
2. Relative yolla paket sınırı aşılabiliyordu (`../../../packages/ui/src/index` → 0 hata).
   `exports` haritasını ve pnpm izolasyonunu birden bypass ediyordu.
   → `import-x/no-relative-packages` + `no-restricted-imports` desenleri eklendi.
3. `peerDependencies` kısıtlanmamış (düşük). Bugün zararsız — bilinen eksik olarak bırakıldı.

Temiz çıkanlar: bağımlılık grafiği 8/8 uyumlu, `exports` derin import'u kapatıyor,
`paths` alias'ı yok (pnpm izolasyonu delinmiyor).

**`/code-review`** — 5 bulgu; 2 HIGH kodda doğrulandı ve **düzeltildi**:

1. **CI'ın native modül smoke testi her zaman kırılıyordu.** `node -e "require('better-sqlite3')"`
   kökten çalışıyordu ama paket `@stokk/pos`'un bağımlılığı; pnpm izole `node_modules`'ta kökten
   çözülmüyor. CI hiçbir zaman lint/typecheck/test/build adımlarına ulaşamayacaktı.
   → `pnpm --filter @stokk/pos exec node -e ...` oldu.
2. **`@stokk/db#typecheck`/`#lint`/`#test`, `prisma generate`'e bağlı değildi.** `src/generated/`
   gitignore'da; taze klonda bu task'lar generate ile aynı anda çalışabilir hale geliyordu.
   `generated/` silinip denendi: `TS2307: Cannot find module './generated/prisma/client'`.
   Faz 0'ın kabul testini ("taze klonda elle adım gerekmeden zincir geçer") doğrudan kırıyordu.
   → Üç task da `@stokk/db#generate`'e bağlandı; `generated/` ve tüm turbo cache'leri silinerek
   dört komut yeniden çalıştırıldı, hepsi geçti.
3. **CORS doğrulaması sondaki slash'ı kabul ediyordu** (MEDIUM). `z.url()`,
   `http://localhost:3000/` ve `.../api`'yi geçiriyor; tarayıcının `Origin` başlığı bunları asla
   taşımadığı için `enableCors`'un tam string karşılaştırması sessizce her isteği bloklardı —
   "biçimsiz değişkenle uygulama açılmaz" güvencesinin tam tersi.
   → `URL.parse(v).origin === v` refinement'i + iki regresyon testi eklendi.
4. **`--locale=C.UTF-8` "Türkçe sıralama" değil** (MEDIUM). Bayt sırasında `Çay` > `Zeytin`.
   Alpine imajında `tr_TR.UTF-8` locale'i yok ve `POSTGRES_INITDB_ARGS` yalnız ilk `initdb`'de
   geçerli olup volume'a gömülüyor. → Yanıltıcı yorum düzeltildi; Türkçe sıralama Faz 1'de ilgili
   metin sütunlarına **ICU collation (tr-TR)** verilerek çözülecek (aşağıdaki uyarılara eklendi).
5. **Electron dev yolu erişilemez** (LOW). `VITE_DEV_SERVER_URL`'i kimse set etmiyor ve hiçbir
   script Electron'u başlatmıyor; `pnpm dev` yalnız renderer dev sunucusunu açıyor.
   Faz 12'nin kapsamı, bilerek bırakıldı.

**`test-automator`** — 1 gerçek kırık, doğrulandı ve **düzeltildi**:

- `pnpm test:e2e` "No tests found" ile exit 1 veriyordu; `e2e/README.md` "temiz geçer" diyordu.
  Faz 0 doğrulamasını kırıyordu. → `--pass-with-no-tests` eklendi.
- Coverage eşiği ve CI'ın kırık testte kırmızı yanması ampirik olarak doğrulandı (ikisi de exit 1).
- `packages/db` için guard-clause testi önerisi kabul edildi, `client.spec.ts` eklendi.

---

## Bilinen eksikler

| Konu                                      | Neden bırakıldı                                                                                                                                                                                                                                                      | Ne zaman      |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| Hata zarfı (`{ ok: false, error }`)       | `HttpExceptionFilter` Faz 2'nin iş listesinde. Şu an 404 çıplak dönüyor                                                                                                                                                                                              | Faz 2         |
| e2e CI'da çalışmıyor                      | `ci.yml`'de `test:e2e` yok; Faz 0'da hiç e2e testi de yok. Gerçek spec'ler gelince eklenmeli                                                                                                                                                                         | Faz 8         |
| README tek satır                          | Faz 15'in iş listesinde, ama "yeni geliştirici 1 saatte ortam kurar" Faz 0 başarı kriteri                                                                                                                                                                            | Faz 1'e kadar |
| `peerDependencies`'te `@stokk/*` kontrolü | Bugün hiçbir pakette yok, ileride sessiz kalabilir                                                                                                                                                                                                                   | Gerektiğinde  |
| `apps/pos` Electron dev akışı             | `dev` script'i yalnız Vite'ı açıyor, main process hiç çalışmıyor. `VITE_DEV_SERVER_URL` + `dev:electron` wiring'i Faz 12'nin işi                                                                                                                                     | Faz 12        |
| Türkçe sıralama (collation)               | Cluster `C.UTF-8`; alpine'da `tr_TR.UTF-8` yok. Metin sütunlarına ICU `tr-TR` collation'ı migration'da verilecek                                                                                                                                                     | Faz 1         |
| SWC plugin'i gerçekten gerekli mi         | Vite 8 (Rolldown) basit constructor injection'da decorator metadata'yı kendisi üretiyor gibi görünüyor; esbuild üretmiyor. Plugin zararsız ve garanti veriyor. **Kaldırmadan önce `@Inject()` token, optional param ve circular dep senaryolarıyla yeniden doğrula** | Faz 2+        |

---

## Sonraki faz için uyarılar

**Faz 1 (veri modeli)**

- İlk `docker compose pull` denemesi Docker CDN'inden `EOF` alarak düştü; tekrar denemede geçti.
  İmaj indirmesi kırılırsa `docker compose pull` tekrarla, imaj bozuk değil.

- `schema.prisma` içindeki `datasource` bloğuna **`url` yazma** — Prisma 7 reddediyor.
  Migration bağlantısı `packages/db/prisma.config.ts`'teki `datasource.url`'den geliyor.
- Migration çalıştırmadan önce docker compose'un ayakta ve postgres'in healthy olduğunu doğrula.
- Seed idempotent olmalı; `packages/db/prisma/seed.ts` şu an boş iskelet.
- **Türkçe sıralama:** cluster locale'i `C.UTF-8` (bayt sırası). Ürün adı, cari unvanı gibi
  kullanıcıya sıralı gösterilen `text` sütunlarına migration'da ICU `tr-TR` collation'ı ver,
  yoksa `ORDER BY name` Türkçe için yanlış sonuç döner (`Çay` > `Zeytin`).

**Faz 2 (auth & tenant izolasyonu) — kritik**

- **`03-mimari.md`'deki "Prisma middleware" katmanı Prisma 7'de yok.** `$use()` API'si kaldırılmış
  (`@prisma/client@7` içinde yalnız ayrılmış isim denylist'inde geçiyor); yerine `$extends`
  (Client Extensions) var. İki sonucu:
  - `$extends` yeni bir client **döndürür**, mevcut örneği değiştirmez. NestJS'teki yaygın
    `class PrismaService extends PrismaClient` deseni doğrudan çalışmaz; extended client provider
    olarak verilmeli. Bu tasarım kararı Faz 2'nin başında verilmeli.
  - Query extension `$queryRaw`'ı **kapsamaz**. `02-teknoloji.md` ağır rapor sorgularının
    `$queryRaw` ile yazılacağını söylüyor → en çok veri döken sorgular tenant filtresinden muaf
    kalır. Ya tenant parametresi zorunlu bir helper, ya PostgreSQL row-level security düşünülmeli.
    Nested write'ların kapsanıp kapsanmadığı testle kanıtlanmalı.
- `HttpExceptionFilter` + `ZodValidationPipe` + `DomainError` bu fazda geliyor; zarf sözleşmesinin
  hata tarafı o zamana kadar eksik.
- Rate limit Caddy arkasında `trust proxy` ayarı ister, yoksa tüm istekler tek IP görünür.

**Ortam notu**

Bu makinede `~/.Trash/stokk/apps/api` içinden 19 saattir çalışan eski bir süreç **port 3001'i
tutuyor** (PID değişebilir). Doğrulama 3002'de yapıldı. `pnpm dev` çalıştırmadan önce
`lsof -nP -iTCP:3001 -sTCP:LISTEN` ile kontrol et; eski süreci kapat.
