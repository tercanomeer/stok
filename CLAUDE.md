# CLAUDE.md — Stokk

> Claude Code'un her oturumda okuduğu proje talimatı.
> Detaylı plan `docs/plan/` altında: kapsam, teknoloji gerekçeleri, faz faz yapılacak işler.

## Proje

**Stokk** — Türkiye pazarına yönelik, **bulut tabanlı + offline-first** SaaS POS sistemi.
Hedef: market / bakkal / tekel / nalbur / pet shop; 1–5 kullanıcılı, tek lokasyonlu,
günde 50–500 satış yapan esnaf.

Üç uygulama, tek backend:

| Uygulama                | Kim kullanır       | Nerede çalışır                                |
| ----------------------- | ------------------ | --------------------------------------------- |
| `@stokk/pos` (Electron) | Kasiyer            | Kasa önü Windows PC — donanım + offline satış |
| `@stokk/web` (Next.js)  | İşveren / yönetici | Tarayıcı                                      |
| `@stokk/api` (NestJS)   | —                  | Sunucu                                        |

## Komutlar

```bash
pnpm dev              # tüm app'ler paralel (turbo)
pnpm build
pnpm lint             # eslint
pnpm typecheck        # tsc --noEmit
pnpm test             # vitest
pnpm test:e2e         # playwright
pnpm format           # prettier

pnpm db:migrate       # migration oluştur + uygula
pnpm db:seed          # izinler, roller, birimler, KDV oranları
pnpm db:studio

docker compose up -d  # postgres + redis + minio
```

Tek paket: `pnpm --filter @stokk/api dev`

## Değişmez kurallar

Tartışmaya kapalı. Değişmesi gerekiyorsa önce kullanıcıya sor, sonra `docs/plan/02-teknoloji.md`
içindeki karar kaydına işle.

**TypeScript**

- `strict: true`. `any` yasak — mecbursan `unknown` + type guard.
- Public API'lerde return type explicit. `interface` > `type`.
- Dosya adları: `kebab-case.ts`, React `PascalCase.tsx`, hook `useCamelCase.ts`.
- İmport sırası: external → `@stokk/*` → relative.

**API sözleşmesi**

- Her yanıt zarflı: `{ "ok": true, "data": ... }` / `{ "ok": false, "error": { "code", "message", "details" } }`
- Validation her endpoint'te Zod ile strict parse.
- Sayfalama: `?page=1&limit=20&sort=createdAt:desc&search=` → `{ items, meta: { total, page, limit, pages } }`
- Endpoint isimleri RESTful, kebab-case, çoğul: `/products`, `/sales/:id/items`.

**Veri**

- Multi-tenancy row-level: her tabloda `tenantId`, her query'de filtre. Cross-tenant sızıntı kritik hatadır.
- Parasal ve stok etkili her işlem DB transaction içinde. Side-effect (queue job, webhook) transaction **sonrası**.
- Para: DB'de `Decimal`, API'de string (`"123.45"`). Float ile para hesabı yasak.
- Satış/KDV/indirim hesabı **yalnızca** `@stokk/pos-core` içinde. Backend de POS da aynı fonksiyonu çağırır; ikinci bir implementasyon yazılmaz.
- Tarih: UTC sakla, `Europe/Istanbul` göster.
- Şema değişikliği = migration. Commit edilen her şema migration'lı olur.

**Dil**

- UI metinleri Türkçe. Kod, değişken, yorum, log İngilizce.
- Commit (Conventional Commits, Türkçe açıklama): `feat(sale): parçalı ödeme desteği`.

**Güvenlik**

- Secret sadece env'den, asla kodda.
- Şifre bcrypt (12 round). Audit log'a PII yazma (şifre, kart no, CVV).
- Korumalı her endpoint'te `@Permissions()`. Auth endpoint'lerinde rate limit.
- CORS yalnız whitelist origin.

## Faz akışı

Her faz için sırayla:

1. `docs/plan/04-fazlar.md` → ilgili fazın **Yapılacak işler / Kullanılacak ajanlar / Doğrulama** bloklarını oku.
2. `.ai-context/faz-*.md` → önceki fazların notlarını oku.
3. Kapsamı uygula. Faz dışına taşma, istenmeyen refactor yapma.
4. **Doğrulama komutlarını gerçekten çalıştır**, çıktıyı raporla. Geçmeyen adımı "tamam" sayma.
5. **Fazın ajan tablosundaki ajanları çalıştır** (aşağıdaki "Ajanlar" bölümü) ve bulgularını kapat.
6. `.ai-context/faz-N-notes.md` yaz: ne eklendi, hangi karar alındı, bilinen eksik, sonraki faz için uyarı.
7. Commit: yapılan işi anlat. "Faz N tamamlandı" gibi mesaj **yazma** —
   `feat(product): barkod ile ürün arama` gibi, işin kendisini tarif eden Conventional Commit kullan.

## Ajanlar

`docs/plan/04-fazlar.md` içinde her fazın **Kullanılacak ajanlar** tablosu vardır.
Bu tablo bir öneri listesi değil, o fazın tamamlanma koşuludur — **kullanıcı ayrıca istemese de çalıştırılır.**

- Ajanlar faz sonunda, doğrulama komutları geçtikten sonra çalıştırılır. Birbirine bağlı olmayanlar **tek mesajda paralel** başlatılır.
- Her ajana dar ve doğrulanabilir bir görev verilir: "auth modülüne bak" değil, "refresh rotasyonunda eski token gerçekten geçersizleşiyor mu, kaçak varsa dosya:satır ver".
- Ajan raporu bulgudur, kanıt değildir. Kritik iddia kodda doğrulanır; yanlışsa raporlanır ve geçilir.
- Bulgular ya düzeltilir ya da `.ai-context/faz-N-notes.md` içine gerekçesiyle "bilinen eksik" olarak yazılır. Açık kritik bulgu varken faz kapanmaz.
- Bir fazın ortasında da uzmanlık gerektiren bir sorun çıkarsa (yavaş sorgu, native modül hatası, tenant sızıntısı şüphesi) ilgili ajan **beklemeden** çağrılır.
- Kullanıcı "ajanları atla" derse atlanır; bu durum faz notlarına yazılır.

## Yapma

- Faz atlama; ileriki fazın işini "hazırda dursun" diye yazma.
- Değişmez kararı tek başına değiştirme.
- Workflow (çok ajanlı orkestrasyon) başlatma — kullanıcı açıkça istemedikçe. Faz ajanları buna dahil değil, onlar otomatik çalışır.
- Doğrulamadan "çalışıyor" deme. Test kırmızıysa kırmızı olduğunu söyle.
- İstenmeyen dosya üretme (changelog, ek README, coverage raporu).
