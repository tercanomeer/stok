# 01 — Proje

## Vizyon

Stokk, Türkiye'de küçük ve orta ölçekli perakende esnafının satış, stok, cari ve finans süreçlerini
tek çatıda toplayan **bulut tabanlı + offline-first** bir SaaS POS sistemidir.

Dört tasarım ilkesi; çelişki halinde bu sırayla önceliklidir:

1. **Güvenilirlik** — internet kesilse bile kasa satmaya devam eder. Satışı engelleyebilecek tek şey veri bütünlüğüdür; yazıcı yoksa, kart okuyucu yoksa, sunucuya erişilemiyorsa satış yine tamamlanır.
2. **Hız** — barkod okutuldu → ürün sepette: 100 ms. Satış tamamlama: 200 ms. Satış ekranı her koşulda 60 fps.
3. **Sadelik** — hedef kullanıcı ERP kullanmıyor, kasa kullanıyor. Bir satış klavyeden, fareye hiç dokunmadan bitirilebilmeli.
4. **Türkiye odağı** — e-Fatura, e-Arşiv, ÖKC, karekod, KDV oranları, terazi barkodu birinci sınıf vatandaş; sonradan eklenen özellik değil.

## Hedef kullanıcı

|               |                                                                                               |
| ------------- | --------------------------------------------------------------------------------------------- |
| İşletme tipi  | Market, bakkal, tekel, nalbur, pet shop, kırtasiye                                            |
| Ölçek         | 1–5 kullanıcı, tek lokasyon, 1–3 kasa                                                         |
| Hacim         | Günde 50–500 satış, 500–20.000 ürün                                                           |
| Teknik seviye | Düşük. Kurulum sihirbazı dışında konfigürasyon beklenmez                                      |
| Donanım       | Windows PC + barkod okuyucu + termal yazıcı; opsiyonel terazi, müşteri ekranı, banka POS, ÖKC |

**Sistem rolleri** (tenant başına özelleştirilebilir):

- **Patron** — her şey. Maliyet, kâr marjı ve personel performansı yalnız bu rolde görünür.
- **Yönetici** — satış, stok, cari, alış, raporlar. Kullanıcı yönetimi ve abonelik yok.
- **Kasiyer** — satış, vardiya, yetkiliyse iade. Maliyet ve kâr görmez, ürün silemez.

## Kapsam

**Dahil**

1. **Kullanıcı & kimlik** — kayıt, giriş, roller, izinler, vardiya, denetim kaydı (audit log)
2. **Ürün** — çoklu barkod, kategori/marka/birim, toplu Excel import, etiket basımı, hazır ürün kataloğu
3. **Stok** — anlık miktar, kritik seviye uyarısı, sayım, fire, hareket geçmişi
4. **Satış / kasa** — barkodlu satış, parçalı ödeme, veresiye, iptal, iade, park, tartılı ürün
5. **Cari** — müşteri/tedarikçi, veresiye defteri, tahsilat, ekstre, borç yaşlandırma
6. **Gelir–gider & kasa** — vardiya açılış/kapanış, kasa hareketleri, gider kategorileri
7. **Raporlama** — satış, kâr, en çok satan, personel performansı, saatlik yoğunluk, Excel/PDF export
8. **Yasal** — e-Fatura, e-Arşiv, ÖKC. Adapter arkasında tasarlanır; gerçek entegratör sözleşmeye bağlı
9. **Donanım** — termal yazıcı (ESC/POS), terazi, müşteri ekranı, banka POS, para çekmecesi

**Kapsam dışı** — bilinçli karar; istenirse ayrı bir ürün kararı gerektirir:

- Restoran / kafe modülü (masa, adisyon, mutfak ekranı, garson)
- Kurye / saha mobil uygulaması
- Pazaryeri entegrasyonları (Trendyol, Getir, Yemeksepeti)
- Çoklu şube / zincir mağaza, şubeler arası transfer
- Logo / Mikro / Netsis muhasebe entegrasyonu
- Üretim, reçete, sipariş yönetimi

## İş kuralları

Kod yazılırken sürekli başvurulacak davranış kuralları. Yeni bir belirsizlik çıkarsa cevabı buraya eklenir.

**Satış**

- Satış her zaman **açık bir vardiyaya** bağlıdır. Vardiya yoksa satış ekranı açılmaz.
- Ödeme parçalı olabilir: nakit + kart + veresiye aynı fişte. Parçaların toplamı fiş tutarına birebir eşit olmak zorunda.
- Veresiye satışta müşteri zorunlu. Kredi limiti aşılıyorsa yalnız yetkili kullanıcı onaylayabilir.
- Fiş numarası tenant başına ardışık ve boşluksuz. Offline satış geçici `OFFLINE-{uuid}` alır, senkronizasyonda gerçek numarayla eşleşir — **numara atlanmaz**.
- İptal yalnız aynı vardiya içinde ve fiş kapanmadan yapılır. Sonrası iade akışıdır.
- İade orijinal fişe referansla, kalem bazında yapılır: stok geri girer, ödeme yöntemine göre iade edilir.
- %10 üzeri indirim `sale.discount.high` izni ister.

**Stok**

- Stok bir **hareket defteridir** (ledger). Anlık miktar hareketlerden türetilir, elle set edilmez.
- Hareket tipleri: satış, iade, alış, sayım farkı, fire, düzeltme. Her hareket kim/ne zaman/neden bilgisini taşır.
- Negatif stok varsayılan olarak **uyarır ama engellemez** (mal geldi, faturası gelmedi durumu). Tenant ayarıyla engellenebilir.
- Sayım tamamlanınca fark tek bir düzeltme hareketi olarak yazılır; sayım devam ederken stok değişmez.
- Maliyet: ağırlıklı ortalama. Alış faturası kaydedildiğinde güncellenir.

**Para & KDV**

- Para birimi TRY. Tüm hesap `Decimal` ile; float ile para hesabı yasak.
- KDV oranları tenant ayarında tanımlıdır (TR'de yaygın: %1 / %10 / %20). Ürün oranını bu listeden seçer.
- Fiyatlar **KDV dahil** girilir ve gösterilir; matrah ile KDV tutarı hesaplanıp fişe ayrı yazılır.
- Yuvarlama satır bazında değil **fiş toplamında** 2 haneye yapılır; kuruş farkı tek yerde toplanır.

**Vardiya & kasa**

- Vardiya, açılışta sayılan nakitle başlar; kapanışta sayılan nakitle biter.
- Kapanış özeti: açılış + nakit satış + tahsilat − gider − nakit iade = beklenen. Girilen tutarla farkı raporlanır.
- Fark eşiği aşarsa uyarı verilir; vardiya yine kapanır ama fark kayda geçer.

**Offline**

- POS açılışta ürün / barkod / müşteri cache'ini çeker. Satış **her zaman önce yerele** yazılır, sonra kuyruğa girer.
- Senkronizasyon at-least-once çalışır; sunucu tarafı **idempotent** olmak zorunda — aynı `clientSaleId` iki kez gelirse tek satış oluşur.
- Çakışma kuralı: satış verisinde POS kazanır (gerçekleşmiş olay), ürün/fiyat verisinde sunucu kazanır.

## Başarı kriterleri

Ürün "çalışıyor" sayılır ancak:

- Kasiyer internet kablosu çekiliyken 20 kalemlik satışı parçalı ödemeyle tamamlayabiliyorsa,
- İnternet gelince o satış sunucuda **tek kopya** olarak görünüyorsa,
- Patron telefonundan tarayıcıyla günün cirosunu ve kârını görebiliyorsa,
- Termal yazıcıdan Türkçe karakterli (`ş ç ğ ü ö ı İ Ğ Ş Ç Ü Ö`) fiş çıkıyorsa,
- Yeni bir geliştirici README'yi okuyup 1 saat içinde ortamı ayağa kaldırabiliyorsa.

## Sözlük

| Terim                  | Karşılık                                                                  |
| ---------------------- | ------------------------------------------------------------------------- |
| Tenant                 | Bir işletme (abone). Tüm veri bu sınırda izole edilir                     |
| Vardiya (cash session) | Bir kasiyerin kasa açılış–kapanış aralığı                                 |
| Cari                   | Müşteri veya tedarikçi hesabı                                             |
| Veresiye               | Cariye borç olarak yazılan satış                                          |
| Fire                   | Bozulma / kırılma nedeniyle stoktan düşülen miktar                        |
| ÖKC                    | Ödeme Kaydedici Cihaz (yazarkasa) — mali fiş kesen cihaz                  |
| e-Arşiv                | Mükellef olmayan alıcıya kesilen elektronik fatura                        |
| Terazi barkodu         | Tartılı ürün için terazinin ürettiği, içinde ağırlık/fiyat taşıyan barkod |
| Park                   | Yarım bırakılıp sonra devam edilecek satış                                |
