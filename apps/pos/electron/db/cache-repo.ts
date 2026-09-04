import { type PosDatabase, readMeta, writeMeta } from './database';
import type { PosSettings } from '../shared/ipc-contracts';

/** Sunucudan gelen ürün aynasının POS'ta tutulan alanları. Para/miktar STRING. */
export interface CachedProduct {
  id: string;
  name: string;
  salePrice: string;
  vatRate: number;
  stockQuantity: string;
  trackStock: boolean;
  isActive: boolean;
  unitId: string;
  updatedAt: string;
  barcodes: string[];
}

/** POS'un ihtiyaç duyduğu tenant ayarları (sync/pull `settings` alanı). */
export type CachedSettings = PosSettings;

const PULL_CURSOR_KEY = 'sync.pullCursor';
const LAST_PULL_KEY = 'sync.lastPullAt';

/**
 * Delta çekişin sonucu: yalnız değişenleri yazar.
 * Barkodlar ürün başına tam kümeyle DEĞİŞTİRİLİR (sunucu tam listeyi gönderir).
 */
export function upsertProducts(db: PosDatabase, products: readonly CachedProduct[]): number {
  const upsertProduct = db.prepare(`
    INSERT INTO products (id, name, sale_price, vat_rate, stock_quantity, track_stock, is_active, unit_id, updated_at)
    VALUES (@id, @name, @salePrice, @vatRate, @stockQuantity, @trackStock, @isActive, @unitId, @updatedAt)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      sale_price = excluded.sale_price,
      vat_rate = excluded.vat_rate,
      stock_quantity = excluded.stock_quantity,
      track_stock = excluded.track_stock,
      is_active = excluded.is_active,
      unit_id = excluded.unit_id,
      updated_at = excluded.updated_at
  `);
  const clearBarcodes = db.prepare('DELETE FROM product_barcodes WHERE product_id = ?');
  const insertBarcode = db.prepare(
    'INSERT OR IGNORE INTO product_barcodes (product_id, value) VALUES (?, ?)',
  );

  const run = db.transaction((rows: readonly CachedProduct[]) => {
    for (const product of rows) {
      upsertProduct.run({
        id: product.id,
        name: product.name,
        salePrice: product.salePrice,
        vatRate: product.vatRate,
        stockQuantity: product.stockQuantity,
        trackStock: product.trackStock ? 1 : 0,
        isActive: product.isActive ? 1 : 0,
        unitId: product.unitId,
        updatedAt: product.updatedAt,
      });
      clearBarcodes.run(product.id);
      for (const value of product.barcodes) insertBarcode.run(product.id, value);
    }
  });

  run(products);
  return products.length;
}

/**
 * Tam çekiş (açılış): önce sil, sonra yaz.
 *
 * Sunucu silinen ürün için mezar taşı GÖNDERMEZ — `/sync/pull` yalnız `deletedAt IS NULL`
 * olanları döner. Bu yüzden silinenler ancak tam çekişte önbellekten düşer; delta çekiş
 * tek başına yeterli değildir, açılış çekişi bu yüzden tam yapılır.
 */
export function replaceProducts(db: PosDatabase, products: readonly CachedProduct[]): number {
  const run = db.transaction((rows: readonly CachedProduct[]) => {
    db.prepare('DELETE FROM product_barcodes').run();
    db.prepare('DELETE FROM products').run();
    upsertProducts(db, rows);
  });
  run(products);
  return products.length;
}

export function countProducts(db: PosDatabase): number {
  const row = db.prepare('SELECT COUNT(*) AS total FROM products').get() as { total: number };
  return row.total;
}

export function saveSettings(db: PosDatabase, settings: CachedSettings, now: string): void {
  db.prepare(
    `INSERT INTO settings_cache (id, payload, updated_at) VALUES (1, ?, ?)
     ON CONFLICT(id) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at`,
  ).run(JSON.stringify(settings), now);
}

export function readSettings(db: PosDatabase): CachedSettings | null {
  const row = db.prepare('SELECT payload FROM settings_cache WHERE id = 1').get() as
    { payload: string } | undefined;
  if (!row) return null;
  return JSON.parse(row.payload) as CachedSettings;
}

/** Bir sonraki delta çekişin başlangıç anı — sunucunun bildirdiği `serverTime`. */
export function readPullCursor(db: PosDatabase): string | null {
  return readMeta(db, PULL_CURSOR_KEY);
}

export function writePullCursor(db: PosDatabase, serverTime: string, completedAt: string): void {
  writeMeta(db, PULL_CURSOR_KEY, serverTime);
  writeMeta(db, LAST_PULL_KEY, completedAt);
}

export function readLastPullAt(db: PosDatabase): string | null {
  return readMeta(db, LAST_PULL_KEY);
}
