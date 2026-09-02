import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.spec.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.spec.ts', 'src/contracts.ts'],
      // CLAUDE.md / 03-mimari.md: para hesabının tek doğruluk kaynağı.
      // Eşik Faz 6'da gerçek hesaplama gelince %95'e çekilir.
      thresholds: { lines: 90, functions: 90, branches: 90, statements: 90 },
    },
  },
});
