import { defineConfig } from 'vitest/config';

/**
 * POS testleri main process kodunu hedefler: SQLite deposu, kuyruk, sync ve kimlik.
 * Node ortamında koşarlar — `electron` modülüne bağlı dosya import EDİLMEZ
 * (servisler bağımlılıklarını dışarıdan alır, bu yüzden test edilebilirler).
 *
 * Not: `vite.config.mts` root'u `src` yaptığı için ayrı config; aksi hâlde
 * electron/ altındaki testler bulunmaz.
 */
export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    include: ['electron/**/*.spec.ts', 'src/**/*.spec.ts'],
  },
});
