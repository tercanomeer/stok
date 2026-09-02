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

  return new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
}
