import { defineConfig, devices } from '@playwright/test';

/**
 * `pos` projesi Electron sürücüsüyle çalışır: kendi tarayıcısını açtığı için
 * `devices[...]` almaz ve tek tek koşar — iki Electron örneği aynı kasa verisine
 * dokunursa testler birbirini bozar.
 *
 * Önkoşul (pos): `pnpm --filter @stokk/pos build` + ayakta API. API yoksa testler
 * atlanır.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: process.env.APP_URL ?? 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'web',
      testDir: './e2e/web',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'pos',
      testDir: './e2e/pos',
      fullyParallel: false,
      workers: 1,
      // Electron açılışı + tam katalog çekişi 5 sn'yi rahat aşıyor.
      timeout: 180_000,
    },
  ],
});
