# E2E testleri

- `web/` — Playwright + Chromium. Faz 8'den itibaren: giriş → ürün ekle → satış listele → rapor aç.
- `pos/` — Playwright Electron driver: sunucu kurulumu → giriş → kasa seç → vardiya aç, preload
  yüzeyinin sertliği, çevrimdışı giriş ve ağ döndüğünde katalog tazelenmesi.

## `pos` projesini çalıştırma

```bash
docker compose up -d                       # postgres + redis
pnpm --filter @stokk/api start             # API :3001 (ya da `dev`)
pnpm --filter @stokk/pos build             # dist/ + dist-electron/ ŞART
pnpm exec playwright test --project=pos
```

Notlar:

- Testler her açılışta izole bir `--user-data-dir` kullanır; çevrimdışı testi aynı dizini
  ikinci kez açarak "aynı kasa yeniden başlatıldı" durumunu kurar.
- Ağ kesintisi `support/gate-proxy.ts` ile taklit edilir: POS doğrudan API'ye değil
  kapatılabilir bir vekile bağlanır, `close()` bağlantıyı düşürür.
- API ayakta değilse testler **atlanır** (`support/api.ts` → `apiReachable`); sessizce
  geçmez, atlandığı raporda görünür.
- `pos` projesi tek worker ile koşar: iki Electron örneği aynı kasa verisine dokunmamalı.
- Testler tek tenant paylaşır ve kasada açık vardiya bırakır; akış yardımcısı bu yüzden
  "vardiya aç" ile "zaten açık, hazır ekranı" dallarının ikisini de karşılar.
