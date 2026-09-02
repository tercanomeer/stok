# Faz 6 — Kasa, vardiya, satış + pos-core

**Tarih:** 2026-09-02 · **Durum:** kapandı — doğrulama geçti, beş faz ajanının bulguları işlendi

---

## Ne eklendi

**Paket** `@stokk/pos-core` (saf, framework bağımsız — satış hesabının TEK yeri)

- `sale-calc.ts` — `calculateSaleBreakdown` (satır satır) + `calculateSaleTotals` (özet). Satır birim
  fiyatı KDV DAHİL; KDV geri ayrıştırılır. `change.ts` — `calculateChange` (para üstü).
  `scale-barcode.ts` — `parseScaleBarcode` (terazi barkodu). `money.ts` — Decimal (decimal.js, float yasak).
- 40 birim test, **%100 satır/dal/fonksiyon kapsamı**.

**API modülleri** `apps/api/src/modules/`

- `registers/` — kasa (Register) CRUD
- `cash-sessions/` — vardiya aç/kapat, kasa hareketi; kapanışta beklenen/fark hesabı; `recordMovement`
  satış modülüne açık (aynı tx)
- `sales/` — satış oluşturma (idempotent), park/tamamla, iptal, kalem bazlı iade, fiş verisi;
  `sequence.service.ts` boşluksuz fiş/iade numarası
- `sync/` — `GET /sync/pull?since=` (katalog delta), `POST /sync/sales` (toplu idempotent)

**Şema/migration** — `ReceiptSequence` modeli (`receipt_sequences`) + RLS politikası (migration
`20260902114355_sale_receipt_sequence`). `TENANT_SCOPED_MODELS` listesine eklendi.

---

## Alınan kararlar

### 1. Satış hesabı yalnız pos-core'da — KDV DAHİL fiyattan geri ayrıştırma

`calculateSaleBreakdown` satır satır: `gross = miktar*birimFiyat` (KDV dahil), satır + belge indirimi
çarpımsal, `lineTotal` yuvarlanır, `vatAmount = lineTotal*oran/(100+oran)`, `netAmount = lineTotal −
vatAmount`. Böylece net+vat=lineTotal kuruşu kuruşuna, grandTotal=subtotal+vatTotal ayrışmaz. Backend
`SaleItem` satırlarını bu dökümden yazar; ikinci implementasyon yok (CLAUDE.md).

### 2. Satış — tek transaction, clientSaleId ile idempotent

`create()` tek `withTenant` transaction'ında: pos-core hesap, `Sale`+kalemler+ödemeler, her kalem için
stok düşümü (`applyMovement SALE`, productId sırasıyla — kilit sırası), veresiye ise cari `DEBIT` (limit
kontrolü), nakit ise kasa hareketi, en son boşluksuz fiş no. `clientSaleId` (POS UUID) ile idempotent:
aynı id tekrar gelirse yeni satış açılmaz. `stock.low` event'i commit sonrası. `SaleItem.unitCost`
satış anındaki `averageCost`'tan dondurulur (COGS).

### 3. Boşluksuz fiş numarası — receipt_sequences satır kilidi (SEQUENCE değil)

`ReceiptSequence(tenantId, kind, lastValue)`; satış tx'i içinde `UPDATE ... SET lastValue=lastValue+1
RETURNING`. Satır kilidi eşzamanlı satışları serileştirir; rollback → numara tüketilmez (boşluksuz).
Postgres SEQUENCE kullanılmaz çünkü nextval rollback'te geri alınmaz. postgres-pro canlı 60-tx karışık
commit/rollback testiyle **kanıtladı**: sonuç tam `1..40`, sıfır boşluk/çakışma; RLS 4 erişim yolunda
da izole.

### 4. Vardiya — kasa hareketi defteri, kapanışta mutabakat

Vardiya açılışında `OPENING` hareketi (açılış nakiti). Beklenen = tüm kasa hareketlerinin toplamı
(açılış + nakit satış + tahsilat − gider − nakit iade ± manuel). Fark = sayılan − beklenen; eşiği
aşarsa uyarılır ama vardiya yine kapanır (atomik claim ile çift kapama engellenir). Kasa başına tek
açık vardiya.

### 5. İdempotency yarışı — P2002 idempotent kabul edilir (qa-expert P0)

Eşzamanlı aynı `clientSaleId`: ön-kontrol ikisinde de "yok" görür, ikinci INSERT `@@unique([tenantId,
clientSaleId])`'e takılır (P2002). Önceden bu `/sales`'te 409, `/sync/sales`'te sahte "error" dönüyordu
— offline POS satışı kaybetti sanabilirdi. → `create()` P2002'yi yakalayıp mevcut satışı idempotent
döndürür (meta.target driver adapter'da güvenilir olmadığı için kazanan satışın varlığıyla teyit).
Regresyon: 2 paralel istek → ikisi de 201, aynı satış, tek stok düşümü.

### 6. Yüksek indirim yetkisi park→tamamla ile atlanamaz (security-auditor)

`assertDiscountAllowed` yalnız `create`'te çağrılıyordu; kasiyer `park` (yüksek indirimle) → `complete`
ile `SALE_DISCOUNT_HIGH` kontrolünü atlayabiliyordu. → `park()` de çağırıyor. Ayrıca eşik artık
`max(oran)` değil satır+belge indiriminin **bileşik efektif oranı** (indirim tutarı/brüt) ile
karşılaştırılıyor — 10%+10% ≈ 19% eşiği aşabilir. Regresyon: kasiyer hem create hem park'ta %90 → 403.

### 7. Kredi limiti 0 = sıfır limit (qa-expert/security-auditor)

Kod `limit > 0` iken kontrol ediyordu (0 = limitsiz). Şema `Contact.creditLimit` "0 = limitsiz değil,
sıfır limit" diyor. → guard kaldırıldı: `newBalance > limit` her zaman kontrol edilir; 0 limit =
veresiye kapalı (SALE_CREDIT_OVER_LIMIT izni olan geçebilir). Regresyon: limitsiz (0) cariye kasiyer
veresiyesi → 400.

### 8. Fiş no kilidi transaction sonunda (postgres-pro + performance-engineer)

`sequence.next()` finalize()'ın İLK adımıydı; receipt_sequences satır kilidi stok döngüsü + cari + kasa
boyunca tutuluyor, tüm satışlar tenant başına serileşiyordu. → numara alımı finalize()'ın SON adımına
alındı; kilit yalnız ~2 round-trip tutulur, hâlâ tx içinde (gap-free korunur). İki ajan bağımsız aynı
düzeltmeyi önerdi.

---

## Doğrulama çıktıları

```
pnpm lint          12/12 ✓
pnpm typecheck     12/12 ✓
pnpm test          12/12 ✓  (pos-core 40, api 82: sale.e2e 19 + diğer)
pnpm build          8/8  ✓
pnpm format:check  ✓
```

Faz 6 doğrulama bloğu (e2e, gerçek Postgres):

- **100 eşzamanlı satış → fiş numaraları boşluksuz ve çakışmasız** (başarılı satışların receiptNo'ları
  tam ardışık dizi; postgres-pro canlı olarak da kanıtladı).
- **Aynı clientSaleId 3 kez (ardışık) + 2 kez (eşzamanlı) → tek satış, tek stok düşümü.**
- **Kredi limiti aşan veresiye (yetkisiz) → 400 CREDIT_LIMIT_EXCEEDED**; yetkili geçebilir.
- **pos-core coverage %100** (>%95 hedefi).

Ek e2e: parçalı ödeme (nakit+kart, kasaya yalnız nakit), veresiye-only (sıfır kasa hareketi), tam iade
→ RETURNED, kısmi iade → PARTIALLY_RETURNED, aşırı iade → 400, veresiye iptali cari borcu geri alır,
kapalı vardiyada iptal → 400 SESSION_CLOSED, park→tamamla, sync pull/push, vardiya kapanış beklenen/fark.

---

## Ajan bulguları

- **test-automator**: pos-core 25→40 test (per-line breakdown assertion'ları, scale-barcode/change
  kenar durumları — %100 kapsam korunuyor), sale e2e 9→13. Üretim bug'ı yok.
- **qa-expert**: senaryo matrisi; P0 eşzamanlı idempotency yarışı (karar #5), kredi limiti 0 semantiği
  (karar #7), iptal/iade test boşlukları → regresyon testleriyle kapatıldı.
- **postgres-pro**: boşluksuzluğu ve RLS izolasyonunu canlı testle KANITLADI; fiş no kilit süresi
  bulgusu (karar #8). Advisory lock bu kullanımda avantaj sağlamıyor.
- **performance-engineer**: satış yolu ~20-38 round-trip; hedef ölçekte 200ms rahat karşılanır. Tek
  gerçek kusur: fiş no kilit süresi (karar #8, düzeltildi). Stok döngüsü kalem başına 3 round-trip
  (bilinen ölçek notu).
- **security-auditor**: park→tamamla indirim bypass'ı (karar #6, YÜKSEK — düzeltildi) + bileşik indirim
  eşiği. Kredi limiti, RLS, tüm @Permissions kapsaması, cross-tenant izolasyonu SAĞLAM.

---

## Bilinen eksikler / sonraki fazlara

| Konu                                                              | Neden / karar                                                                         | Ne zaman        |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------- | --------------- |
| İade `refundMethod` orijinal ödeme yöntemiyle karşılaştırılmıyor  | Esnek iade kasıtlı (kasiyer yöntemi seçer); katı eşleme dayatılmadı                   | Gerektiğinde    |
| Stok döngüsü kalem başına 3 round-trip (toplu değil)              | Hedef sepet 1-5 kalem; toplu UPDATE kilit sırası/negatif stok dalını karmaşıklaştırır | Ölçek büyüyünce |
| Trailing audit + findOne ayrı transaction                         | Küçük gecikme; audit zaten hatayı yutuyor (asıl işlemi düşürmez)                      | Gerektiğinde    |
| `parseScaleBarcode` EAN-13 kontrol hanesini doğrulamıyor          | Terazi barkodları güvenilir; kontrol hanesi doğrulaması opsiyonel                     | Gerektiğinde    |
| Tartı barkod prefix eşleşmesi ilk-eşleşen kazanır (en uzun değil) | TenantSettings.scaleBarcodePrefixes sırası anlamlı — UX notu                          | Web UI          |
| creditLimit 0 = veresiye kapalı (opt-in kredi)                    | Varsayılan cari veresiye yapamaz; önce limit tanımlanmalı (schema kararı)             | —               |

---

## Sonraki faz için uyarılar

**Faz 7 (finans, raporlar, export, yasal adapter'lar)**

- Kâr raporu `SaleItem.unitCost` (dondurulmuş averageCost) kullanmalı — satış anındaki maliyet.
- Ödeme yöntemi dağılımı `SalePayment` (method, createdAt indeksleri hazır).
- Vardiya mutabakatı `CashSession.expectedAmount/differenceAmount` + `CashMovement` defterinden.
- Ekstre/rapor PDF: `pdfkit` ve `bwip-js` katalogda hazır (Faz 5'te ekstre PDF bilinçli ertelenmişti).
- Fiş yazdırma verisi `GET /sales/:id/receipt` (başlık/altlık `TenantSettings`).
