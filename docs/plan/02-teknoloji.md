# 02 — Teknoloji

Sürümler **1 Eylül 2026** itibarıyla npm'den doğrulanmış stabil sürümlerdir.
Yeni major çıktığında yükseltme ayrı bir iş kalemidir; faz ortasında sürüm atlanmaz.

## Neden uçtan uca TypeScript

Bu projede satış toplamı, KDV matrahı, indirim ve para üstü **iki yerde** hesaplanmak zorunda:
kasadaki POS (internet yokken de doğru sonuç vermeli) ve sunucu (nihai kayıt). İki farklı dilde
iki implementasyon, er ya da geç kuruş farkıyla ayrışır ve bu fark müşterinin kasasında ortaya çıkar.

Tek dil olunca bu mantık `@stokk/pos-core` paketinde **bir kez** yazılır, her iki taraf da onu
import eder. Aynı şey API tipleri için de geçerli: backend'in döndüğü şekil, web ve POS'ta
derleme zamanında kontrol edilir. Küçük ekipte bağlam değiştirme maliyetinin sıfır olması ek kazanç.

## Stack

| Katman           | Seçim                        | Sürüm       | Gerekçe                                                                                     |
| ---------------- | ---------------------------- | ----------- | ------------------------------------------------------------------------------------------- |
| Dil              | TypeScript                   | 6.0         | `strict` mod, uçtan uca tip paylaşımı. 7.0 native port — ekosistem hazır değil, aşağıya bak |
| Runtime          | Node.js LTS                  | 24.x        | LTS hattı; production'da tahmin edilebilir davranış                                         |
| Paket yöneticisi | pnpm                         | 11.x        | Sert link'li store, workspace desteği, hızlı CI                                             |
| Monorepo         | Turborepo                    | 2.10        | Görev grafiği + cache; `pnpm dev` üç app'i paralel kaldırır                                 |
| Backend          | NestJS                       | 12.0        | Modül/DI yapısı, decorator tabanlı yetki, Swagger üretimi                                   |
| Veritabanı       | PostgreSQL                   | 17          | ACID, ilişkisel bütünlük, olgun yedekleme                                                   |
| ORM              | Prisma                       | 7.10        | Migration akışı + tip güvenliği. 8.0 henüz RC, stabilde kalınır — sürüm exact pinlenir      |
| Cache / kuyruk   | Redis + BullMQ               | 7 / 6.3     | Token blacklist, rate limit, ağır rapor ve export job'ları                                  |
| Dosya            | MinIO (dev) / S3 (prod)      | —           | Logo, ürün görseli, PDF fatura                                                              |
| Validation       | Zod                          | 4.5         | Tek şemadan hem runtime kontrol hem TS tipi                                                 |
| Admin web        | Next.js                      | 16.3        | App Router, server component, form/tablo ekosistemi                                         |
| UI               | React + Tailwind + shadcn/ui | 19.2 / 4.3  | Kopyala-sahiplen yaklaşımı; component'ler bizde, sürüm kilidi yok                           |
| İstemci state    | TanStack Query + Zustand     | 5.102 / 5.0 | Sunucu state'i Query'de, UI state'i Zustand'da                                              |
| Masaüstü POS     | Electron                     | 44.1        | Donanım erişimi + tam offline; Node ekosistemi doğrudan kullanılabilir                      |
| POS yerel DB     | better-sqlite3               | 13.0        | Senkron API, WAL mode; satış yazma gecikmesi ihmal edilebilir                               |
| POS build        | Vite / electron-builder      | 8.2 / 26.15 | Hızlı dev döngüsü, Windows MSI + portable + auto-update                                     |
| Realtime         | Socket.IO                    | 4.8         | Dashboard canlı özeti, POS'a stok/fiyat push'u; WebSocket + fallback                        |
| Test             | Vitest + Playwright          | 4.1 / 1.62  | Tek runner üç pakette; Playwright hem web hem Electron'u sürer                              |
| Deploy           | Docker + Caddy + VPS (TR/AB) | —           | Sabit maliyet, veri lokasyonu bizde (KVKK), otomatik SSL                                    |
| CI/CD            | GitHub Actions               | —           | PR'da lint+test+build; main'de deploy; tag'de Windows installer                             |
| İzleme           | Sentry + uptime kontrolü     | —           | Üç uygulamada da hata takibi                                                                |

### Neden TypeScript 7.0 değil de 6.0

`typescript@7.0.2` derleyicinin native (Go) portudur ve klasik JS derleyici API'sini **paketlemiyor**:
`require('typescript')` yalnızca `{ version }` döndürür — `createProgram`, `SyntaxKind`,
`transpileModule` yok, sadece `./unstable/*` alt yolları var. Bu API'ye dayanan araçlar çalışmıyor:

- `typescript-eslint@8.x` peer aralığı `typescript >=4.8.4 <6.1.0` — TS 7 desteklenmiyor, `pnpm lint`
  TypeScript dosyalarını denetleyemez hale gelir.
- `@nestjs/cli@12.0.0` doğrudan `typescript: ~6.0.2`'ye bağımlı; NestJS 12 zaten TS 6 için yapılmış.

TS 7'nin `tsc` CLI'ı ve `emitDecoratorMetadata` çalışıyor — sorun derleyicide değil, ekosistemin
ihtiyaç duyduğu programatik API'de. **Karar:** `typescript@6.0.3` exact pinlenir. TS 7'ye geçiş,
typescript-eslint ve NestJS CLI resmi destek verdiğinde ayrı bir iş kalemi olarak ele alınır.

**Sürüm sabitleme:** Bağımlılıklar `package.json`'da exact yazılır (`^`/`~` yok), `pnpm-lock.yaml`
commit edilir. Özellikle Prisma'da npm `latest` etiketi 8.0 RC'yi gösteriyor — `pnpm add prisma`
denilirse RC kurulur. Prisma ve @prisma/client `7.10.0` olarak sabitlenir.

**Node sürümü:** Node 24 LTS, Ekim 2026'da maintenance hattına düşüyor. Proje takvimi bunun
içinde bitiyor; yine de `.nvmrc` bilinçli olarak `24` yazılır, Node 26'ya geçiş ayrı bir iş kalemidir.

## Elenen alternatifler

Karar bir daha tartışılmasın diye gerekçeleriyle kayıtta:

| Aday                           | Neden seçilmedi                                                                                                                                                                        |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Go / .NET backend**          | POS hesaplama mantığı ikinci bir dilde yeniden yazılırdı. .NET'in ÖKC SDK avantajı var ama bu yalnızca tek fazı kolaylaştırıp tüm projeyi iki dilli yapıyordu                          |
| **Fastify / Hono**             | Daha hızlı ve hafif; ama modül yapısı, DI ve yetki katmanı elle kurulur. 15+ modüllü bir sistemde bu iş zamanla büyüyor                                                                |
| **Drizzle / Kysely**           | SQL'e yakınlık avantajı var; migration ve tooling olgunluğunda Prisma önde. Ağır rapor sorguları zaten `$queryRaw` ile yazılacak                                                       |
| **Tauri 2**                    | ~10 MB installer cazip; ancak termal yazıcı, seri port terazi, ÖKC ve banka POS entegrasyonlarının tamamı Rust'ta yeniden yazılırdı. Projenin en riskli kısmında en az hazır kütüphane |
| **Tarayıcı içi PWA POS**       | Kurulumsuz olması cazip; WebSerial/WebUSB yalnız Chrome'da, ÖKC entegrasyonu pratikte imkânsız, kiosk davranışı zayıf. Elektrik/internet kesintisinde satış garantisi veremiyordu      |
| **Vite SPA / SvelteKit admin** | SPA hızlı ama landing + SEO için ayrı çözüm gerekir. SvelteKit'te POS renderer'ı da Svelte'e geçmeliydi                                                                                |
| **Vercel + managed servisler** | Ops yükü en az seçenek; veri yurt dışına çıkıyor (KVKK) ve maliyet ölçekle öngörülemez artıyor                                                                                         |
| **Kubernetes / AWS**           | Pilot aşaması için aşırı. İleride yatay ölçekleme gerekirse geçiş seçeneği olarak açık                                                                                                 |
| **Jest**                       | Vitest üç pakette de aynı runner'ı ve ESM desteğini veriyor                                                                                                                            |

## Karar kaydı

| Tarih      | Karar                                         | Not                                                                  |
| ---------- | --------------------------------------------- | -------------------------------------------------------------------- |
| 2026-09-01 | Backend: TypeScript + NestJS                  | Uçtan uca tek dil                                                    |
| 2026-09-01 | Veri: PostgreSQL + Prisma                     | Prisma 8 RC'de; 7.10 stabilde kalınır                                |
| 2026-09-01 | Admin: Next.js + Tailwind + shadcn/ui         | İşveren paneli tarayıcıdan                                           |
| 2026-09-01 | POS: Electron + React + Vite + better-sqlite3 | Kasiyer masaüstünde, offline şart                                    |
| 2026-09-01 | Dağıtım modeli: Electron POS + web admin      | İki uygulama, tek backend                                            |
| 2026-09-01 | Deploy: Docker + Caddy + TR/AB VPS            | Veri lokasyonu ve sabit maliyet                                      |
| 2026-09-01 | Ödeme: soyut `PaymentProvider` + mock         | Sağlayıcı (İyzico/PayTR/Stripe) Faz 15'te seçilecek                  |
| 2026-09-01 | e-Fatura & ÖKC: soyut adapter + mock          | Gerçek entegratör sözleşme/NDA gerektiriyor; interface hazır tutulur |
| 2026-09-02 | TypeScript **6.0.3**'e sabitlendi (7.0 değil) | Faz 0 kurulumunda doğrulandı, aşağıdaki gerekçe                      |

**Açık kalan kararlar** — ilgili faza gelindiğinde kullanıcıya sorulacak:

- [ ] Ödeme sağlayıcısı (Faz 15) — İyzico / PayTR / Stripe
- [ ] e-Fatura entegratörü (Faz 14 sonrası) — Uyumsoft / Sovos / Nes Bilgi / Logo
- [ ] ÖKC üreticisi (Faz 14) — Ingenico / Verifone / Inpos; SDK erişimi sözleşmeye bağlı
- [ ] VPS sağlayıcısı ve alan adı (Faz 15)
- [ ] Windows code signing sertifikası — SmartScreen uyarısını kaldırmak için (yıllık maliyetli)

## Ortam gereksinimleri

```
Node.js 24 LTS      # nvm ile .nvmrc üzerinden sabitlenir
pnpm 11             # corepack enable
Docker Desktop      # postgres + redis + minio
Git
```

Portlar: web `3000`, api `3001`, postgres `5432`, redis `6379`, minio `9000` (konsol `9001`),
Prisma Studio `5555`, POS dev sunucusu `5173`.
