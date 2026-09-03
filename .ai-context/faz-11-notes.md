# Faz 11 — Web: satış, raporlar, e-fatura, kullanıcı, ayarlar

**Tarih:** 2026-09-03 · **Durum:** kapandı — doğrulama gerçek tarayıcıda geçti, dört faz ajanının bulguları işlendi

---

## Ne eklendi

**Backend — fazın gerektirdiği iki eksik uç**

- **`settings` modülü**: `GET/PATCH /settings`. Firma bilgileri (Tenant) + işletme kuralları
  (TenantSettings) + fiş/yazıcı + entegrasyon kimlik bilgileri tek yerden. Kimlik bilgileri
  **AES-256-GCM ile şifreli** saklanır, API'den yalnız **maskeli** döner.
- **`audit-logs` ucu**: `GET /audit-logs` — sayfalı, işlem/varlık/kullanıcı/tarih filtreli.
  `AuditService.list` eklendi; kayıt salt okunur.
- **Migration'lar**: `tenant_settings`'e yazıcı varsayılanları + entegrasyon kimlik alanları;
  `audit_logs` uygulama rolü için **yalnız-ekle** (UPDATE/DELETE yetkisi geri alındı).
- **Satış listesi filtreleri**: `userId` (kasiyer), `paymentMethod`, `from`/`to`, fiş no araması.
- **`sale.findOne`**: kasiyer bilgisi + kalem başına iade edilmiş miktar (iade ekranı için).
- **`exports/:jobId/file`**: hazır raporu yetki kontrolünden geçirerek akıtır.

**`@stokk/pos-core`**: `calculateRefundAmount` — iade tutarı hesabının tek yeri (aşağıda).

**Web ekranları**

- **Satışlar** (`/sales`, `/sales/[id]`): tarih/kasiyer/ödeme tipi filtreleri, fiş detayı,
  KDV kırılımı, ödemeler, iadeler; fiş yazdırma; **iade dialogu** (kalan miktar, sebep zorunlu).
- **Raporlar** (`/reports`): tek tarih aralığı + kırılım; satış trendi, kâr, en çok satılanlar,
  ödeme dağılımı, kasiyer performansı, saatlik yoğunluk, stok değeri, günlük vardiya özeti.
  Beş rapor için Excel/PDF indirme.
- **e-Fatura** (`/e-invoices`): liste, durum takibi, PDF, gönder / durum sorgula / iptal.
- **Kullanıcılar** (`/users`) ve **Roller ve izinler** (`/users/roles`): izin matrisi kaynak
  bazında gruplu, grup başlığından toplu seçim.
- **Ayarlar** (`/settings`) ve **Denetim kaydı** (`/settings/audit`).

**Grafik bileşenleri** (`components/charts/`): `BarChart` (tek seri sütun), `RankedBars`
(yatay sıralı), `ShareBar` (parça-bütün). Palet `dataviz` doğrulayıcısından geçirildi.

**Menü**: Satışlar, Raporlar, e-Fatura, Kullanıcılar, Ayarlar açıldı — plandaki tüm menü
öğeleri artık canlı.

---

## Alınan kararlar

### 1. Kimlik bilgileri şifreli saklanır, API'ye düz metin ÇIKMAZ

`tenant_settings` içinde `eInvoiceSecretEnc` / `smsApiKeyEnc` AES-256-GCM ile (IV her
şifrelemede yeni, auth tag doğrulanır, `v1:` sürüm öneki). `GET /settings` yanıtında
şifreli sütunlar destructuring ile ayıklanır; yalnız `••••1234` maskesi döner.

**Yazma yönlü alan:** `PATCH` gövdesinde alan YOKSA kayıtlı değer korunur, boş string
AÇIKÇA siler. Ekran maskeyi geri gönderip gerçek parolayı ezmek zorunda kalmaz.

Anahtar `SETTINGS_ENCRYPTION_KEY`'den gelir; development'ta verilmezse `JWT_SECRET`'tan
HKDF ile türetilir ve uyarı loglanır. **Production'da zorunlu** (env `refine`) — çünkü
JWT_SECRET rotasyonu türetilmiş anahtarla kayıtlı kimlik bilgilerini okunamaz yapar.

### 2. İade tutarı ÖDENEN tutardan oranlanır — pos-core'da tek hesap

`SaleItem.unitPrice` indirim ÖNCESİ ham fiyattır; müşterinin ödediği `lineTotal`'dır.
İadeyi `unitPrice × miktar` ile hesaplamak indirimli satışta **fazla ödeme** üretiyordu
(100 TL ürün %10 indirimle 90 TL'ye satılıp 100 TL iade ediliyordu). Hesap
`calculateRefundAmount` ile pos-core'a alındı: `lineTotal × (iade / satılan)`.
Backend iadeyi yazarken, ekran tutarı gösterirken aynı fonksiyonu çağırır.

### 3. İzin guard'ı artık VARSAYILAN KAPALI

`PermissionsGuard` önce `@Permissions()` yoksa `true` dönüyordu: decorator eklemeyi
unutmak, kimliği doğrulanmış herkese (kasiyer dahil) açık bir uç bırakıyordu ve bunu ne
derleyici ne test yakalıyordu. Artık izin tanımlanmamış uç **reddedilir**; bilinçli
istisna `@NoPermissionRequired()` ile işaretlenir (bugün yalnız `/auth/me`).
`@Public()` uçlar en başta ayrılır — yoksa giriş/kayıt da reddedilirdi.

### 4. Kendini kilitleme koruması

Rol matrisi ve kullanıcı yönetimi tek tıkla tenant'ı yönetilemez bırakabiliyordu.
Sunucuda iki koruma eklendi:

- `roles.update`: rolden `role.manage` kaldırılırken bu izne sahip başka aktif kullanıcı
  kalmıyorsa reddedilir (`LAST_ROLE_ADMIN`).
- `users.update`/`deactivate`: kendi hesabını pasife alma engellenir; son yetkilinin
  yetkisini kaldıran işlem reddedilir (`LAST_ADMIN`).
  Ekranda ayrıca kaydetmeden önce uyarı gösterilir.

### 5. Kendi profilini düzenleme artık mümkün

`users.update` içindeki "kendi rollerinizi değiştiremezsiniz" kontrolü `input.roleIds`
gönderildiğinde koşulsuz tetikleniyordu; ekran ad/telefon güncellerken de rolleri
gönderdiği için kullanıcı **kendi adını bile** değiştiremiyordu. Kontrol, rol kümesi
GERÇEKTEN değiştiğinde çalışacak şekilde daraltıldı; ekran da değişmemiş rolleri göndermiyor.

### 6. Rapor metrik etiketleri: "Ciro" iki farklı şey demekti

`/reports/sales` `SUM(grandTotal)` döner — **KDV dahil, iadeler düşülmemiş brüt**.
`/reports/profit` ise `SUM(netAmount) − iadeler` — **KDV hariç net**. Aynı kelimeyle iki
farklı sayı göstermek tutarsızlık gibi okunuyordu. Sunucu tanımları korundu (Faz 7 kararı),
ekran etiketleri gerçeği söyleyecek şekilde düzeltildi ve fark grafiğin altında yazıldı.

Benzer düzeltmeler: "En çok satanlar" sunucuda **adet** bazlı sıralı olduğu için çubuk da
adet oldu (ciro ipucuna alındı — aksi hâlde üstteki satır alttakinden kısa görünüyordu);
saatlik yoğunluk aralık toplamı yerine **günlük ortalama**; stok değerinde "Satış değeri
(potansiyel)"; günlük vardiyada "Toplam satış tüm yöntemler, fark yalnız nakit" notu.

### 7. Grafikler: doğrulanmış palet, renk tek başına anlam taşımaz

Tek serili grafikler marka yeşili (sıralı). Tek çok sınıflı grafik olan ödeme dağılımı
`dataviz` referans paletinin ilk 4 slotunu SABİT sırayla kullanır. Palet doğrulayıcıdan
geçirildi: açık temada (#ffffff) tüm kontroller geçti + kontrast uyarısı, koyu temada
(#121a16) tümü geçti. Kontrast uyarısının gereği olarak her dilimde **doğrudan etiket +
tutar + yüzde** var ve ayrıca gizli veri tablosu bulunuyor.

Renkler CSS değişkeninde (`--viz-1..4`), JS ile tema okunmaz — sunucu ve istemci ilk
render'ı aynı olur.

### 8. Export dosyası yetkili uçtan iner

Nesne deposu özeldir; `fileUrl` doğrudan açıldığında **403** dönüyordu, yani "rapor
indiriliyor" iddiası ekranda karşılanmıyordu. `GET /exports/:jobId/file` eklendi; ekran
`apiDownload` ile Authorization taşıyarak indiriyor (ekstre Excel'iyle aynı desen).

---

## Doğrulama çıktıları

```
pnpm build          8/8    ✓
pnpm lint          12/12   ✓  (0 hata, 0 uyarı)
pnpm typecheck     12/12   ✓
pnpm test          12/12   ✓  (api 102, web 71, pos-core 56, ui 11, types 8, db 3)
pnpm format:check  ✓
```

## Faz 11 doğrulama bloğu (plan) — gerçek tarayıcıda sürüldü

**"Kasiyer hesabıyla giriş → kâr raporu menüde yok, doğrudan URL ile de 403"** ✓

Kasiyer rolüyle kullanıcı açıldı, onun oturumuyla giriş yapıldı:

| Kontrol                                    | Sonuç                                                                                         |
| ------------------------------------------ | --------------------------------------------------------------------------------------------- |
| Sidebar menüsü                             | `Panel · Ürünler · Stok · Satışlar · Cariler` — Raporlar, e-Fatura, Kullanıcılar, Ayarlar YOK |
| `/reports` adresine doğrudan gidiş         | "Rapor yetkiniz yok" ekranı (URL sabit kaldı)                                                 |
| `GET /reports/profit`                      | **403**                                                                                       |
| `GET /reports/sales`                       | **403**                                                                                       |
| `GET /settings` · `/audit-logs` · `/roles` | **403**                                                                                       |
| `GET /sales` (kasiyerin izni var)          | 200                                                                                           |
| Patron aynı kâr raporu ucu                 | 200 — kısıt role bağlı, uca değil                                                             |

**"Her rapor ekranı Excel ve PDF indiriyor"** ✓
Satış raporu için iki iş de `COMPLETED`; indirme ucu **200** döndü:
XLSX `6.522 bayt` (`…spreadsheetml.sheet`), PDF `1.380 bayt` (`application/pdf`).
(Düzeltmeden önce depo adresi 403 veriyordu — bkz. karar 8.)

**"Ayarlarda kimlik bilgisi maskeli, kaydedince yeniden yazılmadıkça değişmiyor"** ✓
Ekrandan e-fatura parolası ve SMS anahtarı yazılıp kaydedildi → `GET /settings`
`••••a123` / `••••9876` döndü, yanıtta düz metin YOK. Sayfa yenilendi, şifre alanlarına
DOKUNULMADAN işletme adı değiştirilip tekrar kaydedildi → ad güncellendi, maskeler
aynı kaldı. Boş string gönderimi kaydı siliyor (e2e testi).

**Ek doğrulamalar**

- İndirimli satışta iade: 100 TL birim fiyatlı ürün %10 indirimle 90 TL'ye satıldı.
  Ekrandaki buton **₺90,00 iade et** dedi; sunucunun yazdığı `totalAmount` ve satır
  `lineTotal` da **90**. (Düzeltmeden önce 100 olurdu.)
- Kalıcı regresyon testi: `apps/api/test/faz11-gap.e2e.spec.ts` — 6 test
  (kasiyer 403'leri, maskeleme, yeniden yazılmadıkça değişmeme, boş string silme,
  son yetkili koruması, kendi profilini düzenleyebilme).

---

## Ajan bulguları

**security-auditor** (izin matrisinin sunucuda zorlanması) — kritik açık YOK; 3 bulgu.

- **DÜZELTİLDİ (yapısal):** `PermissionsGuard` varsayılanı fail-open'dı. Kapalı varsayılana
  çevrildi + `@NoPermissionRequired()` istisnası (karar 3).
- **DÜZELTİLDİ (uyumluluk):** `audit_logs` uygulama rolü tarafından UPDATE/DELETE
  edilebiliyordu; "salt okunur" iddiası yalnız API'de doğruydu. Migration ile yetki geri alındı.
- **AÇIK BIRAKILDI (karar gerektirir):** İzin kataloğu yorumu "kâr yalnız Patron'da" diyor
  ama YONETICI rolünde `PRODUCT_COST_VIEW` var; müdür `/reports/top-products` ve
  `/reports/stock-value` üzerinden kâr bilgisini türetebiliyor. İzin matrisi değişmez karar
  alanı olduğu için tek başıma değiştirmedim — bkz. bilinen eksikler.
- **Teyitler:** `GET /settings` şifreli/düz metin secret döndürmüyor; IV her şifrelemede yeni;
  auth tag doğrulanıyor; kodda gömülü secret yok; audit'e parola değeri yazılmıyor; settings
  ve audit sorguları `withTenant` üzerinden; kasiyerin eriştiği hiçbir uç maliyet döndürmüyor.

**ui-ux-tester** (iade + izin matrisi) — 3 KIRAR bulgusu, hepsi DÜZELTİLDİ.

- **İade tutarı indirimi yok sayıyordu** → fazla ödeme. pos-core'a taşındı (karar 2).
- **Sistem rolünden `role.manage` kaldırılıp kendini kilitleme** mümkündü → sunucu koruması
  - ekran uyarısı (karar 4).
- **Kullanıcı kendi profilini hiç düzenleyemiyordu** (yanıltıcı "kendi rollerinizi
  değiştiremezsiniz" hatası) → kontrol daraltıldı (karar 5).
- **Teyitler:** kalan iade miktarı istemci/sunucu aynı; fazla miktar girişi engelleniyor ve
  girilen satırlar kaybolmuyor; iade/iptal buton görünürlüğü doğru; iade sonrası ekran
  tazeleniyor; grup toplu seçim ve indeterminate doğru; rol dialogu state sızdırmıyor.

**data-analyst** (rapor okunabilirliği) — 6 bulgu, 6'sı DÜZELTİLDİ (karar 6), 1 kapsam dışı.

- Brüt/net "Ciro" karışıklığı, adet-sıralı listenin ciro çubuğuyla çizilmesi, saatlik
  yoğunluğun aralık toplamı olması, "Satış değeri"nin gerçekleşmiş gelir gibi vurgulanması,
  vardiya tablosunda nakit/tüm-yöntem karışıklığı, ödeme yüzdesinin bazının yazılmaması.
- **Kapsam dışı bırakıldı:** dönem karşılaştırması (%değişim rozeti) — yeni bir metrik
  hesabı ve tasarım kararı; faz kapsamını genişletirdi.

**accessibility-tester** (grafikler) — 3 bulgu, hepsi DÜZELTİLDİ + 1 tutarsızlık.

- `aria-labelledby` tüm veri tablosunu tek metne düzleştiriyordu → kısa `aria-label`.
- Hover ipucu `role="status"` idi; fare grafiğin üstünden geçerken ekran okuyucuya
  sürekli duyuru yapıyordu → `aria-hidden`.
- Klavye erişimi yoktu. **Ajanın önerisi (her sütuna `tabIndex`) uygulanmadı**: `aria-hidden`
  ile birlikte "odaklanabilir ama okuyucuya gizli" ihlali doğururdu ve 24 sekme durağı
  üretirdi. Yerine grafik TEK sekme durağı + ok tuşu gezinmesi yapıldı; seçili değer
  `sr-only` canlı bölgeden duyuruluyor.
- Ajanın yakaladığı tutarsızlık: `ShareBar` görselde ilk 4 dilimi, tabloda TÜMÜNÜ
  gösteriyordu. Katlama gerçekten uygulandı ("Diğer"), ikisi artık aynı kümeyi gösteriyor.
- **Teyitler:** renk tek başına anlam taşımıyor; tablo semantiği (`caption`, `th scope`)
  doğru; `--viz-*` değişkenleri iki temada da tanımlı; vuruş alanları yeterince geniş.

---

## Bilinen eksikler / sonraki fazlara

| Konu                                                                       | Neden / karar                                                                                                                    | Ne zaman       |
| -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| YONETICI rolü kâr bilgisini `top-products`/`stock-value`'dan türetebiliyor | İzin kataloğu yorumu ("kâr yalnız Patron") uygulamayla çelişiyor. İzin matrisi DEĞİŞMEZ karar alanı — kullanıcı kararı gerekiyor | Karar bekliyor |
| Ürün görseli `imageUrl` doğrudan açıldığında 403                           | Export ile aynı kök neden (özel kova). Export ucu düzeltildi; görsel için de yetkili uç ya da imzalı adres gerekiyor             | Faz 15         |
| Rapor ekranında dönem karşılaştırması (%değişim) yok                       | Yeni metrik + tasarım kararı; data-analyst da faz dışı bıraktı                                                                   | Sonra          |
| Abonelik yalnız görüntüleniyor (plan yükseltme yok)                        | Planlar ve ödeme sağlayıcısı Faz 15 kapsamı                                                                                      | Faz 15         |
| Kasa (register) tanım ekranı yok                                           | `/registers` uçları hazır; ayarlar ekranına eklenmedi, POS kurulum akışıyla gelmesi daha doğal                                   | Faz 12/13      |
| e-Fatura ekranından belge OLUŞTURMA yok                                    | `POST /e-invoices/from-sale/:saleId` hazır; satış detayına buton eklenmedi — e-Arşiv eşiği otomatik akışla çalışıyor             | Sonra          |
| Audit yazım hatası sessizce yutuluyor (alarm yok)                          | `audit.service.record` hatayı loglayıp geçiyor; asıl işlemi düşürmemesi kasıtlı, ama izleme yok                                  | Faz 15         |
| `catalog` ham sorguları yalnız RLS'e dayanıyor                             | Açık `tenantId` filtresi yok; sızıntı yok ama tek katman (security-auditor notu)                                                 | Faz 15         |

---

## Sonraki faz için uyarılar

**Faz 12 (Electron iskelet, offline depo, senkronizasyon)**

- **Yeni uç eklerken `@Permissions()` ŞART.** Guard artık varsayılan kapalı: decorator
  yoksa istek reddedilir. Bilinçli istisna `@NoPermissionRequired()` ile işaretlenir.
- POS `sync/pull` payload'ında maliyet alanı YOK ve olmamalı — kasa PC'si çalınırsa
  maliyet sızmasın (Faz 11'de teyit edildi).
- Satış hesabı ve iade tutarı `@stokk/pos-core`'da: `calculateSaleBreakdown`,
  `calculatePurchaseBreakdown`, `calculateRefundAmount`. POS'ta ikinci formül yazılmaz.
- Offline satış `clientSaleId` ile idempotent; `soldAt` POS'taki gerçekleşme anıdır.
- Yeni tenant ayarı eklenecekse `settings` modülüne alan eklemek yeterli — ekran alanı
  otomatik gelmez, `settings-view.tsx` içine de eklenir.
- Kimlik bilgisi türü bir alan eklenecekse `SecretCipher` + maskeli dönüş desenini izle;
  düz metin API'den ASLA çıkmaz.
