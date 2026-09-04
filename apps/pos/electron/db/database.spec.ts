import { describe, expect, it } from 'vitest';

import { migrate, openDatabase, readMeta, writeMeta } from './database';
import { MIGRATIONS } from './schema';

describe('yerel depo', () => {
  it('şemayı kurar ve migration sürümünü işaretler', () => {
    const db = openDatabase(':memory:');
    // Sürüm, uygulanan migration SAYISIDIR; listeye yeni madde eklendikçe artar.
    expect(db.pragma('user_version', { simple: true })).toBe(MIGRATIONS.length);

    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all() as { name: string }[];
    const names = tables.map((table) => table.name);
    for (const expected of [
      'products',
      'product_barcodes',
      'settings_cache',
      'local_sales',
      'local_sale_items',
      'local_payments',
      'sync_queue',
      'sessions',
      'parked_sales',
      'meta',
    ]) {
      expect(names).toContain(expected);
    }
    db.close();
  });

  it('ikinci kez çalıştırıldığında hiçbir şey yapmaz', () => {
    const db = openDatabase(':memory:');
    expect(() => migrate(db)).not.toThrow();
    expect(db.pragma('user_version', { simple: true })).toBe(MIGRATIONS.length);
    db.close();
  });

  it('meta anahtarlarını yazar ve okur', () => {
    const db = openDatabase(':memory:');
    expect(readMeta(db, 'yok')).toBeNull();
    writeMeta(db, 'k', 'v1');
    writeMeta(db, 'k', 'v2');
    expect(readMeta(db, 'k')).toBe('v2');
    db.close();
  });

  it('yabancı anahtar kısıtı açık: satışsız kalem yazılamaz', () => {
    const db = openDatabase(':memory:');
    expect(() =>
      db
        .prepare(
          `INSERT INTO local_sale_items
             (id, sale_id, product_id, name, quantity, unit_price, vat_rate, line_total, sort_order)
           VALUES ('i1', 'olmayan-satis', 'p1', 'Ürün', '1', '10.00', 20, '10.00', 0)`,
        )
        .run(),
    ).toThrow();
    db.close();
  });
});
