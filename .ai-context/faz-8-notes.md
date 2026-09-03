# Faz 8 — Tasarım sistemi + web iskelet + giriş ekranları

**Tarih:** 2026-09-03 · **Durum:** kapandı — doğrulama geçti, üç faz ajanının bulguları işlendi

---

## Ne eklendi

**`@stokk/ui` (packages/ui)** — web ve POS'un paylaşacağı sunum katmanı

- Tasarım token'ları `src/styles.css` (Tailwind 4 `@theme inline` + `.dark`): yüzey/mürekkep/
  kenar/marka/durum renkleri, yarıçap, gölge, tipografi. Marka = çam/zümrüt yeşili (para/güven),
  yüzey serin-nötr kırık beyaz, uyarı koyu kehribar. `@custom-variant dark` next-themes `class`
  stratejisiyle uyumlu. `tabular` sınıfı (para/miktar hizası) + global `:focus-visible` halkası.
- Bileşenler `src/components/`: `button` (cva varyant + loading), `input`, `label`, `field`
  (render-prop: id/aria-describedby/hata bağlaması), `select` (yerel), `card`, `badge`, `spinner`,
  `table`, `dialog` (yerel `<dialog>` — odak tuzağı/Esc yerleşik), `toast` (aria-live sağlayıcı),
  `empty-state`. Hepsi token tabanlı, framework/veri bağımlılığı YOK.
- Yardımcılar `src/lib/`: `cn` (clsx+tailwind-merge), `format` (para `tr-TR`/TRY, tarih `date-fns`+tr,
  miktar/yüzde/sayaç — yalnız gösterim, hesap yok).
- Testler: format birim (7) + Button render (2) + entry (1) = 11.

**`apps/web` (Next.js App Router)**

- Route grupları: `(auth)` (bölünmüş marka paneli + form) ve `(dashboard)` (sidebar+topbar+guard).
- Veri katmanı `lib/api.ts`: axios instance + interceptor'lar — request'te Bearer, response'ta 401'de
  **tek-uçuş (single-flight) sessiz refresh** + orijinal isteği tekrar; yalnız refresh'in kendisi
  ölürse `forceLogout`. Zarf açan `apiGet/apiPost/apiPostVoid` + `apiErrorMessage`.
- Auth store `stores/auth-store.ts` (zustand + persist, `skipHydration` → Providers'ta mount'ta
  rehydrate; SSR mismatch yok). İzin: `lib/permissions.ts` + `<Can>`.
- Kabuk: `app-sidebar` (izne göre filtrelenmiş menü), `app-topbar` (kırıntı + vardiya durumu + tema +
  kullanıcı menüsü), `breadcrumbs`, `user-menu` (yerel `<details>`), `theme-toggle` (açık/koyu/sistem),
  `route-guard` (oturum yoksa /login, flash yok), `auth-redirect` (oturum açıksa /login → panel).
- Form altyapısı: react-hook-form + zod resolver (`lib/auth-schemas.ts`) + `Field` + `FormBanner`.
- Ekranlar: giriş, kayıt (işletme+patron), şifremi unuttum, şifre sıfırlama (token URL'den, Suspense).
- Dashboard: stat tile'lar (ciro, kâr?/açık vardiya nakiti, satış adedi, kritik stok — yetkiye göre),
  saatlik ciro grafiği (SVG tek-seri bar, dataviz), son satışlar tablosu; boş/yükleniyor/hata durumları.
- Kök: `layout` (IBM Plex Sans `next/font`, Providers), `error`/`loading`/`not-found`.

---

## Alınan kararlar

### 1. Tasarım dili (frontend-design skill)

Stokk = esnaf defteri/kasası. Marka çam-yeşili (#0f6b4f), tek gövde ailesi **IBM Plex Sans**
(Türkçe ş/ğ/ı/İ + tabular rakam — ledger karakteri), ölçülü: gölge yalnız kabartılmış kartta,
kenarlık hiyerarşiyi taşır, gradyan/allcaps/`→`/monospace-etiket yok. Cesaret tek yerde: marka
yeşili + büyük tabular para. Jenerik AI-tell'lerinden kaçınıldı (cream+terrakota, near-black+acid,
broadsheet, tek-yarıçap kart kiti, `A · B · C` orta-nokta dizisi).

### 2. Sessiz refresh — kullanıcı token dolunca DÜŞMEZ

`api.ts` response interceptor: 401 → `refreshPromise ??= runRefresh()` (tek uçuş, eşzamanlı 401'ler
paylaşır) → yeni token'la `api.request(original)`. `_retry` + `isAuthCall` guard'ı sonsuz döngüyü,
`runRefresh` çıplak axios kullanımı özyinelemeyi keser. Refresh de ölmüşse `forceLogout` → /login.
Ağ hatasında (response yok) refresh/logout tetiklenmez — kesintide kullanıcı düşmez.

### 3. İzne göre filtrelenen menü

`app-sidebar`: `NAV_ITEMS.filter(!perm || permissions.includes(perm))` — izni olmayan öğe DOM'a hiç
render EDİLMEZ (görünürlük değil, yokluk). `<Can>` ve `usePermission` aynı `includes` mantığı.
Panel herkese açık; diğer ekranlar Faz 9–11'de geleceği için `soon` ile pasif ("Yakında").

### 4. shadcn yerine yerel primitive'ler (radix'siz)

Dialog=yerel `<dialog>` (odak tuzağı/Esc/`::backdrop` tarayıcıdan), Select=yerel `<select>`,
Toast=özel aria-live bölgesi, tema=next-themes. Radix/sonner eklenmedi → daha az bağımlılık,
erişilebilirlik varsayılan-güvenli. Component API'si shadcn'e denk (button/input/field/... `@stokk/ui`).

### 5. Tema — SSR uyumlu

next-themes `attribute="class"` + `.dark` token blokları. Store `skipHydration:true`, rehydrate
mount'ta Providers effect'inde — sunucu/istemci ilk render'ı eşit, hydration mismatch yok.
theme-toggle `mounted` kapısıyla ikon ilk render'da sabit.

---

## Doğrulama çıktıları

```
pnpm build          8/8  ✓
pnpm lint          12/12 ✓
pnpm typecheck     12/12 ✓
pnpm test          12/12 ✓  (api 92, pos-core 40, ui 11, types 8, web 3, db 3)
pnpm format:check  ✓
```

- Giriş ekranı gerçek prod build'de tarayıcıda render edildi (screenshot ile görsel doğrulama):
  bölünmüş marka paneli, IBM Plex Sans, Field/Input/Button, marka butonu — tasarım planına uygun.
- Not: `pnpm test` ilk turda Docker kapalıyken api e2e (DB/Redis) düşmüştü; Docker açılınca api 92/92.
  Paylaşılan Postgres'te turbo tam-paralel yükünde bir kez flaky deadlock görüldü (eşzamanlılık
  stres testi, retry'lı) — bağımsız ve ikinci tam çalıştırmada 12/12 yeşil.

## Faz 8 doğrulama bloğu (plan)

- **Giriş → dashboard; token dolunca sessiz refresh, kullanıcı düşmüyor** — kod yolu ui-ux ajanı ile
  doğrulandı (tek uçuş + retry + yalnız refresh ölünce logout); mantık sağlam.
- **Yetkisiz menü öğeleri sidebar'da görünmüyor** — filtre izinsiz öğeyi hiç render etmiyor.
- **Koyu/açık tema, klavyeyle tam gezinme** — tema döngüsü + `.dark` token'ları; klavye/odak a11y ajanı
  ile doğrulandı (global focus-visible, native dialog/select/details, tüm ikon-butonlarda aria-label).

---

## Ajan bulguları

- **accessibility-tester** — 3 kontrast/ARIA bulgusu, hepsi DÜZELTİLDİ (WCAG oranları hesaplanarak,
  "eyeball değil ölç"): `warning` #b7791f→#8a5a12 (warning-weak üstü 3.2→5.2:1), `ink-subtle` açık
  #8b938e→#6c736e (3.0→4.7:1), koyu #6a746f→#7b857e (3.9→5.0:1); `user-menu` summary'e
  `aria-label="Kullanıcı menüsü"`. Geçen alanlar teyit: focus-visible, native dialog/select klavye,
  Field aria bağlama, toast aria-live, grafik sr-only tablo, ikon-buton etiketleri. Brand buton 6.5:1
  (AA ✓, AAA değil) — kabul.
- **code-reviewer** (sınır) — kritik ihlal YOK. `@stokk/ui`'de iş mantığı/yasak framework importu yok.
  DÜZELTİLDİ: `@stokk/ui`'den kullanılmayan `@stokk/types` bağımlılığı kaldırıldı (ölü dep). axios
  single-flight ve auth-store persist/SSR "sağlam" onaylandı. `FormBanner`/`BrandMark` ui'ye ADAY
  ama bugün yalnız web kullanıyor → CLAUDE.md "ileriki faz işini hazırda yazma" gereği taşınmadı
  (POS formları Faz 13'te gelince taşınır — bkz. bilinen eksik).
- **ui-ux-tester** (akış) — akış KIRAN hata YOK. Giriş→dashboard, sessiz refresh, izin filtresi, route
  guard (flash yok), tema, boş/yükleniyor/hata durumları hepsi doğru. DÜZELTİLDİ: oturum açık kullanıcı
  /login'de takılmasın diye `AuthRedirect`; `isAuthCall` savunma katmanına açıklayıcı yorum.

---

## Bilinen eksikler / sonraki fazlara

| Konu                                                       | Neden / karar                                                                 | Ne zaman |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------- | -------- |
| Mobil gezinme çekmecesi yok (sidebar <lg gizli)            | Panel çoğunlukla masaüstü/back-office; sayfalar responsive, menü çekmecesi    | Faz 9+   |
| `FormBanner`/`BrandMark` `@stokk/ui`'ye taşınmadı          | Bugün yalnız web kullanıyor; POS gelince paylaşılan primitive'e alınır        | Faz 13   |
| Menü izin filtresinin görsel kanıtı sınırlı (hepsi `soon`) | Ekranlar Faz 9–11'de gelecek; filtre kodda doğru, gözle fark ekranlarla net   | Faz 9–11 |
| hourly-chart bucket'ı `parseFloat` ile toplar (gösterim)   | Backend zaten Decimal→string bucket veriyor; parseFloat yalnız çubuk/gösterim | —        |
| Canlı tam-yığın (Nest+web) tarayıcı E2E'si yapılmadı       | Login görsel + ajan statik akış denetimi yeterli; Playwright E2E sonraki adım | Sonra    |
| favicon.ico yok (404)                                      | İskelet; marka favicon'u eklenecek                                            | Faz 9    |

---

## Sonraki faz için uyarılar

**Faz 9 (web: ürün & stok ekranları)**

- Ekran eklerken `nav.ts`'te ilgili öğenin `soon: true`'sunu kaldır (menüde aktif olur).
- Ortak liste/tablo/sayfalama, filtre çubuğu, form deseni bu iskeletin üstüne kurulur:
  `@stokk/ui` primitive'leri + `Field`/`FormBanner` + TanStack Query + `apiGet/apiPost`.
- Para/miktar API'den STRING gelir; gösterimde `formatMoney`/`formatQuantity` kullan, hesap yapma.
- Yeni jenerik bileşen (hem web hem POS kullanacaksa) `@stokk/ui`'ye; tek uygulamaya özgü uygulamada.
- Koruma: sayfa yetkisi `<Can>` + sunucu `@Permissions` (çift katman); menüde gizlemek tek başına
  güvenlik değil.
