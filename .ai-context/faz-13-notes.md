# Faz 13 — POS satış ekranı

**Tarih:** 2026-09-04 · **Durum:** kapandı

---

## Ne eklendi

**`packages/pos-core` — para hesabının eksik iki parçası**

- `payment.ts`: `settlePayments(payments, grandTotal)` parçalı ödemeyi kapatır (toplam
  denetimi + para üstü + veresiye tutarı), `maxEffectiveDiscountRate(breakdown)` satır ve
  belge indiriminin BİLEŞİK etkin oranını verir.
- İkisi de hem sunucuda hem kasada çağrılıyor. `sale.service.ts` içindeki elle yazılmış
  indirim oranı hesabı bu fonksiyonla değiştirildi — iki tarafın farklı sayı görmesi
  ihtimali ortadan kalktı.

**`apps/pos` — main process**

- `db/catalog-repo.ts`: yerel katalog araması (ad + barkod öneki), tam barkod eşleşmesi,
  tartılı barkodun SABİT ilk 7 hanesiyle eşleştirme. Barkodlar `group_concat` ile tek
  sorguda geliyor.
- `db/parked-repo.ts` + migration 2 (`parked_sales`): park edilen sepet JSON olarak
  yerelde durur; geri alınınca kayıt silinir.
- `services/catalog-service.ts`: barkod çözümü. Önce TAM eşleşme, sonra tartılı desen.
- `services/sale-service.ts`: satışın tek çıkış kapısı — doğrula → pos-core ile hesapla →
  yerele yaz + kuyruğa al (tek transaction) → ağ varsa hemen gönder. Park/geri al/sil ve
  iade (çevrimiçi) de burada.
- `services/contact-service.ts`: veresiye için canlı müşteri araması.
- `shift-service.ts`: açık vardiya artık YERELDE de tutuluyor (`meta` tablosu) — satış
  `cashSessionId` olmadan yazılamaz, çevrimdışıyken sunucuya sorulamaz. Ayrıca
  `close()` eklendi: vardiya kapanışı (F10).
- `ipc/register-handlers.ts`: `catalog:*`, `sale:*`, `contacts:*` kanalları, hepsi strict
  Zod şemalı.

**`apps/pos` — renderer**

- `store/cart-store.ts` (Zustand): sepet, seçim, park geri yükleme, `toDraft()`. Toplamlar
  `cartBreakdown` ile `@stokk/pos-core`'dan; ekranda ikinci formül yok.
- `lib/use-barcode-input.ts`: 150 ms sessizlik ya da Enter → barkod tamamlandı.
- `lib/shortcuts.ts`: F1–F10 haritası tek yerde; hem tuş dinleyicisi hem ipucu şeridi
  aynı listeden besleniyor.
- `screens/sale-screen.tsx` + `components/sale/*`: barkod alanı, sepet, toplam paneli,
  ürün gridi, kısayol şeridi ve yedi modal (ödeme, müşteri, indirim, satır notu, park
  listesi, iade, vardiya kapanışı, fiş).

**Backend — fazın gerektirdiği tek değişiklik**

`/sync/pull` ayar payload'ına dört alan eklendi: `highDiscountThreshold`,
`negativeStockPolicy`, `receiptHeader`, `receiptFooter`. Kasa çevrimdışıyken indirim
kapısını uygulayabilmek ve fiş basabilmek için gerekli. Maliyet alanı hâlâ YOK.

---

## Alınan kararlar

**1. Satışın TEK yolu var: önce yerele yaz, sonra gönder.**
Plan "online → API, offline → yerel kuyruk" diyor; iki ayrı yol yerine tek yol yazıldı.
Doğrudan API'ye gönderip yanıtı beklemek, isteğin uçtuğu ama yanıtın dönmediği anda
(kablo, zaman aşımı) kasiyeri "gitti mi gitmedi mi" bilmediği bir yerde bırakırdı. Satış
her hâlde `saveLocalSale` ile yazılıp kuyruğa alınır; ağ varsa `sync.runOnce()` hemen
çağrılır ve fiş numarası kasiyer daha ekrandayken gelir. Gönderim düşerse satış kuyrukta
kalır — para zaten alınmıştır, hata satışı geri almaz.

**2. Tartılı barkodda gömülü değer AĞIRLIK sayılır.**
`parseScaleBarcode` hem fiyat hem ağırlık yorumunu döndürüyor; hangisi olduğu terazinin
ayarına bağlı ve tenant ayarında bu bilgi YOK (yalnız prefix listesi var). Ağırlık yorumu
seçildi: miktar etiketten, fiyat KATALOGDAN gelir. Fiyat yorumu seçilseydi kasa,
dükkânın belirlemediği bir tutarı fişe yazar ve hesabı `@stokk/pos-core` dışında yapardı.
Fiyat gömen teraziler için mod ayarı Faz 14'e (donanım) bırakıldı.
Tam barkod eşleşmesi HER ZAMAN önce denenir: `27` ile başlayan sıradan bir EAN'i tartılı
sanıp miktarı barkoddan uydurmak, yanlış miktarla satış demekti.

**3. Aynı ürün ikinci kez okutulunca yeni satır AÇILMAZ.**
12 şişe su okutan kasiyer sepette 12 satır değil "12 adet su" görmeli. İndirimli ya da
notlu satır ayrı tutulur (onlar bilinçli olarak farklıdır). Tartılı barkod da ayrı satır
açar: 0,750 + 0,400 tek satırda toplanırsa hangi etiketin okunduğu görünmez olur.

**4. Park YERELDİR, sunucuya gitmez.**
Sunucuda `POST /sales/park` var ama ağ ister; internet kesikken park edememek kasada
kabul edilemez. `parked_sales` (migration 2) sepetin tamamını JSON olarak tutar; geri
alınınca kayıt SİLİNİR — aynı sepetin iki kez satılması park mekanizmasının en pahalı
hatası olurdu.

**5. İade ve müşteri araması ÇEVRİMİÇİ.**
İade stok ve cari hareketi üretir, iade fişi numaralanır — kasa bunu tek başına doğru
yapamaz. Cari listesi de önbelleklenmiyor: bakiye ve kredi limiti canlı veridir, eski bir
kopyaya bakıp limit aşımına izin vermek gerçek bir zarardır. İkisi de çevrimdışıyken
ekranda gerekçesiyle kapalı. Cari önbelleği ayrı bir senkronizasyon kararı, Faz 15'e kaldı.

**6. İndirim kapısı ÜÇ katmanda.**
Ekran (kasiyeri müşterinin önünde reddedilmekten kurtarır) → main process (çevrimdışı
satışta TEK kontrol budur) → sunucu (son söz). Üçü de aynı sayıyı görsün diye etkin
indirim oranı `@stokk/pos-core:maxEffectiveDiscountRate`'e taşındı; sunucudaki elle
yazılmış hesap bu fonksiyonla değiştirildi. Satır + belge indirimi çarpımsaldır
(%10 + %10 = %19), oran bu yüzden girilen değerlerden değil gerçekleşen indirimden ölçülür.

**7. Ödeme hesabı da pos-core'a taşındı.**
`settlePayments` toplamı, para üstünü ve veresiye tutarını tek yerde hesaplar. Ekran
anında geri bildirim için, main process onay anında aynı fonksiyonu çağırır. Para üstü
YALNIZ nakit parçadan çıkar: kart ve veresiye düşüldükten sonra kalan nakit borcu,
müşterinin verdiği nakitle karşılaştırılır. Fişe yazılan tutar kalanı ASLA aşmaz;
fazlalık `receivedAmount` olarak ayrı taşınır.

**8. Vardiya kapanışı (F10) sunucuda hesaplanır.**
Beklenen nakit kasa hareketlerinden çıkar, fark eşiği tenant ayarındadır, kapanış denetim
kaydı üretir. Kasada hesaplamak, gönderilmemiş satışlar yüzünden yanlış olurdu. Kuyrukta
bekleyen satış varken kapanış ENGELLENİR — yoksa kasiyer haksız yere "fark var" uyarısı
alırdı. Açık vardiya artık yerelde de tutuluyor (`meta`): satış `cashSessionId` olmadan
yazılamaz ve çevrimdışıyken sunucuya sorulamaz.

**9. Odak her zaman barkod alanına döner.**
Her modal kapanışında, her satış sonunda, ürün gridine tıklandıktan sonra. Kasiyer
okuyucuyu çektiğinde ürünün sepete girmemesi, bu ekranın yapabileceği en kötü hatadır.
Modal açıkken F1–F10 tamamen susar (`sale-screen.tsx`), bu yüzden ödeme modalı aynı
tuşları yöntem seçimi için yeniden kullanabiliyor.

**10. `autoFocus` yerine ref + effect.**
Yerel `<dialog>`, `showModal()` çağrıldığında odağı kendi ilk odaklanabilir öğesine
(kapatma düğmesi) taşıyıp React'in `autoFocus`'unu eziyor. Fiş, indirim, satır notu ve
vardiya kapanışı modallarında odak bu yüzden effect ile kuruluyor — `Dialog`'un kendi
effect'i çocuk olduğu için ÖNCE koşar, bizimki sonra.

---

## Doğrulama

Hepsi bu makinede gerçekten çalıştırıldı (2026-09-04):

| Komut                                     | Sonuç                                                                  |
| ----------------------------------------- | ---------------------------------------------------------------------- |
| `pnpm build`                              | 8/8 görev başarılı                                                     |
| `pnpm lint`                               | 12/12 görev başarılı                                                   |
| `pnpm typecheck`                          | 12/12 görev başarılı                                                   |
| `pnpm test`                               | `@stokk/pos` 169, `@stokk/api` 118, `@stokk/pos-core` 70 — hepsi geçti |
| `pnpm format:check`                       | temiz                                                                  |
| `pnpm exec playwright test --project=pos` | **12/12 geçti** (4,3 dk)                                               |

**Plandaki doğrulama bloğu, madde madde:**

1. **20 kalem + parçalı ödeme, tamamı klavyeyle, < 60 sn** — `sale.spec.ts` "20 kalem +
   parçalı ödeme tamamen klavyeyle". Testte TEK bir `click()` yok: barkod okutma, F1
   ödeme, F2 kart, F1 nakit, Enter ile tamamlama, Enter ile yeni satış. Geçen süre
   ölçülüyor ve 60 sn ile karşılaştırılıyor.
2. **Sepet güncellemesi < 16 ms** — `sale.spec.ts` "sepet güncellemesi 16 ms bütçesinin
   altında kalır". 30 AYRI ürünle gerçek çok satırlı sepet kuruluyor, `+` tuşundan
   render + layout'a kadar geçen süre tarayıcının içinde ölçülüyor:
   **en kötü 0,20 ms, ortalama 0,04 ms**.
3. **Ağ kablosu çekili: satış tamamlanıyor; ağ gelince sunucuda tek kopya** — iki ayrı
   test. Biri tam kesinti, diğeri (daha zoru) yanıt kaybı: istek sunucuya ULAŞIYOR, yanıt
   düşüyor, kasa aynı satışı ikinci kez gönderiyor ve sunucuda ikinci kayıt AÇILMIYOR.

---

## Ajan bulguları

**performance-engineer** — 1 kritik, 1 orta, 2 düşük. Üçü DÜZELTİLDİ, biri bilgi notu.

- **Kritik (testin kendisi):** 16 ms testi aynı barkodu 30 kez okutuyordu; sepet aynı
  ürünü birleştirdiği için ölçülen şey "30 satır" değil "1 satır × 30 adet"ti. 30 ayrı
  barkodlu ürün eklendi, ölçüm gerçek çok satırlı sepette yapılıyor.
- **Orta:** Genel `keydown` dinleyicisi `barcodeValue` state'ine bağlıydı; kasiyer barkod
  yazarken her tuşta sökülüp yeniden kuruluyordu. Değer artık alandan (ref) okunuyor.
- **Düşük:** `CartList` ve `TotalsPanel` de `memo`'landı.
- **Teyitler:** `CartRow`/`ProductGrid`/`ShortcutBar` memo'ları gerçekten bail ediyor
  (zustand eylem referansları sabit, `setQuantity` dokunulmayan satırları aynı referansla
  döndürüyor); selector'lar atomik, gereksiz render tetiklemiyor; `useMemo` bağımlılıkları
  doğru; barkod 150 ms + arama 120 ms debounce'ları birbirini beslemiyor.

**qa-expert** — kenar durum matrisi, 5 önemli boşluk. Dördü DÜZELTİLDİ, biri bilinen eksik.

- **Kritik:** `trackStock=false` ürün içeren satışın TAMAMI düşüyordu. `finalize()` her
  kalem için koşulsuz `stock.applyMovement` çağırıyor, o da takipsiz üründe
  `STOCK_NOT_TRACKED` fırlatıyordu (Faz 6'dan gelen, hiçbir testin yakalamadığı hata —
  tüm test ürünleri `trackStock:true`). Satış, iptal ve iade akışları artık takipsiz
  kalemleri stok hareketinden atlıyor; `pos-sync.e2e.spec.ts`'e test eklendi.
- **Kritik:** Sunucunun reddettiği satışlar (stok/kredi limiti) beş denemeden sonra
  sessizce `FAILED` kuyruğuna düşüyor, hiçbir ekranda görünmüyordu — parası alınmış
  satışlar kayboluyordu. Üst şeritteki rozet artık tıklanabilir:
  `FailedSalesDialog` listeyi, sebebi ve deneme sayısını gösterip kuyruğa geri koyuyor.
- **Kritik:** `negativeStockPolicy` çekiliyor ama hiç kullanılmıyordu. `BLOCK`
  politikasında satış artık kasada da reddediliyor (5 test). Önbellekteki stok bir tur
  eski olabilir, o yüzden kesin doğruluk değil ERKEN UYARI: sunucu son sözü söylüyor.
- **Orta:** Tartı etiketi 0 gram okuduğunda sepete miktarsız satır giriyor ve toplam
  sessizce sıfırlanıyordu. `addProduct` pozitif olmayan miktarı artık hiç kabul etmiyor.
- **Bilinen eksik:** 0 tutarlı satış (bkz. aşağıdaki tablo).

**test-automator** — 9 bulgu. Beşi DÜZELTİLDİ, gerisi izleme notu.

- **Yüksek:** "Tamamen klavyeyle" testi fareyle tıklıyordu — ve haklı olarak, çünkü kart
  ödemesi için klavye yolu YOKTU. Ödeme modalına F1–F4 yöntem kısayolları eklendi, son
  ödeme kalanı kapattığında odak "Satışı tamamla"ya taşınıyor, test artık tek `click()`
  içermiyor.
- **Orta-Yüksek:** "TEK KOPYA" testi asıl riski (yanıt kaybı → yeniden gönderim)
  kanıtlamıyordu; `GateProxy`'ye `swallowResponses()` modu eklendi ve senaryo uçtan uca
  test edildi.
- **Orta-Yüksek:** F3 indirim, F8 not, tartılı barkod ve fiş içeriği için e2e testleri
  eklendi.
- **Düşük:** Gevşek metin locator'ları kapsama alındı (sepet listesi, canlı bölge).

**ui-ux-tester** — kritik yok; 5 orta, 4 düşük. Yedisi DÜZELTİLDİ.

- Ödeme yöntemi kısayolları (yukarıda), son ödemede odak kaybı, indirim ve vardiya
  kapanışı modallarında Enter'ın çalışmaması, iade modalında arama alanına odak
  gelmemesi, fiş "Yeni satış (Enter)" etiketinin rastlantıya dayanması, kapanış özetinde
  odak yönetimi — hepsi düzeltildi.
- Erişilebilirlik: para üstü kutuları `role="status" aria-live="polite"` oldu;
  `ProductGrid`'de düğmelerin üstüne yazılan `role="listitem"` kaldırıldı (buton
  semantiğini siliyordu).
- **Teyitler:** hiçbir modalda çıkmaz yok; F1–F10 modal açıkken susuyor, ikinci modal
  açmıyor; `+`/`−` ve ok tuşları barkod yazımına karışmıyor; sonsuz spinner senaryosu yok.

---

## Bilinen eksikler / sonraki fazlara

| Konu                                                            | Neden / karar                                                                                                                                                                                  | Ne zaman       |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| 0 tutarlı satış (%100 indirim, ücretsiz numune) tamamlanamıyor  | Sunucu sözleşmesi en az bir ödeme kalemi ve sıfırdan büyük tutar istiyor; desteklemek satış DTO'sunu değiştirmek demek. Kasiyer artık boş modalda kilitlenmiyor, nedeni yazan bir uyarı alıyor | Karar bekliyor |
| Fiş yazdırma `NOT_IMPLEMENTED`                                  | Önizleme hazır ve `ReceiptData` yazıcıya gidecek yapının aynısı; gerçek yazıcı Faz 14                                                                                                          | Faz 14         |
| Terazi barkodunda fiyat/ağırlık modu ayarı yok                  | Ağırlık yorumu varsayıldı (karar 2). Fiyat gömen terazilerde miktar yanlış çıkar; tenant ayarına mod alanı gerekiyor                                                                           | Faz 14         |
| Cari (müşteri) önbelleği yok → çevrimdışı veresiye yapılamıyor  | Bakiye ve kredi limiti canlı veri; eski kopyayla limit aşımına izin vermek gerçek zarar. Ayrı bir senkronizasyon kararı                                                                        | Faz 15         |
| Kredi limiti çevrimdışı doğrulanamıyor                          | Müşteri online seçilip bağlantı sonradan koparsa sunucu satışı sync'te reddedebilir. Artık en azından GÖRÜNÜR: gönderilemeyen satışlar ekranı                                                  | Faz 15         |
| 200 kalem sınırı aşılırsa jenerik hata                          | IPC şeması `lines.max(200)`; sepet tarafında üst sınır uygulanmıyor, kasiyer 201. kalemde "Girilen bilgiler geçersiz" görüyor. Gerçek bir bakkalda erişilmeyecek sınır                         | Sonra          |
| Vardiya kapanışında kasa hareketi (para ekle/çek) ekranı yok    | `POST /cash-sessions/:id/movements` hazır; kapanış akışına eklenmedi                                                                                                                           | Sonra          |
| `TRANSFER` ödeme yöntemi ve çoklu nakit parçası birim testi yok | `settlePayments` mantığı destekliyor, e2e'de kart+nakit test ediliyor; havale kalemi sınanmadı                                                                                                 | Sonra          |
| 16 ms ve 60 sn eşikleri CI'da flake üretebilir                  | Ölçülen değerler eşiklerin çok altında (0,20 ms / ~17 sn), ama yavaş bir CI makinesinde marj daralır                                                                                           | İzlenecek      |

---

## Sonraki faz için uyarılar

**Faz 14 (Donanım entegrasyonları)**

- **Fiş yapısı hazır:** `ReceiptData` (`shared/ipc-contracts.ts`) ekranda gösterilen
  yapının aynısıdır. Yazıcıya giden kod bunu yeniden kurmasın, `sale.submit()` sonucundaki
  `receipt` alanını kullansın — ekranda gördüğüyle kâğıttan çıkan aynı olmalı.
- **`printer:print-receipt` kanalı `clientSaleId` alıyor**, sunucudaki `saleId` değil:
  çevrimdışı satışın fişi de basılabilmeli, o satışın sunucu kimliği henüz yok.
- **Terazi kanalı (`scale:read`) F7'ye bağlı** ve şu an `NOT_IMPLEMENTED` dönüyor; ekran
  bu hatayı toast olarak gösteriyor, gövde doldurulunca akış kendiliğinden çalışır.
- **Tartılı barkodda mod ayarı gerekiyor** (karar 2). Tenant ayarına alan eklenirse
  `/sync/pull` settings payload'ına da eklenmeli, `PosSettings` ile birlikte.
- **Para çekmecesi:** satış tamamlanınca nakit ödemede çekmece açılmalı; tetikleme yeri
  `sale-screen.tsx` içindeki `submitSale` başarısı.

**Genel**

- Satış/KDV/indirim/ödeme hesabının tamamı `@stokk/pos-core`'da: `calculateSaleBreakdown`,
  `settlePayments`, `maxEffectiveDiscountRate`, `calculateChange`, `calculateRefundAmount`.
  Kasada da sunucuda da ikinci bir formül yazılmaz.
- `<dialog>` içinde `autoFocus` GÜVENİLİR DEĞİL (karar 10); yeni modal eklerken odak
  `useRef` + `useEffect` ile kurulmalı.
- Yeni IPC kanalı eklerken üç yer birden: `shared/ipc-contracts.ts`,
  `ipc/register-handlers.ts`, `preload.ts`. Handler unutulursa `assertChannelsRegistered()`
  açılışta patlar.
