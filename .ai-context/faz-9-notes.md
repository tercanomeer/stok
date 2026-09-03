# Faz 9 — Web: ürün & stok ekranları

**Tarih:** 2026-09-03 · **Durum:** kapandı — doğrulama gerçek tarayıcıda geçti, dört faz ajanının bulguları işlendi

---

## Ne eklendi

**`@stokk/ui` (packages/ui)** — iki yeni primitive, iki düzeltme

- `Checkbox`: saydam native `<input type="checkbox">` üstüne çizilen kutu. İşaret **CSS ile**
  sürülür (`peer-checked` / `peer-indeterminate`), React durumuyla değil — böylece hem kontrollü
  kullanımda (DataTable seçimi) hem react-hook-form'un kontrolsüz `register`'ında doğru görünür.
  Kutu ve işaretler girdinin KARDEŞİ; `peer-*` yalnız kardeşe işler. Saydam girdinin kendi odak
  halkası çizilmediği için halka `peer-focus-visible` ile görünür kutuya taşındı. `'use client'`
  gerekli (hook kullanıyor) — yoksa `not-found.tsx` gibi sunucu bileşenleri build'i kırıyor.
- `Textarea`: `Input` ile aynı token/hata deseni (fire ve düzeltme sebebi, ürün açıklaması, sayım notu).
- `Dialog`: sabit `id="dialog-title"` yerine `useId()`. Bir ekranda birden fazla dialog mount
  oluyor (fire + düzeltme + onay); sabit id DOM'da kopya üretiyor ve `aria-labelledby` yanlış
  başlığa bağlanıyordu.
- `CellProps.numeric` / `TdProps.numeric` / `DialogProps.description` → `| undefined`
  (`exactOptionalPropertyTypes: true` ile isteğe bağlı prop'a açıkça `undefined` geçilebilsin).

**`apps/web` — ortak liste/form katmanı (`components/common/`)**

Faz 9'un asıl kazancı: tablo/form mantığı ekran başına kopyalanmadı.

- `DataTable` — sıralama (`aria-sort` + tıklanabilir başlık), satır seçimi (indeterminate başlık
  kutusu), sütun görünürlüğü, yükleniyor iskeleti / hata + tekrar dene / boş durum tek yerde.
- `ColumnMenu` (yerel `<details>`), `PaginationBar` (toplam + sayfa + sayfa boyutu),
  `SearchInput` (300 ms gecikmeli, `aria-label`'lı, temizle butonlu), `ConfirmDialog`,
  `PageHeader`, `LinkButton` (buton görünümlü `<a>`), `PermissionGate` (ekran düzeyi yetki kapısı),
  `SectionTabs`, `PageFallback`.
- `lib/list-params.ts` — **saf** liste durumu: URL ⇄ `{page, limit, search, sort, filters}`.
  Varsayılanlar URL'e yazılmaz (tek kanonik adres), bozuk değer varsayılana düşer, limit sunucu
  üst sınırında (100) kırpılır. `useListParams` bunu `router.replace` ile URL'e bağlar; sayfa
  dışındaki her değişiklik sayfayı 1'e çeker.

**Ürün ekranları**

- **Liste** (`/products`): sunucu taraflı sayfalama/arama, kategori + marka + stok durumu filtresi,
  sütun görünürlüğü, satır seçimi, kritik satır vurgusu, satır içi düzenle/sil (izne göre).
- **Form** (`/products/new`, `/products/[id]`): tek bileşen; çoklu barkod (`BarcodeEditor`),
  fiyat + KDV, kritik seviye, tartılı/takipsiz ürün, görsel yükleme (`ProductImage`, yalnız kayıtlı
  üründe — uç `/products/:id/image`).
- **Import sihirbazı** (`/products/import`): dosya → sütun eşleme → önizleme → sonuç raporu.
- **Etiket** (`LabelDialog`): seçim → sayfa düzeni özeti (A4 · 3×8) → PDF.
- **Toplu fiyat** (`/products/bulk-price`): filtre → yüzde/tutar → önizleme → uygula.
- **Katalog** (`/products/catalog`): kategori / marka / birim; tam ARIA "tabs" deseni.

**Stok ekranları**

- **Stok durumu** (`/stock`): kritik uyarı bandı (ürün adlarıyla), stok durumu filtresi,
  satır içi **fire** ve **düzeltme** dialogları (sebep zorunlu).
- **Hareketler** (`/stock/movements`): ürün / tip / tarih aralığı filtreli defter; giriş +yeşil,
  çıkış −kırmızı, kalan bakiye.
- **Sayımlar** (`/stock/counts`, `/stock/counts/[id]`): sayım başlat, barkodla hızlı giriş,
  canlı fark tablosu, tamamla / iptal onayı.

**Menü:** `nav.ts` içinde Ürünler ve Stok'un `soon` işareti kaldırıldı.

---

## Alınan kararlar

### 1. Sütun eşleme İSTEMCİDE uygulanır, dosya kanonik düzende yeniden kurulur

Backend sabit sütun sırası bekliyor (1 Ad · 2 Kod · 3 Birim · 4 Fiyat · 5 KDV · 6 Barkod).
Esnafın dosyasında sıra farklı olduğu için sihirbaz eşlemeyi alıp dosyayı `exceljs` ile yeniden
kuruyor ve öyle gönderiyor. Backend sözleşmesi değişmedi (Faz 3 kapsamına dokunulmadı).

**Satır numaraları korunur:** satırlar kaynak dosyadaki numaralarına yazılır ve hatalı satırlar da
gönderilir. Böylece sunucunun "4. satır: geçersiz satış fiyatı" raporu, kullanıcının kendi
dosyasındaki 4. satırı gösterir. Hatalı satırı istemcide elemek numaraları kaydırırdı.

`exceljs` yalnız `lib/xlsx-file.ts` içinde ve **dinamik** import edilir (~1 MB tarayıcı derlemesi
ana pakete girmesin). Paketin `browser` alanı hazır UMD derlemesine işaret ediyor, Next bunu çözüyor.

### 2. Kritik stok tanımı tek: `criticalLevel > 0 AND stockQuantity <= criticalLevel`

`/products?stock=low` ile `/stock/low` FARKLI davranıyordu: ürün filtresinde `criticalLevel > 0`
koşulu yoktu, seviyesi tanımsız (0) her ürün `0 <= 0` ile "kritik" sayılıyordu. Uyarı bandı
(`/stock/low`) 1 ürün derken liste 5.000 ürün gösteriyordu. `products.service.ts` içindeki ham SQL
defterin tanımıyla hizalandı; `products-gap.e2e.spec.ts`'e iki ucun aynı kümeyi döndürdüğünü
doğrulayan regresyon testi eklendi. Seviyesiz ürün "Tükendi" filtresinde görünmeye devam ediyor.

### 3. Fire ve düzeltme ayrı sayfa değil, stok listesinden dialog

Plan "fire ve manuel düzeltme ekranları" diyor. Ayrı sayfa yapmak kullanıcıyı ürün seçmek için
ikinci bir arama ekranına sokuyordu; stok listesinde zaten arama ve satır var. İkisi de satır
eyleminden açılan dialog: ürün, mevcut stok ve birim hazır gelir, sebep zorunlu. Düzeltmede
**fark değil doğru miktar** girilir — farkı sunucu hesaplar (yanlış işaret hatasına kapalı).

### 4. Sanal kaydırma yok — sunucu sayfalaması yeterli

Doğrulama "5.000 ürünlük listede kaydırma ve filtreleme akıcı" diyor. Backend `limit` üst sınırı 100
olduğu için ekranda en fazla 100 satır render ediliyor; 5.004 ürünlü tenant'ta liste sorgusu 51 ms,
arama 26 ms ölçüldü. Sanal kaydırma kütüphanesi eklemek ölçülebilir bir kazanç vermeden karmaşıklık
getirirdi (performance-engineer da aynı sonuca vardı).

### 5. Katalog sekmelerinde ARIA "tabs" deseni TAM uygulandı

Yarım tablist (rol var, ok tuşu yok) hiç olmamasından kötü: okuyucu "3 sekmeden 1." der ama ok
tuşları çalışmaz. Roving tabindex + ←/→/Home/End + `aria-controls`/`aria-labelledby` + `role="tabpanel"`
eklendi. Stok bölümündeki gezinme ise gerçek sayfa geçişi olduğu için sekme değil **link**
(`SectionTabs`, `aria-current="page"`).

### 6. Para ve miktar: gösterim istemcide, hesap sunucuda

Form girdisi virgüllü kabul edilir (`"12,50"`), `toDecimalString` ile noktaya çevrilir ve **string**
gönderilir. `lib/quantity.ts` yalnız sayım fark SÜTUNU için binde birlik tam sayıya ölçekleyip
çıkarma yapar (float artığı `0.30000000000000004` görünmesin); stoğa yazılan gerçek fark sunucuda
Decimal ile hesaplanır.

---

## Doğrulama çıktıları

```
pnpm build          8/8   ✓
pnpm lint          12/12  ✓  (0 hata, 0 uyarı)
pnpm typecheck     12/12  ✓
pnpm test          12/12  ✓  (api 93, pos-core 40, ui 11, web 39, types 8, db 3)
pnpm format:check  ✓
```

## Faz 9 doğrulama bloğu (plan) — gerçek tarayıcıda sürüldü

Yerel yığın ayağa kaldırıldı (Nest + Next + Postgres/Redis/MinIO), `Faz9 Market` işletmesi
kayıt ekranından açıldı, akışlar Playwright ile sürüldü.

**"5.000 ürünlük listede kaydırma ve filtreleme akıcı"** ✓
Sihirbazdan 5.000 satırlık dosya aktarıldı (Toplam 5.000 · Oluşturulan 5.000 · Hatalı 0).
5.004 ürünlü tenant'ta ölçüm: `/products?limit=100&sort=name:asc` **51 ms**, `search=Ürün 4321`
**26 ms**, ekranda render edilen satır **100** (sunucu sayfalaması). Arama 300 ms gecikmeli,
her tuşta istek gitmiyor.

**"Import: hatalı satır numarası ve sebebi doğru raporlanıyor"** ✓
Sütunları kasten karışık (Barkod | KDV | Ürün Adı | Fiyat | Birim | Kod) ve 3 hatalı satır içeren
dosya yüklendi. Otomatik eşleme altı sütunun hepsini doğru buldu. Önizleme 4/5/6. satırları
sebebiyle işaretledi; sunucu raporu **aynı satır numaralarını** döndürdü:
`4 salePrice Geçersiz satış fiyatı.` · `5 vatRate Geçersiz KDV oranı.` · `6 Birim bulunamadı: düzine`.
Sağlam 3 satır oluştu (kısmi başarı). Aynı dosya ikinci kez yüklendiğinde barkod çakışmaları da
doğru satırlarla raporlandı.

**"Sayım tamamlandığında stok tek seferde düzeliyor"** ✓
Sayım başlatıldı, barkod okutuldu (odak alandan hiç çıkmadı — başarıda da, tanınmayan barkodda da
geri döndü), canlı fark tablosu `Sistem 0 · Sayılan 25 · Fark +25` gösterdi, tamamlandı.
Hareket defterinde **tek** kayıt: `Sayım farkı · +25 · kalan 25`.

**Ek doğrulamalar**

- Menüde Ürünler ve Stok aktif, yetkisiz öğeler hâlâ render edilmiyor.
- Access token süresi doldu (401) — sessiz refresh devreye girdi, kullanıcı düşmedi, ekran çalıştı.
- Fire dialogu: 25 → 5 düştü, kritik bandı ve "Kritik" rozeti belirdi, `stock=low` filtresi ile
  banner AYNI ürünü gösterdi (kritik tanımı hizalandıktan sonra).
- Katalog sekmeleri: roving tabindex (0/-1/-1), ← → odağı ve seçimi taşıyor,
  `aria-controls`/`aria-labelledby` eşleşiyor.
- Sütun seçim kutusu: erişilebilirlik ağacında `[checked=mixed]`.
- `?page=9` gibi var olmayan sayfa otomatik son geçerli sayfaya çekiliyor.
- İçe aktarma işi URL'de (`?job=...`): sayfa tam yenilendikten sonra sonuç raporu geri geliyor.

---

## Ajan bulguları

**ui-ux-tester** (çok adımlı akışlar) — 6 soru, 3 gerçek bulgu.

- **DÜZELTİLDİ (akışı kırıyordu):** `ConfirmDialog` yalnız "Vazgeç" butonunu kilitliyordu; `Dialog`'un
  X butonu, Esc ve backdrop tıklaması `loading`'i bilmiyordu. Kullanıcı "Sayımı iptal et" onayına
  bastıktan sonra Esc'e basıp işlemi durdurduğunu sanabiliyor, istek arka planda tamamlanıp
  ekranı `/stock/counts`'a atıyordu — geri alınamaz işlemde ciddi güven kırıcı. `Dialog`'a
  `closeDisabled` eklendi (X disabled, Esc ve backdrop kilitli); `ConfirmDialog`, `WasteDialog` ve
  `AdjustDialog` istek uçuştayken kapanmıyor.
- **DÜZELTİLDİ:** `SearchInput` yankı sorunu. Gecikmeli terim URL'e yazılıp `value` olarak geri
  döndüğünde yerel metnin üzerine yazılıyordu; kullanıcı bu arada yazmaya devam ederse harfleri
  kayboluyordu. Artık `value === debounced` ise (kendi yankımız) yerel metne dokunulmuyor.
- **DÜZELTİLDİ:** son sayfadaki kayıtlar silinince sunucu istenen sayfayı aynen döndürdüğü için
  liste boşalıyor ve sayaç "3 / 2" gösteriyordu. `usePageClamp` eklendi (ürün, stok ve hareket
  listelerinde); `?page=9` gibi geçersiz sayfa son geçerli sayfaya çekiliyor.
- **DÜZELTİLDİ:** içe aktarma iş kimliği yalnız bileşen durumundaydı; kullanıcı sonuç ekranından
  çıkıp dönerse ya da sayfayı yenilerse 5.000 satırlık işin sonucunu bir daha göremiyordu.
  Kimlik artık URL'de (`/products/import?job=...`), tam yenilemede rapor geri geliyor.
- Geçen alanlar teyit edildi: dosya değiştirince eşleme tam sıfırlanıyor; polling COMPLETED/FAILED'da
  duruyor ve `jobId` yokken sorgu atmıyor; sayım kapandıktan sonra barkod alanı DOM'dan kalkıyor ve
  `submitScan` ayrıca `!inProgress` guard'ı taşıyor; filtre/arama/sıralama sayfayı 1'e çekiyor.

**performance-engineer** — 6 soru, 1 gerçek bulgu.

- **DÜZELTİLDİ:** `import-wizard` içindeki `invalidRows` memoize değildi; sonuç adımında iş bitene
  kadar 1 sn'de bir yoklama yapıldığı için 5.000 elemanlık dizi her yoklamada gereksiz filtreleniyordu.
- Geçen alanlar teyit edildi: debounce her tuşta değil duraksayınca istek atıyor ve her render'da
  yeni timer kurmuyor; TanStack Query `queryKey`'i yapısal karşılaştırdığı için `listParamsToApiQuery`
  nesnesi cache miss üretmiyor; `LIST_CONFIG`'ler modül seviyesinde sabit; `columns`/`knownUnits`/`mapped`
  memoize ve bağımlılıkları stabil; katalog listeleri ekran başına tek sorgu (5 dk `staleTime`);
  `exceljs` yalnız `xlsx-file.ts` içinde ve dinamik. `React.memo` ve sanal kaydırma bu ölçekte
  ölçülebilir kazanç vermeyeceği için EKLENMEDİ.

**accessibility-tester** — 2 bulgu; biri gerçek, biri yanlış.

- **DÜZELTİLDİ:** `catalog-manager` yarım tablist kullanıyordu — `role="tablist"`/`role="tab"` vardı ama
  ok tuşu gezinmesi, `role="tabpanel"`, `aria-controls`/`aria-labelledby` ve roving tabindex yoktu.
  Tam ARIA "tabs" deseni uygulandı (←/→/Home/End odağı ve seçimi taşıyor, sekme sırasında yalnız
  seçili sekme duruyor). Tarayıcıda doğrulandı.
- **REDDEDİLDİ:** "`indeterminate` ekran okuyucuya iletilmiyor, elle `aria-checked="mixed"` yazılmalı."
  Yanlış. Tarayıcı erişilebilirlik ağacında başlık kutusu `[checked=mixed]` olarak görünüyor
  (Playwright anlık görüntüsüyle ölçüldü) — native `indeterminate` özelliği zaten "mixed" olarak
  eşleniyor. Native girdide elle `aria-checked` yazmak önerilmez, durum çakışması üretir.
- Geçen alanlar teyit edildi: `aria-sort`, klavyeyle sıralama, `aria-live` sayfalama, `aria-current="page"`,
  sayım odak yönetimi, +/− ile renkten bağımsız fark gösterimi, `<ol>` + `aria-current="step"`,
  gizli dosya girdisinin etiketi, ikon-butonların `aria-label`'ları.

**code-reviewer** — **RAPOR VERMEDİ.** Ajan ~25 dakika sonra ilk adımda takıldı ("I'll start by
exploring the relevant directories." dışında çıktı üretmedi), nudge'a da yanıt vermedi ve
durduruldu. Görevi kodda elle yapıldı, kanıtlarıyla:

- **Paket sınırı — ihlal YOK.** `grep` ile doğrulandı: `packages/ui/src` içinde `next`, `axios`,
  `@tanstack`, `zod` importu yok; bağımlılıkları yalnız sunum katmanı (cva, clsx, date-fns,
  lucide-react, tailwind-merge). İş mantığı (para/KDV/stok hesabı) sızmamış.
- **`common/` yerinde.** `next/` bağımlılığı taşıyan yalnız `link-button` ve `section-tabs`;
  ikisi de uygulamada kalıyor (doğru). `DataTable` next'e bağımlı değil ama `lib/list-params`'a
  bağımlı (sunucu sayfalama sözleşmesi) — POS'ta böyle bir liste olmadığı için şimdilik uygulamada
  kalıyor; taşımak "ileriki fazın işini hazırda yazmak" olurdu.
- **DÜZELTİLDİ (gerçek tekrar):** `isLow` fonksiyonu hem `product-list` hem `stock-list` içinde
  ayrı ayrı tanımlıydı — kritik tanımının iki kopyası. `lib/stock-status.ts`'e alındı
  (`isLowStock` / `isOutOfStock` / `hasCriticalLevel`), 6 birim testi yazıldı.
- **`WasteDialog` / `AdjustDialog` AYRI KALIYOR.** İkisi 130 satır ve benzer görünüyor ama farkları
  anlamsal: fire miktarı DÜŞÜLÜR, düzeltmede DOĞRU MİKTAR yazılır (fark sunucuda hesaplanır);
  şema, uç, etiketler, ipuçları ve buton tonu farklı. Tek bileşene indirmek 6+ farklı metni bir
  yapılandırma nesnesine taşıyıp okunabilirliği düşürürdü.
- **`catalog-manager` üç paneli mevcut haliyle doğru.** Ortak %60 zaten çıkarılmış (`PanelShell`,
  `RowActions`, `useCatalogPanel`); kalan kısım şema, sütunlar ve form alanları — üçünde gerçekten farklı.
- **`any` yok, yutulan hata yok** (üç `catch` de ya durumu yazıyor ya hatayı yeniden fırlatıyor).
  `parseFloat` yalnız gösterim/eşik karşılaştırmasında, hesapta değil; nedeni her kullanım yerinde yorumlu.
- Yetki: her ekranda `PermissionGate` + satır düzeyinde `<Can>`, sunucuda `@Permissions()` — çift katman.

---

## Bilinen eksikler / sonraki fazlara

| Konu                                                               | Neden / karar                                                                                      | Ne zaman       |
| ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- | -------------- |
| `code-reviewer` ajanı rapor vermedi                                | Ajan ilk adımda takıldı, nudge'a yanıt vermedi, durduruldu. Görevi elle ve kanıtla yapıldı (üstte) | —              |
| Sütun görünürlüğü seçimi kalıcı değil                              | Bileşen durumunda; yenilemede varsayılana döner. localStorage'a yazmak ayrı bir karar              | Faz 11+        |
| `<details>` menüler dışarı tıklamayla kapanmıyor                   | Faz 8'deki `user-menu` ile aynı desen; tutarlılık için değiştirilmedi                              | —              |
| Toplu fiyat yalnız kategori/marka kapsamıyla çalışıyor             | Plan böyle diyor. Seçili ürünlere uygulamak için uç hazır (`productIds`), ekran şimdilik vermiyor  | İhtiyaç olursa |
| Mobil gezinme çekmecesi hâlâ yok                                   | Faz 8'den devreden eksik; panel masaüstü ağırlıklı                                                 | Faz 11+        |
| Etiket sayfa düzeni sabit (A4 · 3×8)                               | Düzen sunucuda; ekran yalnız kaç sayfa çıkacağını gösteriyor. Seçilebilir düzen backend işi        | Sonra          |
| Ürün silme sonrası "kritik stok" bandı bir sorgu geç tazelenebilir | `['stock']` ve `['products']` ayrı invalidate ediliyor, ikisi de tetikleniyor; yarış görülmedi     | —              |
| Playwright E2E senaryosu yazılmadı                                 | Akışlar canlı tarayıcıda elle sürüldü; kalıcı E2E ayrı bir iş                                      | Sonra          |
| `apps/web/AGENTS.md` / `CLAUDE.md`                                 | `next dev` her çalıştırmada üretiyor; proje talimatı tek kaynakta olsun diye `.gitignore`'a alındı | —              |

---

## Sonraki faz için uyarılar

**Faz 10 (web: cari, alış, finans ekranları)**

- Liste ekranı şu iskeletin üstüne kurulur: `useListParams` + `DataTable` + `PaginationBar` +
  `SearchInput` + `usePageClamp`. Yeni bir tablo/sayfalama kodu YAZMA, bunları kullan.
- Sunucu sözleşmesi: `?page&limit&sort=alan:yon&search` ve `{ items, meta }`. Yeni liste ucu
  eklenirken `paginationSchema`'yı genişlet, kendi şemanı kurma.
- Yeni ekran eklerken `nav.ts`'te ilgili öğenin `soon: true`'sunu kaldır.
- Geri alınamaz işlem dialoglarında `ConfirmDialog` kullan; kendi `Dialog`'unu kurarsan istek
  uçuştayken `closeDisabled` vermeyi unutma.
- Para/miktar API'den STRING gelir. Formda virgüllü giriş `toDecimalString` ile noktaya çevrilir,
  gösterimde `formatMoney`/`formatQuantity` kullanılır. İstemcide HESAP YAPMA.
- Yetki iki katman: ekranda `PermissionGate`/`<Can>`, sunucuda `@Permissions()`. Menüde gizlemek
  tek başına güvenlik değil.
- Yeni jenerik primitive (hem web hem POS kullanacaksa) `@stokk/ui`'ye; veri/route bağımlısı olan
  uygulamada kalır. `exactOptionalPropertyTypes: true` açık — isteğe bağlı prop'a açıkça `undefined`
  geçilecekse tipinde `| undefined` yaz.
