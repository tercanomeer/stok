import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from './generated/prisma/client';

/**
 * Prisma 7'de bağlantı URL'i şemada değil, runtime'da driver adapter ile veriliyor.
 * Tüm uygulamalar client'ı buradan alır; ikinci bir yerde `new PrismaClient()` yazılmaz.
 */
export function createPrismaClient(databaseUrl: string): PrismaClient {
  if (!databaseUrl) {
    throw new Error('DATABASE_URL boş — Prisma client oluşturulamaz.');
  }

  // pg.Pool URL'deki `connection_limit`'i OKUMAZ (yalnız `max` seçeneğine bakar).
  // URL'den ayrıştırıp açıkça geçiyoruz — aksi halde havuz sessizce varsayılan 10'da kalır.
  const parsedMax = Number(new URL(databaseUrl).searchParams.get('connection_limit'));
  const max = Number.isInteger(parsedMax) && parsedMax > 0 ? parsedMax : undefined;

  return new PrismaClient({
    adapter: new PrismaPg({ connectionString: databaseUrl, ...(max ? { max } : {}) }),
  });
}
