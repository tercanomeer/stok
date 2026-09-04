# Faz 14 — Donanım entegrasyonları

**Tarih:** 2026-09-04 · **Durum:** kapandı (gerçek donanım doğrulaması hariç)

> **Bu faz fiziksel donanım ister.** Geliştirme ortamında termal yazıcı, terazi,
> banka POS cihazı ve ÖKC yok. Yazılım katmanının tamamı yazıldı ve sahte
> bağlantılarla test edildi; **gerçek cihazla doğrulama yapılmadı** — plandaki
> doğrulama bloğunun tamamı bu yüzden açık, aşağıdaki "bilinen eksikler" tablosunda.

---

## Ne eklendi

**`apps/pos/electron/hardware/` — donanım katmanı**

- `transport.ts` + `transports/`: cihaz bağlantısının dar yüzeyi (`write`/`read`/`close`)
  ve iki gerçek sürücü — seri/USB (`serialport`) ve ağ (TCP 9100). Protokol kodu
  bağlantı türünü bilmez; yeni bir tür eklenince değişen tek dosya `transports/index.ts`.
- `escpos/encoder.ts`: ESC/POS komut üreticisi. Hazır kütüphane KULLANILMADI — ihtiyaç
  duyulan komut kümesi küçük, ama kod sayfası davranışı Türkçe için kritik ve
  kütüphanelerin çoğu CP857'yi sessizce ASCII'ye düşürüyor.
- `escpos/receipt.ts`: `ReceiptData` → fiş baytları. 58/80 mm sütun genişliği, test fişi,
  çekmece darbesi.
- `escpos/logo.ts`: logo dosyasını 1-bit rastere çevirir. Görüntü çözme Electron'un
  `nativeImage`'i ile — ek görüntü kütüphanesi paketlenmedi.
- `printer-service.ts`: yazdırma + basılamamış fiş kuyruğu. **Yazdırma satışı asla
  engellemez.**
- `scale-protocol.ts` + `scale-service.ts`: Toledo / CAS / genel ASCII kalıpları,
  kararlılık (tartının oturması) bilgisi.
- `pos-device.ts`, `fiscal.ts`: banka POS ve ÖKC sözleşmeleri + sahte sürücüler.
- `customer-display.ts`: ikinci monitörde tam ekran müşteri penceresi.
- `device-error.ts`: donanım hata kodları ve kasiyer diline çeviri.
- `device-config.ts`: makineye ait cihaz ayarları (Zod şeması).

**`apps/pos` — depo ve sözleşme**

- Migration 3: `print_queue` — basılamamış fişler, fişin kendisi saklanarak.
- `db/print-queue-repo.ts`, `db/local-sale-repo.ts:readLocalSale` (fiş yeniden basımı).
- `shared/ipc-contracts.ts`: `printer:*`, `scale:*`, `posDevice:*`, `cashDrawer:*`,
  `fiscal:*`, `devices:*`, `display:update` kanalları ve tipleri.

**`apps/pos` — renderer**

- `screens/device-settings-screen.tsx`: cihaz ayarları + dört test düğmesi.
- `screens/customer-display-screen.tsx`: müşteri ekranı (aynı paket, `#customer` adresi).
- `components/sale/print-queue-dialog.tsx`: basılamamış fişler, yeniden basım.
- Satış ekranı: otomatik fiş basımı, F7 tartı, F12 cihaz ayarları, müşteri ekranı yayını.

**Backend**

`/sync/pull` ayarlarına `receiptWidthMm` ve `autoPrintReceipt` eklendi — fiş POLİTİKASI
tenant'a aittir (tüm kasalarda aynı), hangi porta bağlı olduğu makineye.

---

## Alınan kararlar

**1. Bağlantı komut BAŞINA açılıp kapanır.**
Kalıcı soket/port tutmak iki soruna yol açıyordu: (a) yazıcı yeniden başlatıldığında
ölü bir tutamaçla "yazdım" denir, fişin çıkmadığı ancak kağıda bakınca anlaşılır;
(b) Windows'ta açık bir COM portunu kasa uygulaması bırakmadıkça başka hiçbir program
(yazıcı test aracı, terazi yazılımı) o porta erişemez. Bedeli her komutta birkaç
milisaniyelik açılış; kazancı, her komutun kendi hatasını dürüstçe raporlaması.

**2. ESC/POS kütüphanesi kullanılmadı.**
İhtiyaç duyulan komut kümesi küçük (hizalama, kalın, çift yükseklik, kesme, çekmece,
raster logo) ama kod sayfası davranışı Türkçe için kritik: hazır kütüphanelerin çoğu
CP857'yi ya hiç bilmiyor ya da sessizce ASCII'ye düşürüyor. "ş" yerine "s" basan bir
fiş kabul edilemez. Kod sayfası AYARDAN gelir, tahmin edilmez — CP857 (DOS Türkçe,
ucuz klonlarda) ve CP1254 (Windows Türkçe) arasında seçim ayarlar ekranında.

**3. Yazdırma satışı ASLA engellemez.**
Yazıcı yoksa, kağıt bittiyse, kablo çıktıysa satış tamamlanır. Fiş yeniden yazdırma
kuyruğuna (`print_queue`) düşer ve üst şeritte sayı olarak görünür. Ama yazıcı HİÇ
tanımlı değilse kuyruğa da alınmaz: basılacağı bir cihaz yokken her satış kuyruğa bir
satır daha eklerdi. Kuyruk "yazıcı var ama şu an basamadı" durumu içindir.

**4. Kağıt/kapak durumu SORULUR.**
Kağıt bittiğinde ya da kapak açıkken yazma işlemi başarısız OLMAZ: baytlar porta gider,
"yazdım" sanılır. Tek dürüst yol cihaza sormaktır — fişten önce `DLE EOT 1` ve
`DLE EOT 4` gönderilip yanıt 400 ms beklenir. Yanıt gelmezse (bu komutu desteklemeyen
modeller var) durum BİLİNMİYOR sayılır ve baskı denenir: sormak bir engel değil, ek
güvence.

**5. Fiş verisi ekranla AYNI kaynaktan.**
Yazıcıya giden yapı `ReceiptData` — kasiyerin önizlemede gördüğünün aynısı. Yeniden
basımda fiş katalogdan yeniden hesaplanmaz; satışın yapıldığı andaki girdiler yerel
kayıttan okunup `@stokk/pos-core` ile aynı sonuca çevrilir. Aradan geçen sürede fiyat
değişmiş olabilir, kağıda o gün alınan tutar basılmalı.

**6. Logo makinede durur, `logoUrl` kullanılmaz.**
Tenant ayarındaki `logoUrl` özel bir kovada ve kasa çevrimdışıyken indirilemez. Logo
kasa PC'sine kopyalanır, yolu cihaz ayarında tutulur. Görüntü çözme Electron'un
`nativeImage`'i ile yapılıyor — PNG/JPEG desteği zaten Chromium'da, ek bir görüntü
kütüphanesi paketlenmedi. Logo okunamazsa fiş LOGOSUZ basılır: bozuk bir dosya yüzünden
satış fişinin hiç çıkmaması kabul edilemez.

**7. Terazide negatif ağırlık REDDEDİLİR.**
Sıfıra yuvarlamak, darası alınmamış ya da ters basılmış bir teraziyi "0,000 kg, oturdu"
diye gösterip gerçek arızayı gizlerdi. Kararsız (oturmamış) tartım da satışa girmez —
terazinin üstünde el varken okunan değer müşteriden yanlış para almak demektir.

**8. Müşteri ekranı tam ekran PENCERE, seri VFD değil.**
2×20 karakterlik seri VFD ile aynı donanım parasına çok daha büyük ve okunur bir ekran
alınıyor; kampanya/logo gösterilebiliyor ve ayrı bir sürücü katmanı gerekmiyor. Aynı
renderer paketi `#customer` adresiyle yükleniyor — ayrı bir Vite girişi, aynı bileşenlerin
iki kopyasını paketlemek demekti. Pencere odak ALMAZ: kasiyer yazarken odağın karşı
ekrana kaçması satışı durdururdu.
**İkinci monitör yoksa ekran AÇILMAZ** — kasiyerin ekranını tam ekran kaplamak kasayı
kullanılamaz kılar. Kullanıcı ayarlardan bir ekranı açıkça seçerse bu kural aşılır.

**9. Cihaz ayarı MAKİNEYE, fiş politikası TENANT'a ait.**
Hangi COM portu / hangi IP / hangi kod sayfası aynı işletmenin iki kasasında farklı
olabilir → `config.json`. Fiş genişliği, otomatik basım, fiş başlığı tüm kasalarda aynı
→ `/sync/pull`. Bu ayrım için `receiptWidthMm` ve `autoPrintReceipt` pull payload'ına
eklendi.

**10. Banka POS ve ÖKC yalnız SÖZLEŞME + sahte sürücü.**
Gerçek SDK'lar banka/üretici sözleşmesine bağlı ve elimizde yok. Arayüzler gerçek cihaz
geldiğinde değişmeyecek şekilde kuruldu: tutar string (kuruş dönüşümü adaptörde),
her işlemin bir `referenceId`'si var (bağlantı koparsa "ödeme geçti mi?" ancak bununla
sorulur — `query()` bu yüzden arayüzün parçası), iptal ayrı bir işlem.

**11. `npmRebuild: false`.**
Her iki native bağımlılık da (better-sqlite3, `@serialport/bindings-cpp`) N-API ile
derlenmiş ve paket içinde her platform için `prebuilds/` taşıyor. Açık bırakmak zararsız
DEĞİLDİ: `@electron/rebuild` win32-arm64 için kaynaktan derlemeye kalkıp
"node-gyp does not support cross-compiling" ile paketlemeyi tamamen durduruyordu.

**12. Log DOSYAYA yazılır.**
Paketlenmiş bir Electron uygulamasında `console.error`'ın gideceği bir terminal yoktur:
kasada arıza olduğunda destek "log dosyasını gönderin" diyemezdi. `userData/logs/`
altına, 2 MB'ta dönen, 3 yedek tutan basit bir log eklendi. Ham sürücü metni yalnız
buraya gider; kasiyer ekranına asla.

---

## Doğrulama

Hepsi bu makinede gerçekten çalıştırıldı (2026-09-04):

| Komut                                     | Sonuç                                                                              |
| ----------------------------------------- | ---------------------------------------------------------------------------------- |
| `pnpm build`                              | 8/8 görev başarılı                                                                 |
| `pnpm lint`                               | 12/12 görev başarılı                                                               |
| `pnpm typecheck`                          | 12/12 görev başarılı                                                               |
| `pnpm test`                               | `@stokk/pos` **250** test, `@stokk/api` 118 — hepsi geçti                          |
| `pnpm format:check`                       | temiz                                                                              |
| `pnpm exec playwright test --project=pos` | **15/15 geçti** (5,1 dk)                                                           |
| `electron-builder --win --dir`            | paketlendi; `win32-x64` ve `win32-arm64` seri port binding'leri asar dışına açıldı |

**Plandaki doğrulama bloğu — durum:**

| Madde                                                        | Durum                                                                                                                                                                                                                                                                           |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Gerçek yazıcıdan ş ç ğ ü ö ı İ Ğ Ş Ç Ü Ö basımı              | **YAPILAMADI** — fiziksel yazıcı yok. Yerine: kod sayfası dönüşümü birim testle doğrulandı (encode → decode round-trip, ASCII'ye düşmediği ayrıca kontrol edildi) ve fiş baytları uçtan uca üretilip çözülerek "Çay (dökme)", "Teşekkür ederiz" gibi Türkçe metinler doğrulandı |
| Yazıcı kablosu çıkarıldı → satış tamamlanıyor, uyarı çıkıyor | **DOĞRULANDI** (e2e): var olmayan bir ağ yazıcısı tanımlanıp satış yapıldı; satış tamamlandı, fiş kuyruğa alındı, uyarı göründü                                                                                                                                                 |
| Para çekmecesi yalnız nakit satışta açılıyor                 | **DOĞRULANDI** (birim): nakit satışta `ESC p` darbesi fişin sonuna ekleniyor, nakit olmayan satışta ve ayar kapalıyken eklenmiyor. Gerçek çekmeceyle denenmedi                                                                                                                  |
| Müşteri ekranı sepetle eşzamanlı güncelleniyor               | **DOĞRULANDI** (e2e): ikinci pencere açıldı, sepete eklenen kalem ve satış sonrası para üstü ekranda göründü                                                                                                                                                                    |

---

## Ajan bulguları

**qa-expert** (donanım test matrisi) — 5 önemli boşluk. Dördü DÜZELTİLDİ, biri gerçek
donanım gerektiriyor.

- **Yüksek:** Kağıt yok / kapak açık hiç algılanmıyordu; `DEVICE_NOT_READY` kodu tanımlı
  ama hiçbir kod yolu üretmiyordu. `DLE EOT` durum sorgusu eklendi (karar 4).
- **Yüksek:** Ağ yazıcısında yazma tarafında zaman aşımı yoktu; bağlantıyı kabul edip
  veri almayan bir cihaz `inFlight` zincirini SONSUZA DEK kilitler ve ondan sonraki
  bütün fişleri durdururdu — "yazdırma satışı engellemez" ilkesini fiilen kırardı.
  Hem ağ hem seri tarafa 8 sn yazma sınırı eklendi.
- **Yüksek:** `print_queue` sınırsız büyüyebiliyordu (her satır bir fişin tamamını
  taşıyor). 200 kayıtla sınırlandı, en eskiler düşüyor.
- **Orta-Yüksek:** Negatif tartım sessizce 0'a yuvarlanıyordu (karar 7).
- **Yüksek:** Müşteri ekranı, ikinci monitör yoksa kasiyerin ekranını kaplıyordu —
  dosyanın kendi yorumuyla çelişiyordu (karar 8). Ayrıca `CustomerDisplayService` için
  hiç test yoktu; 10 test eklendi.

**debugger** (seri port / kod sayfası / sürücü) — 5 orta, 3 düşük. Üçü DÜZELTİLDİ,
gerisi gerçek donanım gerektiriyor ya da elendi.

- **Orta:** Okuma tamponu (`chunks`) hiç temizlenmiyordu; durum sorgusu artık aynı
  bağlantıda write→read yaptığı için ikinci bir okuma eski baytları görürdü. İki
  transport'ta da temizleniyor.
- **Orta:** `retryPending` her hatayı "yazıcı erişilemez" sayıp duruyordu; bozuk TEK bir
  kayıt bütün kuyruğu süresiz tıkayabilirdi. Kayıt hatası ile iletişim hatası ayrıldı —
  bozuk kayıt kuyruktan düşürülüyor. (Test yazarken listeleme fonksiyonunun da bozuk bir
  satırda tamamen çöktüğü görüldü; o da düzeltildi.)
- **Orta:** Bağlantı kurulduktan sonraki soket hataları sessizce yutuluyordu; artık
  soket hemen düşürülüp süren işlem zaman aşımını beklemeden hata alıyor.
- **Teyitler:** `drain()` sonrası kapatma sırası doğru; dinleyici sızıntısı yok;
  `inFlight` zinciri gerçekten sıralı; logo genişliği resize sonrası 8'in katı kalıyor;
  `iconv-lite` cp857/win1254 adları doğru ve on iki Türkçe harfin hepsi tek baytlık
  round-trip'ten geçiyor; `npmRebuild: false` doğru ve Windows prebuild'leri pakete
  giriyor.

**error-detective** (hata mesajları) — 3 kritik, 3 orta. Beşi DÜZELTİLDİ.

- **Kritik:** Sahada kalıcı log yoktu (karar 12).
- **Kritik:** `sync-service` ham `error.message`'ı (`ECONNRESET`, "fetch failed")
  kuyruğa yazıp "gönderilemeyen satışlar" ekranında kasiyere gösteriyordu. Artık
  sabit Türkçe cümleye çevriliyor, ham metin yalnız log'a gidiyor.
- **Kritik:** Terazide fallback hata kodu `DEVICE_PROTOCOL`'dü; kablo koptuğunda kasiyer
  "cihaz türünü kontrol edin" diye ayarlara yönlendiriliyordu. `DEVICE_UNREACHABLE`
  yapıldı ("ayrıştırılamayan çıktı" zaten kendi protokol hatasını fırlatıyor).
- **Orta:** Windows'a özgü sürücü metinleri (`File not found`, `Unknown error code 121`,
  `semaphore timeout`) ve `ECONNRESET`/`EPIPE` hiçbir kalıba uymuyordu; eklendi.
- **Orta:** Yazıcı gün boyu bozuksa her satışta birebir aynı uyarı çıkıyordu (200 satış =
  200 toast). Aynı mesaj arka arkaya tekrarlarsa susuluyor; sayı zaten üst şeritteki
  rozette. Kasiyer düğmeye BASTIYSA her zaman cevap alıyor.

**code-reviewer** (adapter arayüzleri) — kritik yok; 2 orta "şimdi", 3 orta "cihaz
gelince". İkisi DÜZELTİLDİ.

- **Orta (şimdi):** `DeviceConfig` (Zod) ile `DeviceSettings` (sözleşme) iki ayrı elle
  yazılmış tipti; TypeScript tek yönde sessiz kalıyordu — şemaya alan eklenip sözleşmeye
  eklenmezse derleme geçiyor ama alan renderer'a HİÇ ulaşmıyordu. Çift yönlü bir derleyici
  kapısı eklendi (kasıtlı bir alan eklenerek gerçekten patladığı doğrulandı).
- **Orta (şimdi):** Sahte sürücüler modül seviyesinde tekildi; iki ayrı bağlam aynı işlem
  geçmişini paylaşırdı. Kurulum kökünün içine alındı.
- **Teyitler:** `Transport` arayüzü gerçek cihazda kırılmaz (akış kontrolü ve yeni
  bağlantı türleri `TransportConfig`'e ekleme olarak girer); `query()`'nin arayüzde
  olması doğru karar.

---

## Bilinen eksikler / sonraki fazlara

| Konu                                                             | Neden / karar                                                                                                                                                                                                 | Ne zaman          |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| **Gerçek donanımla hiçbir doğrulama yapılmadı**                  | Geliştirme ortamında termal yazıcı, terazi, banka POS ve ÖKC yok. Yazılım katmanı sahte bağlantılarla test edildi                                                                                             | Donanım bulununca |
| `ESC t 13` / `ESC t 47` kod sayfası numaraları doğrulanmadı      | Yaygın klon yazıcıların firmware tablosuyla örtüşüyor ama üreticiye göre değişebilir. Yanlışsa Türkçe harfler bozuk basılır — ayarlar ekranındaki test fişi bunu gösterir                                     | Gerçek yazıcıda   |
| Toledo durum baytında "bit 0 = hareket halinde" varsayımı        | Model/klon farkı olabilir; yanlışsa oturmamış tartım kararlı sanılır ve müşteriden yanlış para alınır. Kararlı protokol ayardan seçilebiliyor                                                                 | Gerçek terazide   |
| Logo renk kanalı sırası (BGRA) belgeye dayanıyor                 | Electron `nativeImage.toBitmap()` little-endian sistemlerde BGRA verir; piksel düzeyinde test yok (test `nativeImage` gerektirir)                                                                             | Gerçek yazıcıda   |
| USB yazıcı yalnız COM (seri) üzerinden                           | Windows yazıcı kuyruğuna (spooler) yazan sürücü yok; ESC/POS yazıcıların çoğu USB'yi sanal COM olarak sunuyor. Spooler tamamen farklı bir model — `Transport` (bayt akışı) ona uymaz, ayrı bir servis gerekir | Gerekirse         |
| Seri VFD müşteri ekranı yok                                      | Tam ekran pencere seçildi (karar 8). VFD gerekirse `Transport` üzerinden ikinci bir sürücü eklenir, `CustomerDisplayService`'in yüzeyi değişmez                                                               | Gerekirse         |
| Banka POS ödeme akışa BAĞLI DEĞİL                                | `posDevice.pay()` yalnız ayarlardaki ping testinden çağrılıyor; kart ödemesi hâlâ kasiyerin elle girdiği tutar. Gerçek SDK gelmeden bağlamak sahte bir güven verirdi                                          | Gerçek SDK ile    |
| ÖKC iptal/iade yok, satış akışına da bağlı değil                 | `FiscalAdapter` yalnız `registerSale` taşıyor; mevcut iade akışı (`sale:return`) ÖKC'yi hiç çağırmıyor. Gerçek entegrasyonda hem adaptöre metot eklenmeli hem iade akışına çağrı bağlanmalı                   | Gerçek ÖKC ile    |
| `pay()` ilerleme bildirimi taşımıyor                             | Gerçek SDK'lar olay tabanlı ("kartı okutun", "şifre girin"). Bugünkü tek promise'lık sözleşmeyle bu adımlar kasiyere gösterilemez; IPC'ye push-event kanalı eklenmesi gerekecek                               | Gerçek SDK ile    |
| Cihaz durumu için proaktif rozet yok                             | `printer:status` / `scale:status` kanalları var ama satış ekranı bunları periyodik sormuyor; kasiyer sorunu ancak işlem sırasında öğreniyor. Basılamamış fiş rozeti yazıcı için kısmen bunu karşılıyor        | Sonra             |
| `toDeviceError` hata sınıflandırması metin eşleşmesine dayanıyor | Gerçek SDK'lar kendi hata kodlarını döndürecek; kalıp listesi o zaman genişletilmeli                                                                                                                          | Gerçek SDK ile    |
| `DEVICE_REJECTED` mesajı eylem içermiyor                         | Ret nedeni (yetersiz bakiye, kart hatası) cihazdan gelmeden anlamlı bir cümle yazılamaz                                                                                                                       | Gerçek SDK ile    |

---

## Sonraki faz için uyarılar

**Faz 15 (SaaS abonelik + production)**

- **Log dosyası var artık:** `userData/logs/stokk-pos.log` (2 MB'ta döner, 3 yedek).
  Yeni bir hata yolu eklerken `log('error', 'kapsam', 'mesaj', { bağlam })` kullanın;
  `console.error` kurulu sürümde kimsenin görmediği bir yere yazar.
  **Log'a PII yazılmaz** (CLAUDE.md): parola, kart no, müşteri bilgisi asla.
- **Ham hata metni kasiyer ekranına çıkmaz.** `DeviceError`/`AppError` dışındaki her şey
  `ipc/handler.ts`'te genel bir cümleye indirgeniyor; `sync-service` de artık kuyruğa
  ham `error.message` yazmıyor. Yeni bir hata yolu eklerken bu sınırı koruyun.
- **Cihaz ayarı eklerken İKİ yer:** `hardware/device-config.ts` (Zod şeması) ve
  `shared/ipc-contracts.ts` (`DeviceSettings`). İkisi ayrışırsa
  `DEVICE_CONFIG_MATCHES_CONTRACT` derlenmez — kapı orada.
- **Yeni native bağımlılık eklenirse `npmRebuild` kararı gözden geçirilmeli** (karar 11):
  N-API + prebuild taşımayan bir paket eklenirse paketleme sessizce bozuk çıktı verir.
- **Fiş yapısı `ReceiptData`'dır.** ÖKC karekodu fişe eklenecekse alan oraya eklenmeli;
  `escpos/receipt.ts` ve `receipt-dialog.tsx` aynı kaynaktan besleniyor.
- Satış ekranındaki F12 cihaz ayarlarını açar; F1–F10 kasiyerin gün içi tuşları.
