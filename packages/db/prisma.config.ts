import path from 'node:path';

import { config as loadEnv } from 'dotenv';
import { defineConfig } from 'prisma/config';

// Prisma 7 .env'i kendiliğinden yüklemiyor; repo kökündeki .env'i biz yüklüyoruz.
loadEnv({ path: path.resolve(__dirname, '../../.env'), quiet: true });

export default defineConfig({
  schema: path.join('prisma', 'schema.prisma'),
  // Migration ve introspection komutlarının bağlantısı. Generate için gerekmiyor;
  // eksikse migrate komutları anlamlı bir hata ile durur.
  datasource: {
    url: process.env.DATABASE_URL ?? '',
  },
  migrations: {
    path: path.join('prisma', 'migrations'),
    seed: 'tsx prisma/seed.ts',
  },
});
