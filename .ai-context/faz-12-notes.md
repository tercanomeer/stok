# Faz 12 — Electron iskelet, offline depo, senkronizasyon

**Tarih:** 2026-09-04 · **Durum:** kapandı

---

## Ne eklendi

**`apps/pos` — main process (`electron/`)**

- `main.ts` — yaşam döngüsü, tek örnek kilidi (`requestSingleInstanceLock`), pencere,
  IPC kaydı, kapanışta depo kapatma.
- `window.ts` — sertleştirme tek yerde: `contextIsolation`/`nodeIntegration`/`sandbox`,
  CSP enjeksiyonu, gezinme + `window.open` + `webview` kısıtları, izin isteklerini reddetme.
- `app-context.ts` — kurulum kökü. Servisler birbirini `new`'lemez; electron'a dokunan
  tek dosya burası olduğu için servisler test edilebilir kalıyor.
- `db/` — `schema.ts` (sürümlü migration), `database.ts` (WAL + `user_version` runner),
  `cache-repo.ts`, `local-sale-repo.ts`, `queue-repo.ts`, `session-repo.ts`.
- `services/` — `api-client.ts` (zarf açma + 401→refresh tek uçuş), `auth-service.ts`
  (çevrimiçi + çevrimdışı giriş), `config-store.ts`, `secure-store.ts` + `electron-cipher.ts`
  (safeStorage), `network-monitor.ts`, `sync-service.ts`, `shift-service.ts`, `updater.ts`.
- `ipc/` — `handler.ts` (gönderen doğrulaması → Zod strict parse → zarflı yanıt) ve
  `register-handlers.ts` (kanalların tamamı + main→renderer olayları).
- `lib/` — `backoff.ts`, `password.ts` (scrypt), `app-error.ts`.
- `shared/ipc-contracts.ts` — main ve renderer'ın paylaştığı TEK sözleşme.

**`apps/pos` — renderer (`src/`)**

Ekran akışı: splash → sunucu kurulumu → giriş → kasa seçimi → vardiya açılış → hazır.
`lib/boot-flow.ts` akışın tek karar noktası (saf fonksiyon, testi bileşen render etmeden
yazılıyor). `components/status-bar.tsx` ağ/sync/güncelleme göstergesi.

**Backend — fazın gerektirdiği tek eksik uç**

`GET /cash-sessions/current?registerId=` — kasiyerde `cash-session.view-all` yetkisi yok,
tüm vardiyaları listeleyemiyor; ama kendi kasasında açık vardiya olup olmadığını bilmek
zorunda. Yoksa her açılışta 409'a çarpar ve devam eden vardiyaya katılamaz.
`@Permissions(CASH_SESSION_OPEN)`, `registerId` Zod ile zorunlu (yoksa tenant genelinde
vardiya sızdırırdı), `withTenant` içinde.

---

## Alınan kararlar

**1. Preload TEK dosya, kendi kendine yeter.**
`sandbox: true` altında preload `require('./shared/ipc-contracts')` yapamaz — Electron
sandbox'ında göreli modül çözümleyici yoktur, pencere boş açılır (`module not found`,
`runPreloadScript`). Sözleşme preload'a `import type` ile girer (tsc bunu siler), çalışma
anında yalnız `electron` import edilir. Bunun bedeli: kanal beyaz listesi artık preload'da
Set olarak DURMUYOR. Boşluk `ipc/handler.ts:assertChannelsRegistered()` ile kapatıldı —
açılışta `INVOKE_CHANNELS` içinde handler'ı olmayan kanal varsa uygulama hata verip durur.

**2. Sertleştirme yalnız `window.ts` içinde.**
CSP `webRequest.onHeadersReceived` ile enjekte edilir; üretimde `connect-src 'none'` —
renderer'ın doğrudan HTTP atması ağ katmanında da imkânsız, yalnız kod incelemesine
bırakılmadı. `will-navigate`, `setWindowOpenHandler`, `will-attach-webview` ve iki izin
handler'ı (asenkron istek + senkron `permissions.query`) kapalıdır. Vite dev sunucusu
adresi `app.isPackaged` kapısının arkasında: kurulu sürümde `VITE_DEV_SERVER_URL` hiç
okunmaz.

**3. Çekiş ve gönderim birbirinden bağımsız.**
`SyncService.run()` iki ayrı `try/catch` kullanır. Katalog çekişi patlarsa (sunucuda yeni
alan, geçici 500, zaman aşımı) kuyruktaki ödenmiş satışlar YİNE gönderilir; para
hareketinin katalog tazeliğine bağlanması kabul edilmedi. `lastError` hangi adımın
düştüğünü söyler ("Katalog çekilemedi: …" / "Satışlar gönderilemedi: …").

**4. Çift kayıt İKİ katmanda engellenir.**
Yerelde `sync_queue` üzerindeki `UNIQUE (entity, entity_id)` aynı satışı kuyruğa iki kez
sokmaz; sunucuda `clientSaleId` benzersizliği aynı satış ikinci kez gelirse `duplicate`
döndürür, yeni kayıt açmaz. `duplicate` istemcide BAŞARILI sayılır. Yanıtta karşılığı
olmayan satır işlenmiş SAYILMAZ, tekrar denenir (at-least-once).

**5. Para ve miktar SQLite'ta TEXT.**
SQLite'ın `REAL`'i çift duyarlıklı kayan noktadır, `Decimal` yoktur. Tutarlar string
saklanır, hesap `@stokk/pos-core:calculateSaleBreakdown` ile yapılır. POS'ta ikinci bir
KDV/indirim formülü yazılmadı.

**6. Token `safeStorage`, çevrimdışı parola scrypt.**
Token blob'ları Windows DPAPI / macOS Keychain ile şifrelenip SQLite'ta durur;
`isEncryptionAvailable()` false dönerse token diske HİÇ yazılmaz. Çevrimdışı giriş için
sunucunun bcrypt hash'i POS'a inmez — POS son başarılı çevrimiçi girişte kendi scrypt
özetini üretir (N = 2^17, r = 8, p = 1). Sunucudan 4xx gelirse çevrimdışına DÜŞÜLMEZ:
parolası değişmiş / askıya alınmış kullanıcı yerel özetle giremesin.

**7. better-sqlite3 yeniden derlenmiyor.**
13.0.3 N-API (`napi=10`) ile derlenir; binding Node ABI'sine değil N-API sürümüne
bağlıdır, aynı prebuild hem Node ABI 137 hem Electron ABI 149 altında çalışır (debugger
ajanı doğruladı). Eklediğim `rebuild:electron` / `rebuild:node` script'leri ve
`@electron/rebuild` devDependency'si bu yüzden KALDIRILDI — yanıltıcı no-op'tular.
`electron-builder`'daki `npmRebuild: true` yerinde bırakıldı: ileride ABI'ye bağlı bir
native modül eklenirse sessizce bozuk paket üretmesin.

**8. Renderer bağımlılıkları devDependencies'te.**
`react`, `react-dom`, `lucide-react`, `@stokk/ui` Vite tarafından `dist/` içine bundle
edilir; `dependencies`'te kalırlarsa electron-builder `node_modules`'ü de pakete koyar.
Taşındıktan sonra asar 9772 → 1302 dosyaya indi. `apps/pos/eslint.config.mjs` içindeki
`import-x/no-extraneous-dependencies` istisnası `src/**` için de açıldı.

**9. electron-builder / `catalog:` çakışması.**
electron-builder `dependencies.electron-updater`'ı semver olarak okuyup sürüm kontrolü
yapıyor; `semver.coerce("catalog:")` null döndüğü için paketleme
`⨯ At least electron-updater 4.0.0 is recommended … Received "catalog:"` ile duruyordu.
Çözüm `electron-builder.yml` içinde `extraMetadata.dependencies.electron-updater: 6.8.9`
— yalnız pakete yazılan `package.json`'ı etkiler, "tüm sürümler catalog'da" kuralı bozulmaz.
Sürüm iki yerde durduğu için catalog'daki `electron-updater` yükseltilirse burası da
güncellenmeli.

**10. Güncelleme feed'i çalışma anında.**
Yayın altyapısı yok; yml'ye sabit feed yazmak, var olmayan bir adrese sürekli istek atan
kurulumlar üretirdi. Adres `STOKK_UPDATE_URL` ile verilir, yoksa güncelleyici sessizce
boşta kalır. İndirme otomatik, KURULUM çıkışta (`autoInstallOnAppQuit`): kasiyeri satışın
ortasında yeniden başlatan güncelleyici kasada kabul edilemez. `electron-updater` doğrudan
çağrılmıyor — `UpdateEngine` arayüzü arkasında (`electron-cipher.ts` ile aynı kalıp).

**11. Backend'e tek uç eklendi.**
`GET /cash-sessions/current?registerId=` — gerekçe yukarıda. `registerId` zorunlu tutuldu,
yoksa uç tenant genelinde açık vardiya sızdırırdı.

---

## Doğrulama

Hepsi bu makinede gerçekten çalıştırıldı (2026-09-04):

| Komut                                     | Sonuç                                                           |
| ----------------------------------------- | --------------------------------------------------------------- |
| `pnpm build`                              | 8/8 görev başarılı                                              |
| `pnpm lint`                               | 12/12 görev başarılı                                            |
| `pnpm typecheck`                          | 12/12 görev başarılı                                            |
| `pnpm test`                               | `@stokk/pos` 96 test, `@stokk/api` 116 test — hepsi geçti       |
| `pnpm format:check`                       | temiz                                                           |
| `pnpm exec playwright test --project=pos` | 4/4 geçti (1.3 dk)                                              |
| `electron-builder --win --dir`            | `release/win-arm64-unpacked` üretildi; asar 1302 dosya / 8.8 MB |

**Playwright (`e2e/pos/bootstrap.spec.ts`) neyi kanıtlıyor:**

1. İlk açılış akışı: sunucu adresi → giriş → kasa seçimi → vardiya açılışı.
2. Preload yüzeyi: `window.stokk` altında TAM 8 ad alanı; `require`, `process`,
   `ipcRenderer`, `Buffer` renderer'a sızmıyor; donanım kanalları `NOT_IMPLEMENTED` dönüyor.
3. **Ağ kapalı** (vekil soketleri düşürüyor): önbellekteki kimlikle giriş yapılıyor ve ürün
   önbelleği okunabiliyor.
4. Ağ geri gelince katalog kendiliğinden tazeleniyor.

**API (`apps/api/test/pos-sync.e2e.spec.ts`, 9 test):** aynı `clientSaleId` iki kez
gönderilirse ikincisi `duplicate`, veritabanında TEK `Sale` satırı, stok bir kez düşüyor
(500 → 498). Ayrıca karışık partide kısmî hata, `/sync/pull` yanıtında maliyet alanı
bulunmaması, `since` ile delta, kasiyer yetkileri ve `registerId` uç durumları.

---

## Ajan bulguları

**architect-reviewer** — 1 kritik, 1 orta, 1 düşük. Üçü de DÜZELTİLDİ.

- **Kritik:** `sync-service.ts` `run()` içinde `pull()` hata verirse `push()` hiç
  çalışmıyordu; ödenmiş satışın gönderimi katalog çekişine bağlanmıştı. İki ayrı
  `try/catch`'e ayrıldı (karar 3), iki test eklendi.
- **Orta:** `updater.ts` `electron-updater`'ı doğrudan import ediyordu; enjekte edilebilir
  dikiş yoktu ve diğer servislerin aksine spec'i yoktu. `UpdateEngine` arayüzü +
  `electron-update-engine.ts` adaptörü ayrıldı, `updater.spec.ts` (6 test) yazıldı.
- **Düşük:** `app-context.ts` içinde `api`, henüz tanımlanmamış `auth`'a kapanış üzerinden
  başvuruyordu (TDZ riski). `authRef` ile döngü görünür kılındı.

**security-auditor** — 2 önemli bulgu + 1 ek, hepsi DÜZELTİLDİ; 2 not "bilinen eksik".

- **Ö1:** `ConfigStore.load()` `serverUrl`'ü yeniden doğrulamıyor, `patch()` hiç
  doğrulamıyordu. Config dosyası kullanıcının yazabildiği bir dizinde durduğu için elle
  `http://saldirgan.example` yazılabilir, `offlineGraceDays` 9999'a çekilerek çevrimdışı
  oturum süresiz uzatılabilirdi. Tek bir `sanitize()` süzgeci eklendi; okuma DA yazma DA
  aynı süzgeçten geçiyor, `MAX_OFFLINE_GRACE_DAYS = 90` kod düzeyinde sınır. 3 test.
- **Ö2:** scrypt maliyeti düşüktü (N = 2^14). N = 2^17'ye çıkarıldı (bu makinede 167 ms,
  ölçüldü). Node'un varsayılan 32 MB `maxmem` sınırı bu N için yetmediğinden açıkça
  yükseltildi. Ek olarak özetin İÇİNDEN okunan parametrelere üst sınır kondu: dosyaya elle
  N = 2^25 yazan biri her girişte gigabaytlarca bellek ayırtabilirdi.
- **Ek:** `VITE_DEV_SERVER_URL` kurulu sürümde de okunuyordu — env değişkenini
  ayarlayabilen biri preload'lu pencereyi kendi sayfasına yönlendirebilirdi. `app.isPackaged`
  kapısı eklendi. Senkron izin kontrolü de açıktı (`setPermissionCheckHandler`), kapatıldı.

**debugger** — native modül sorusu. Bulgu: better-sqlite3 N-API tabanlı (karar 7); rebuild
script'leri no-op'tu, kaldırıldı. Asar incelemesi: pnpm sembolik bağ riski gerçekleşmiyor,
tüm workspace paketleri pakette gerçek dosya olarak var; ama react/lucide-react gereksiz
yere giriyordu (karar 8).

**test-automator** — kapsam boşlukları. Uygulananlar: eşzamanlılık testi gerçek bir asenkron
aralıkta çakışacak şekilde güçlendirildi (önceden iki `runOnce` aynı mikrotask'ta
çağrılıyordu, koruma sınanmış olmuyordu); `updater.spec.ts` eklendi; config-store ve
password için kurcalama testleri eklendi.

> İki ajan (security-auditor, test-automator) ilk denemede HTTP 529 ile düştü, sonnet
> üzerinde yeniden çalıştırıldı.

---

## Bilinen eksikler / sonraki fazlara

| Konu                                                              | Neden / karar                                                                                                                      | Ne zaman            |
| ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| MSI temiz bir Windows'ta denenmedi                                | Geliştirme ortamı macOS; `--win --dir` paketleme çalışıyor ama kurulum, DPAPI ve `perMachine` davranışı gerçek Windows ister       | Windows makinesinde |
| Kuyruk uçtan uca "tek kopya" testi parça parça                    | Satışı ÜRETEN ekran Faz 13'te. Sunucu tarafı (`pos-sync.e2e.spec.ts`) ve istemci tarafı (`sync-service.spec.ts`) ayrı ayrı kanıtlı | Faz 13              |
| `local-sale-repo.ts`'in üretim çağıranı yok                       | Şema ve depo hazır, satış ekranı Faz 13; şu an yalnız testlerden çağrılıyor                                                        | Faz 13              |
| CSP'de `style-src 'unsafe-inline'`                                | Tailwind ve React inline stil yazıyor; kaldırmak nonce altyapısı ister. `script-src 'self'` sıkı, asıl risk kapalı                 | Sonra               |
| `offlineGraceDays` makineye erişen saldırgana karşı korunmuyor    | Artık 90 günle sınırlı ama makinede yönetici olan biri saati de değiştirebilir. Gerçek çözüm sunucu tarafı oturum iptali           | Faz 15              |
| `PRIVATE_HOST` link-local (169.254.x.x) içermiyor                 | O adreslerde şifresiz http reddediliyor; kasa kurulumunda gerçek senaryo değil, gevşetmek yerine bırakıldı                         | —                   |
| Donanım kanalları (`printer`, `scale`, `posDevice`, `cashDrawer`) | Faz 12 kapsamı gereği stub; hepsi `NOT_IMPLEMENTED` dönüyor ve bu davranış testle sabitlendi                                       | Faz 14              |
| Uygulama ikonu yok                                                | `default Electron icon is used` uyarısı; marka varlıkları henüz yok                                                                | Sonra               |
| Kasa (register) tanım ekranı web'de yok                           | Faz 11'den devreden madde; POS `/registers` listesini okuyor ama kasa oluşturma yalnız API'de                                      | Sonra               |

---

## Sonraki faz için uyarılar

**Faz 13 (POS satış ekranı)**

- **Renderer'dan doğrudan HTTP ATMA.** Üretimde CSP `connect-src 'none'`; deneyen kod
  testte değil kurulumda patlar. Her istek `window.stokk.*` üzerinden main'e gider.
- **Yeni IPC kanalı eklerken üç yer birden:** `shared/ipc-contracts.ts` (kanal + tip),
  `ipc/register-handlers.ts` (handler), `preload.ts` (köprü metodu). Handler'ı unutursan
  `assertChannelsRegistered()` açılışta hata verir — sessiz kalmaz.
- **Preload'a göreli `import` YAZMA** (tip importu hariç): sandbox altında pencere boş açılır.
- Satış kaydı `saveLocalSale(db, input, now, clientSaleId)` ile TEK transaction'da yazılır;
  başlık + kalemler + ödemeler + `sync_queue` satırı birlikte. Ayrı ayrı yazma, kuyruğa
  girmemiş satış kaybolur.
- `clientSaleId` satışı üreten taraf tarafından ÜRETİLİR ve değişmez; tekrar gönderimin
  idempotentliği buna dayanır.
- KDV / indirim / para üstü hesabı `@stokk/pos-core`'dan. POS'ta ikinci formül yazılmaz.
- Vardiya bilgisi `window.stokk.shift.current()` üzerinden gelir; ekran kendi başına
  sorgulamasın — `app.tsx` tek sahiptir. İki taraf sorgulayınca DOM yarışı çıkıyor (bu fazda
  Playwright bunu "element was detached" olarak yakaladı).
- Ağ ve senkron göstergesi `components/status-bar.tsx`'te hazır; satış ekranı yeniden yazmasın.
