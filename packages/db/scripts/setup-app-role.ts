/**
 * Uygulama rolüne (stokk_app) giriş yetkisi ve parola verir.
 *
 * Rol migration'da NOLOGIN olarak açılıyor — parola koda yazılmaz (CLAUDE.md "Güvenlik").
 * Parola APP_DATABASE_URL içinden okunuyor, komut idempotent: her çalıştırmada
 * parolayı env'dekiyle eşitler.
 *
 * Sahip rolüyle (DATABASE_URL) bağlanır, çünkü ALTER ROLE yetkisi ona ait.
 */
import path from 'node:path';

import { config as loadEnv } from 'dotenv';
import { Client } from 'pg';

const APP_ROLE = 'stokk_app';

async function main(): Promise<void> {
  loadEnv({ path: path.resolve(__dirname, '../../../.env'), quiet: true });

  const ownerUrl = process.env.DATABASE_URL;
  const appUrl = process.env.APP_DATABASE_URL;

  if (!ownerUrl) throw new Error('DATABASE_URL tanımlı değil.');
  if (!appUrl) throw new Error('APP_DATABASE_URL tanımlı değil.');

  const parsed = new URL(appUrl);
  const password = decodeURIComponent(parsed.password);
  const username = decodeURIComponent(parsed.username);

  if (username !== APP_ROLE) {
    throw new Error(`APP_DATABASE_URL kullanıcısı "${APP_ROLE}" olmalı, "${username}" bulundu.`);
  }
  if (password.length < 12) {
    throw new Error('APP_DATABASE_URL parolası en az 12 karakter olmalı.');
  }

  const client = new Client({ connectionString: ownerUrl });
  await client.connect();

  try {
    // Parola literal olarak geçmek zorunda (ALTER ROLE parametre almıyor);
    // pg'nin literal escape'i ile enjeksiyona kapalı.
    const escaped = client.escapeLiteral(password);
    await client.query(`ALTER ROLE ${APP_ROLE} LOGIN PASSWORD ${escaped}`);
    console.warn(`[setup-app-role] ${APP_ROLE} rolüne giriş yetkisi verildi.`);
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  console.error('[setup-app-role] başarısız:', error);
  process.exitCode = 1;
});
