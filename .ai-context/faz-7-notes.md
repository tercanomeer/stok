# Faz 7 — Finans, raporlar, export, yasal adapter'lar

**Tarih:** 2026-09-02 · **Durum:** kapandı — doğrulama geçti, dört faz ajanının bulguları işlendi

---

## Ne eklendi

**API modülleri** `apps/api/src/modules/`

- `finance/` — gelir/gider + gider kategorileri. Nakit gider → kasadan çıkış (EXPENSE −),
  nakit gelir → kasaya giriş (DEPOSIT +); vardiya açıksa kasa hareketi yazılır (kapanış
  mutabakatına girer). Nakit-dışı yalnız kayıt.
- `reports/` — 10 rapor, ağır agregasyonlar `$queryRaw` ile: dashboard, sales (zaman serisi),
  profit, top-products, cashier-performance, hourly-density (ısı haritası), stock-value,
  contact-aging, payment-distribution, daily-shift. Maliyet/kâr yetki filtreli.
- `export/` — BullMQ rapor export'u (Excel `exceljs` / PDF `pdfkit`). `POST /exports` → jobId;
  worker raporu koşturur, dosyayı MinIO'ya yükler, `ExportJob` kaydını günceller; `GET /exports/:jobId`
  durum. Tenant bağlamı worker'da `runWithTenantContext` ile kurulur.
- `einvoice/` — `EInvoiceProvider` (createInvoice/getStatus/getPdf/cancel) + `MockEInvoiceProvider`;
  `OkcProvider` (sendSale/sendRefund/getDailyReport/ping) + `MockOkcProvider`; EInvoice durum akışı
  DRAFT → SENT → ACCEPTED/REJECTED (→ CANCELLED); satıştan e-belge (mükellef → E_FATURA, değilse
  E_ARŞİV; TenantSettings.eArchiveThreshold eşiği).

**Şema/migration** — `ExportJob` modeli (`export_jobs`) + RLS + `TENANT_SCOPED_MODELS`. (EInvoice,
Expense, Income, ExpenseCategory, eArchiveThreshold zaten Faz 1 şemasındaydı.)

---

## Alınan kararlar

### 1. Rapor veri şekli grafik-hazır (dataviz skill)

Her rapor JSON'u Faz 11'de besleyeceği grafiğin şekline göre: dashboard → stat tile; sales → çizgi
(zaman serisi); profit → çizgi/bar (ciro/maliyet/kâr); top-products → yatay bar; cashier → bar;
hourly-density → ısı haritası (haftagünü×saat hücreleri); stock-value → stat + kategori bar;
contact-aging → yığılı bar (4 kova); payment-distribution → pasta; daily-shift → tablo. Para string,
tarih ISO.

### 2. Ağır agregasyon $queryRaw, RLS + açık tenantId

Raporlar `withTenant` içinde `$queryRaw` ile koşar: RLS `app.tenant_id` filtresini DB'de zorlar;
ayrıca WHERE'e açık `tenantId` konur ki `(tenantId, tarih)` bileşik indeksleri kullanılsın. Sayılan
satış = iptal/park dışı (COMPLETED, PARTIALLY_RETURNED, RETURNED).

### 3. Maliyet/kâr yetki filtresi — iki katman

Kâr raporu ve stok değeri controller `@Permissions` (REPORT_PROFIT_VIEW / REPORT_STOCK_VIEW) +
servis-içi assert (REPORT_PROFIT_VIEW / PRODUCT_COST_VIEW) ile çift korumalı. dashboard `profit`
alanını yalnız yetkiliye EKLER (yetkisizde alan yanıtta yok, null/0 değil). top-products `profit`
alanı yalnız PRODUCT_COST_VIEW ile spread edilir. Export'ta rapor, ENQUEUE eden kullanıcının
izinleriyle koşar; yetkisiz profit export'u servis assert'iyle 403 → job FAILED, dosya ÜRETİLMEZ
(security-auditor kanıtladı).

### 4. Export BullMQ + ExportJob tablosu

Rapor export'u kalıcı `ExportJob` (PENDING→PROCESSING→COMPLETED/FAILED) + BullMQ. Worker aynı
süreçte (bu ölçekte ayrı worker gereksiz), `runWithTenantContext` ile tenant bağlamı kurar,
raporu koşturur, exceljs/pdfkit ile dosya üretir, `storage.uploadExport` ile MinIO'ya yükler,
fileUrl'i kaydeder. `StreamableFile` yanıtları (ekstre/e-fatura PDF) interceptor'da zarftan muaf.

### 5. Yasal adapter'lar interface arkasında, mock ile

`EInvoiceProvider` ve `OkcProvider` interface + Symbol token; modülde `useClass: Mock...`. Servis
yalnız soyutlamaya bağımlı — gerçek entegratör/ÖKC geldiğinde yalnız useClass değişir. Mock
deterministik: createInvoice → SENT, getStatus → ACCEPTED, getPdf → pdfkit ile gerçek PDF, cancel →
CANCELLED. Ağ/PII yok.

### 6. dashboard.profit iadeleri düşer (data-analyst bulgusu)

`profitTotals` (dashboard özeti) önce yalnız satış kalemlerini topluyordu; `profit()` raporu iadeleri
düşüyordu → iki değer tutarsızdı. → `profitTotals` de iadeleri düşer (aynı sold+returned CTE); özet
ve rapor artık aynı tanım.

### 7. contactAging toplu sorgu — N+1 transaction giderildi (performance/db-optimizer)

`contactAging` her cari için ayrı `ledger.aging()` çağırıyordu — 500 cari = 501 ayrı `withTenant`
transaction'ı (~2500 round-trip, 20'lik bağlantı havuzunu doyurup tüm API'yi geçici tıkayabilir).
→ FIFO kova algoritması saf `bucketAging` fonksiyonuna çıkarıldı; `agingForContacts` TEK findMany
ile tüm carilerin hareketlerini çekip bellekte kovalar. Ayrıca `aging()` sorgusuna açık `tenantId`
eklendi (yoksa `where:{contactId}` tüm tenant'ları seq-scan ediyordu — db-optimizer bulgusu); mevcut
`(tenantId, contactId, createdAt)` indeksi artık kullanılıyor, yeni indeks/migration gerekmedi.

---

## Doğrulama çıktıları

```
pnpm lint          12/12 ✓
pnpm typecheck     12/12 ✓
pnpm test          12/12 ✓  (api: sale/report/purchase/stock/auth e2e + birim)
pnpm build          8/8  ✓
pnpm format:check  ✓
```

Faz 7 doğrulama bloğu (e2e, gerçek Postgres):

- **100.000 satış seed'i (ham SQL) ile her rapor makul sürede** — DB seviyesinde ölçülen (EXPLAIN
  ANALYZE, database-optimizer/performance): en yavaş rapor ~62 ms, hepsi <1 s hedefinin çok altında.
- **Kasiyer token ile kâr raporu → 403; stok değeri → 403.**
- **Export job tamamlanır, indirilebilir dosya (fileUrl) üretir** (sales XLSX).
- **Mock e-fatura: DRAFT → SENT → ACCEPTED, PDF (%PDF) döner.**

---

## Ajan bulguları

- **data-analyst**: dashboard.profit ile profit raporu tutarsızdı (karar #6, düzeltildi). Dokümante
  edilenler: profit zaman serisinde satış soldAt / iade createdAt farklı kova; top-products miktar
  bazlı ve iadeler düşülmez; stockValue.saleValue = potansiyel ciro (gerçekleşen değil); contactAging
  500 cari cap; payment-distribution brüt satış ödemesi (iade dahil değil). Kod yorumlarına işlendi.
- **security-auditor**: KRİTİK açık YOK. Maliyet/kâr yetkisiz role sızmıyor — controller @Permissions
  - servis assert iki katman; export ikinci katman dosyayı engelliyor; cross-tenant RLS güvenli.
- **performance-engineer**: 9 zaman-aralıklı rapor <1s (worst ~62ms). Tek gerçek darboğaz contactAging
  N+1 transaction (karar #7, düzeltildi).
- **database-optimizer**: 10 raporun tamamı <1s. HIGH: contactAging N+1 (karar #7) + ContactTransaction
  `aging()` sorgusu tenantId'siz → cross-tenant seq scan (karar #7'de sorguya tenantId eklenerek
  giderildi, mevcut bileşik indeks kullanılıyor). hourly-density fonksiyonel ifade indekssiz ama
  ≤168 hücre, hedef ölçekte <1s — izlenir.

---

## Bilinen eksikler / sonraki fazlara

| Konu                                                           | Neden / karar                                                                            | Ne zaman        |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | --------------- |
| profit zaman serisi: satış soldAt / iade createdAt farklı kova | Muhasebe kabulü; toplamlar doğru, periyot kırılımında uzun-dönem iade kayabilir          | Gerektiğinde    |
| top-products iadeleri düşmez, miktar bazlı                     | "Gerçekleşen kâr" için profit raporu; Faz 11'de ciro bazlı ikinci metrik                 | Faz 11          |
| contact-aging en yüksek 500 cari                               | Kredi riski odağı; daha fazlası için sayfalama                                           | Faz 11          |
| payment-distribution brüt (iade ödeme kaydı yok)               | İadeler SalePayment değil kasa/cari hareketi; satış-anı ödeme dağılımı                   | Gerektiğinde    |
| hourly-density `AT TIME ZONE` indekssiz                        | ≤168 hücre, hedef ölçekte <1s; 500k+ satışta yeniden değerlendir                         | Ölçek büyüyünce |
| Export worker aynı süreçte (senkron rapor)                     | Bu ölçekte ayrı worker gereksiz; büyük export'ta ayrı worker                             | Ölçek büyüyünce |
| profit `returned` CTE gerçek iade hacmiyle EXPLAIN edilmedi    | Seed'de iade yoktu; plan yapısı sağlam (sale_returns indeksi), %5-10 iadeyle yeniden ölç | Gerektiğinde    |

---

## Sonraki faz için uyarılar

**Faz 8 (tasarım sistemi + web iskelet + giriş)**

- Rapor JSON şekilleri grafik-hazır (karar #1); Faz 11 grafikleri bu şekilleri tüketecek.
- Export indirme: `GET /exports/:jobId` → fileUrl (MinIO public URL); web indirme linki bunu kullanır.
- E-fatura PDF: `GET /e-invoices/:id/pdf` (StreamableFile). Fiş verisi `GET /sales/:id/receipt`.
- Para alanları JSON'da trailing-zero'suz gelebilir ("24"); web tarafı gösterimde formatlar
  (Intl.NumberFormat tr-TR), hesaplama yapmaz (hesap pos-core/backend'de).
