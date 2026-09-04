import path from 'node:path';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  root: path.resolve(import.meta.dirname, 'src'),
  // Electron üretimde `file://` ile yükler; mutlak yol (`/assets/...`) 404 verir.
  base: './',
  plugins: [react()],
  resolve: {
    alias: {
      '@shared': path.resolve(import.meta.dirname, 'electron/shared'),
    },
  },
  server: { port: 5173, strictPort: true },
  build: {
    outDir: path.resolve(import.meta.dirname, 'dist'),
    emptyOutDir: true,
  },
});
