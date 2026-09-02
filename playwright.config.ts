import { defineConfig, devices } from '@playwright/test';

/**
 * Faz 0: projeler tanımlı, test dizinleri boş.
 * Web akışları Faz 8'den, Electron akışları Faz 12'den itibaren doldurulur.
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
      // Electron driver'ı Faz 12'de bağlanır; şimdilik yalnız proje tanımı.
    },
  ],
});
