/**
 * @stokk/db — Prisma client'ın tek çıkış noktası.
 *
 * Tüketiciler generated dizine doğrudan bakmaz; her şey buradan re-export edilir.
 * Böylece generator çıktısının yeri değişirse tek dosya güncellenir.
 */
export * from './generated/prisma/client';
export { createPrismaClient } from './client';
