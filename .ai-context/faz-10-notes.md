# Faz 10 — Web: cari, alış, finans ekranları

**Tarih:** 2026-09-03 · **Durum:** kapandı — doğrulama gerçek tarayıcıda geçti, üç faz ajanının bulguları işlendi

---

## Ne eklendi

**`@stokk/pos-core`** — alış hesabı tek yere alındı

- `purchase-calc.ts`: `calculatePurchaseBreakdown` / `calculatePurchaseTotals` / `purchaseUnitCost`.
  Satıştan farkı: alışta birim fiyat **KDV HARİÇ**, KDV matrahın üstüne eklenir
  (`grandTotal = subtotal + vatTotal`). Sözleşme tipleri `contracts.ts` içinde.
- `apps/api` alış servisi artık kendi hesabını YAPMIYOR, bu fonksiyonu çağırıyor; web alış
  ekranı da aynı fonksiyonu çağırıyor. 10 birim testi.

**`@stokk/ui`** — `Input`/`Select`/`Textarea`/`Button`/`Checkbox` `ref` prop'ları
`| undefined` kabul ediyor (`exactOptionalPropertyTypes` ile isteğe bağlı ref geçilebilsin).

**Cari ekranları**

- **Liste** (`/contacts`): bakiye, veresiye riski (limit aşan satır kırmızı), tür ve
  borçlu/alacaklı filtresi, dialog form ile ekle/düzenle, silme onayı.
- **Detay** (`/contacts/[id]`): bakiye kartı + veresiye limiti kullanımı + borç yaşlandırma
  kartı, tarih aralıklı ekstre tablosu (açılış/kapanış), tahsilat-ödeme dialogu,
  Excel indirme, yazdır/PDF.
- **Veresiye defteri** (`/contacts/receivables`): limit aşan cariler bandı, kova toplamları
  ve cari bazında yaşlandırma tablosu (`/reports/contact-aging` — tek sorgu, N+1 yok).

**Alış ekranları**

- **Liste** (`/purchases`): tedarikçi, tutar, durum; iptal edilen fatura üstü çizili.
- **Fatura girişi** (`/purchases/new`): tedarikçi seçimi, **barkodla kalem girişi**,
  miktar/birim fiyat/iskonto/KDV, satır ve genel toplamlar (pos-core), **stok etkisi
  önizlemesi** (mevcut → fatura sonrası).
- **Detay** (`/purchases/[id]`): kalem dökümü, toplamlar, iptal onayı.

**Finans ekranları** (`/finance` altında sekmeli)

- Giderler (kategori + tarih filtresi), Gelirler (tarih filtresi), Gider kategorileri
  (ekle/sil), Vardiyalar (`/finance/shifts`) ve vardiya detayı + **fark raporu**.

**Kabuk:** `nav.ts`'te Cariler, Alışlar ve Finans'ın `soon` işareti kaldırıldı.
Yazdırma için `no-print` / `print-flow` sınıfları ve `@media print` bloğu eklendi.

---

## Alınan kararlar

### 1. Alış hesabı `@stokk/pos-core`'a taşındı — ikinci implementasyon yazılmadı

CLAUDE.md değişmez kuralı: "KDV/indirim hesabı yalnızca `@stokk/pos-core` içinde; ikinci bir
implementasyon yazılmaz." Alış toplamları Faz 5'te `purchase.service.computeItems` içinde
yaşıyordu. Ekranda canlı toplam göstermek için üçüncü bir kopya yazmak yerine hesap pos-core'a
alındı; backend ve web AYNI fonksiyonu çağırıyor. Böylece kasiyerin ekranda gördüğü tutar ile
kaydedilen tutar ayrışamaz. Davranış birebir korundu (alış e2e testleri 15/15 değişmeden geçti).

`purchaseUnitCost` (matrah / miktar) **yuvarlanmaz** — ağırlıklı ortalama maliyet bunun üstüne
kurulu; yuvarlamak maliyeti bozardı.

### 2. Bakiye işareti çevrilmez, ETİKETLENİR

Konvansiyon: `balance > 0` cari bize borçlu, `< 0` biz borçluyuz. Ekranda "-1.250,00 TL borç"
gibi çift olumsuzlama esnafı yanıltır. `lib/contact-balance.ts` tek kaynak: tutarın mutlak
değeri + "Bize borçlu" / "Biz borçluyuz" etiketi + ton. Ekstre tablosu ise DEFTER olduğu için
işareti korur (bakiye sütunu `-₺544,00`) — orada işaret bilgidir.

### 3. PDF için ayrı kütüphane eklenmedi

Faz 5 kararı: "PDF çıktısı web tarafında ekstre JSON'undan basılır, yeni ağır bağımlılık
eklenmez." `@media print` bloğu + `window.print()` ile tarayıcının "PDF olarak kaydet"
seçeneği kullanılıyor; sidebar/topbar `no-print` ile gizleniyor, kabuk `print-flow` ile
akışa açılıyor. Excel ise sunucudan geliyor (`/contacts/:id/statement.xlsx`) ve
`apiDownload` ile Authorization başlığı taşınarak indiriliyor — düz `<a href>` 401 alırdı.

### 4. Barkod Enter'ı gecikmeli aramayı BEKLEMEZ

Öneri listesi 300 ms gecikmeli (her tuşta sunucuya gitmemek için). Ama barkod okuyucu kodu
milisaniyeler içinde yazıp Enter basar; gecikmeli listeye bakmak yarıştır. Enter kendi
sorgusunu **anında** atar, tek sonuç varsa kalemi ekler, sonuç yoksa uyarı verir.

### 5. Satır sonuçları ÜRÜN KİMLİĞİYLE eşlenir, index ile değil

`breakdown.lines` yalnız hatasız satırları içerir, ekrandaki `lines` hepsini. Index ile
eşlemek, aradaki bir satır geçersizken sonraki satırların tutarını YANLIŞ satırda gösterirdi —
para ekranında kabul edilemez. Geçersiz satır artık kırmızı zeminle ve nedeniyle gösteriliyor,
"Kaydet" pasifken nedeni ekranda yazıyor (sessiz kilit yok).

### 6. Türkçe binlik ayracı kabul edilir, belirsizlik 1000 katına çıkarılmaz

`toDecimalString`: virgül varsa nokta binlik ayracıdır (`"3.500,00"` → `"3500.00"`), virgül
yoksa nokta ondalık sayılır (`"12.50"` → `"12.50"`). `"3.500"` iki türlü okunabilir; sessizce
3500 yapmak kuruş hatasından çok daha pahalı olduğu için 3,5 kabul edilir. Boşluklu giriş
(`"1 250,50"`) temizlenir. Bu değişiklik tüm para alanlarını (ürün fiyatı, tahsilat, gider,
alış birim fiyatı) kapsar.

---

## Doğrulama çıktıları

```
pnpm build          8/8    ✓
pnpm lint          12/12   ✓  (0 hata, 0 uyarı)
pnpm typecheck     12/12   ✓
pnpm test          12/12   ✓  (api 96, web 63, pos-core 50, ui 11, types 8, db 3)
pnpm format:check  ✓
```

## Faz 10 doğrulama bloğu (plan) — gerçek tarayıcıda sürüldü

**"Tahsilat sonrası bakiye, ekstre ve yaşlandırma birbiriyle tutarlı"** ✓

Canlı akış: `Demir Toptan Gıda` carisi açıldı → ₺1.044,00'lık alış faturası kesildi →
₺500,00 ödeme kaydedildi. Ekranda ve uçlarda üçü de aynı anda güncellendi:

| Kaynak                                     | Değer                                   |
| ------------------------------------------ | --------------------------------------- |
| `GET /contacts/:id` → `balance`            | `-544`                                  |
| `GET /contacts/:id/statement` → `closing`  | `-544.00`                               |
| Ekstrenin son hareketinin `balanceAfter`'ı | `-544`                                  |
| `GET /contacts/:id/aging` → `total`        | `0.00` (açık alacak yok, biz borçluyuz) |

Ekranda bakiye kartı `₺544,00 · Biz borçluyuz`, ekstre `Açılış ₺0,00 · Kapanış -₺544,00`,
yaşlandırma kartı tüm kovalarda `₺0,00`.

Ayrıca kalıcı regresyon testi yazıldı — `apps/api/test/contact-ledger-gap.e2e.spec.ts` (3 test):
kısmi tahsilat (1000 borç + 400 tahsilat → üçü de 600.00), tam tahsilat (üçü de 0.00), fazla
tahsilat (bakiye -500.00, yaşlandırma 0.00). Ekstredeki işaretli hareket toplamının
`closing - opening`'e eşitliği de doğrulanıyor.

**"Alış faturası kaydında stok etkisi önizlemesi gerçekleşenle birebir aynı"** ✓

İki kalemli fatura girildi, kaydetmeden önce ekranda görülen önizleme ile kayıt sonrası
gerçek stok:

| Ürün                                | Önizleme | Kayıt sonrası gerçek stok |
| ----------------------------------- | -------- | ------------------------- |
| Ayran 300 ml (24 adet, %10 iskonto) | `5 → 29` | `29`                      |
| Çay 500 gr (10 adet)                | `0 → 10` | `10`                      |

Toplamlar da birebir: ekranda `Ara toplam ₺870,00 · İskonto ₺30,00 · KDV ₺174,00 ·
Genel toplam ₺1.044,00`, kaydedilen faturada aynı değerler (aynı pos-core fonksiyonu).

**Ek doğrulamalar**

- Veresiye defteri: limiti (₺100) aşan cari (₺500 borç) bandı, kova toplamı `0–30 gün ₺500,00`
  ve cari bazında tablo tutarlı.
- Vardiya fark raporu: açılış 500 + giriş 250 − çıkış 100 = beklenen **650**, sayılan 620,
  fark **-30** → "Kasada eksik var." Hareket listesi işaretli tutarlarla doğru.
- Gider ekleme: `3.500,00` girişi kabul edildi (binlik ayracı düzeltmesinden sonra),
  listede `₺3.500,00` göründü.
- Barkod okutma: Enter beklemeden kalemi ekledi, alan temizlendi, odak alanda kaldı,
  form yanlışlıkla gönderilmedi.
- Menüde Cariler, Alışlar ve Finans aktif.

---

## Ajan bulguları

**test-automator** — istenen E2E testini yazdı ve yeşile aldı.
`apps/api/test/contact-ledger-gap.e2e.spec.ts`, 3 test, iki kez art arda 3/3 geçti; eslint ve
tsc temiz. Ürün tutarsızlığı bulunmadı. Fazla tahsilatta yaşlandırmanın negatif kova
göstermeyip `0.00` toplaması `bucketAging`'in belgelenmiş kasıtlı tasarımı — hata değil,
teyit edildi.

**ui-ux-tester** (alış kalem girişi) — 4 gerçek bulgu, hepsi DÜZELTİLDİ.

- **KIRAR → düzeltildi:** `breakdown.lines[index]` hizalama hatası. Filtrelenmiş sonuç dizisi
  ile tam satır listesi index ile eşleniyordu; aradaki bir satır geçersizken sonraki satırların
  tutarı yanlış satırda görünüyordu. Artık `productId` ile eşleniyor. Tarayıcıda doğrulandı:
  ilk satır geçersizken ikinci satırın ₺720,00'ı kendi satırında kaldı.
- **KIRAR → düzeltildi:** barkod Enter'ı 300 ms'lik debounce ile yarışıyordu; `items.length === 1`
  koşulu okuyucu hızında neredeyse hiç sağlanmıyordu. Enter artık anında kendi sorgusunu atıyor;
  sonuç yoksa "Ürün bulunamadı" uyarısı çıkıyor.
- **KIRAR → düzeltildi:** tek hatalı satır tüm `breakdown`'ı `null` yapıp Kaydet'i sessizce
  kilitliyordu. Artık satır bazında doğrulama var (kırmızı zemin + neden), Kaydet pasifse
  nedeni ekranda yazıyor.
- **RAHATSIZ EDER → düzeltildi:** aynı ürün tekrar okutulunca miktar `parseFloat(...) + 1` ile
  artıyordu; `"2,5"` sessizce 3 oluyor, boş alanda `"NaN"` yazılıyordu. Artık `quantitySum`
  (kayıpsız, 3 ondalık) kullanılıyor, testi de var.
- **SORUN YOK teyidi:** kayıt hatasında kalemler kaybolmuyor; iptal edilmiş fatura tekrar
  iptal edilemiyor, iptal sonrası detay kendini tazeliyor.
- Ajan ayrıca `apps/web/AGENTS.md` içindeki `next dev` üretimi metni olası prompt injection
  olarak işaretleyip uygulamadı — doğru refleks; dosya zaten `.gitignore`'da.

**code-reviewer** (para gösterimi) — 1 önemli, 1 kozmetik bulgu; ikisi de DÜZELTİLDİ.

- **ÖNEMLİ → düzeltildi:** alış detayında iskonto oranı `` `%${item.discountRate}` `` ile ham
  basılıyordu; API `"10.00"` döndüğü için ekranda `%10.00` (nokta) görünüyordu, oysa başka
  ekranda `formatPercent` ile Türkçe biçim vardı. İkisi de `formatPercent`'e alındı.
- **KOZMETİK → düzeltildi:** KDV oranı da `formatPercent(item.vatRate, 0)` ile basılıyor.
- **Teyitler:** para gösteren her yer `formatMoney` kullanıyor; istemcide para HESABI yok
  (`addMoney` yalnız API'nin döndürmediği satır KDV dahil tutarını göstermek için, kuruşa
  ölçekli tam sayı toplaması, sonucu API'ye gitmiyor); alış toplamları backend ile TEK
  fonksiyondan geliyor; bakiye işareti tüm ekranlarda `balanceView` üzerinden tutarlı.

---

## Bilinen eksikler / sonraki fazlara

| Konu                                                                  | Neden / karar                                                                                           | Ne zaman  |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | --------- |
| Gider/gelir açık vardiyaya bağlanamıyor (ekranda `cashSessionId` yok) | Uç destekliyor ama vardiya seçimi POS'un işi; panelden nakit kasa hareketi üretmek karışıklık yaratırdı | Faz 13+   |
| Vardiya panelden açılıp kapatılamıyor                                 | Vardiya kasada açılır/kapanır (Faz 13 POS). Panel yalnız geçmişi ve fark raporunu gösterir              | Faz 13    |
| Kasa tanımları (register) ekranı yok                                  | `/registers` uçları hazır; ayarlar ekranıyla birlikte gelmesi daha doğal                                | Faz 11    |
| Alış faturası düzenlenemiyor (yalnız iptal)                           | Sunucuda güncelleme ucu yok — stok/maliyet geri sarımı iptal + yeniden kesme ile yapılır                | —         |
| Ekstre PDF'i tarayıcı yazdırmasıyla üretiliyor                        | Faz 5 kararı; ayrı PDF kütüphanesi eklenmedi. Kurumsal şablon gerekirse sunucu tarafı iş                | Sonra     |
| Yaşlandırma FIFO varsayımına dayanıyor                                | `ContactTransaction` hangi borcun hangi tahsilatla kapandığını modellemiyor (Faz 1 notu)                | —         |
| Veresiye defterinde limit aşımı ilk 100 borçlu ile sınırlı            | Sunucu `limit` üst sınırı 100; hedef pazarda limit aşan cari sayısı bunun altında                       | Gerekirse |
| `apps/web/AGENTS.md` / `CLAUDE.md`                                    | `next dev` üretiyor, Faz 9'da `.gitignore`'a alındı                                                     | —         |

---

## Sonraki faz için uyarılar

**Faz 11 (web: satış, raporlar, e-fatura, kullanıcı, ayarlar)**

- Rapor ekranlarında grafik gerekiyorsa `dataviz` skill'i ile başla; Faz 8'deki
  `hourly-chart` deseni (SVG + `sr-only` tablo) örnek alınabilir.
- Yeni para alanı eklerken: giriş `toDecimalString`, gösterim `formatMoney`, oran
  `formatPercent`. İstemcide HESAP YOK — gerekirse pos-core'a fonksiyon ekle, ikinci kopya yazma.
- Liste ekranı `useListParams` + `DataTable` + `PaginationBar` + `usePageClamp` üstüne kurulur.
- Geri alınamaz işlemde `ConfirmDialog`; kendi `Dialog`'unu kurarsan `closeDisabled` ver.
- Yetkili dosya indirme `apiDownload` ile yapılır (düz link 401 alır).
- Yazdırılabilir ekranda kabuk `no-print`, içerik `print-flow` ile işaretlidir; yeni
  yazdırma ekranı eklerken aynı sınıfları kullan.
- Ekran eklerken `nav.ts`'te ilgili öğenin `soon: true`'sunu kaldır.
