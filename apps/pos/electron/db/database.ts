import fs from 'node:fs';
import path from 'node:path';

import SqliteDatabase from 'better-sqlite3';

import { MIGRATIONS } from './schema';

export type PosDatabase = SqliteDatabase.Database;

/**
 * Yerel depoyu açar ve şemayı günceller.
 *
 * WAL: kasa uygulaması satış yazarken arka plandaki sync döngüsü aynı anda okur —
 * rollback journal'da okur yazarı bloklar, WAL'da bloklamaz. `synchronous = NORMAL`
 * WAL ile birlikte güvenli: elektrik kesintisinde son commit'ler kaybolabilir ama
 * veritabanı bozulmaz; satış yazımı her seferinde disk fsync'i beklemez.
 */
export function openDatabase(file: string): PosDatabase {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });

  const db = new SqliteDatabase(file);
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  migrate(db);
  return db;
}

/** Eksik migration'ları sırayla uygular. Her migration kendi transaction'ında. */
export function migrate(db: PosDatabase): number {
  const row = db.pragma('user_version', { simple: true });
  const current = typeof row === 'number' ? row : 0;

  for (let version = current; version < MIGRATIONS.length; version += 1) {
    const sql = MIGRATIONS[version];
    if (sql === undefined) continue;
    db.transaction(() => {
      db.exec(sql);
      // pragma parametre bağlamayı desteklemiyor; değer sabit tam sayı.
      db.pragma(`user_version = ${String(version + 1)}`);
    })();
  }

  return MIGRATIONS.length;
}

/** `meta` tablosundaki anahtar/değer çiftleri — sync imleci gibi küçük durumlar. */
export function readMeta(db: PosDatabase, key: string): string | null {
  const row = db.prepare('SELECT value FROM meta WHERE key = ?').get(key) as
    { value: string } | undefined;
  return row?.value ?? null;
}

export function writeMeta(db: PosDatabase, key: string, value: string): void {
  db.prepare(
    'INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
  ).run(key, value);
}
