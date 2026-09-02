# E2E testleri

- `web/` — Playwright + Chromium. Faz 8'den itibaren: giriş → ürün ekle → satış listele → rapor aç.
- `pos/` — Playwright Electron driver. Faz 12'den itibaren: giriş → vardiya aç → satış → offline satış → sync.

Faz 0'da bu dizinler bilerek boş; `pnpm test:e2e` çalışır ve "test yok" diyerek geçer.
