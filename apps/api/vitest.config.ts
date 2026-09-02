import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Nest DI'ı emitDecoratorMetadata'ya bağlı. Vite 8 (Rolldown) basit constructor
  // injection'da metadata'yı kendisi üretiyor gibi görünüyor, ama esbuild üretmiyor;
  // SWC bunu transform zincirinden bağımsız garanti altına alıyor.
  // Kaldırmadan önce @Inject() token, optional param ve circular dep senaryolarıyla
  // yeniden doğrula — Faz 0'da yalnız tek parametreli basit vaka test edildi.
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: {
    environment: 'node',
    globals: false,
    include: ['src/**/*.spec.ts', 'test/**/*.spec.ts'],
    setupFiles: ['reflect-metadata'],
  },
});
