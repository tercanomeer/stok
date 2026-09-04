import { beforeEach, describe, expect, it } from 'vitest';

import {
  countProducts,
  readPullCursor,
  readSettings,
  replaceProducts,
  saveSettings,
  upsertProducts,
  writePullCursor,
  type CachedProduct,
} from './cache-repo';
import { openDatabase, type PosDatabase } from './database';

function product(overrides: Partial<CachedProduct> = {}): CachedProduct {
  return {
    id: 'p1',
    name: 'Ekmek',
    salePrice: '10.00',
    vatRate: 1,
    stockQuantity: '25.000',
    trackStock: true,
    isActive: true,
    unitId: 'u1',
    updatedAt: '2026-09-01T10:00:00.000Z',
    barcodes: ['8690000000001'],
    ...overrides,
  };
}

describe('katalog önbelleği', () => {
  let db: PosDatabase;

  beforeEach(() => {
    db = openDatabase(':memory:');
  });

  it('ürünü ve barkodlarını yazar', () => {
    upsertProducts(db, [product()]);
    expect(countProducts(db)).toBe(1);
    const barcodes = db
      .prepare('SELECT value FROM product_barcodes WHERE product_id = ?')
      .all('p1') as { value: string }[];
    expect(barcodes).toEqual([{ value: '8690000000001' }]);
  });

  it('delta çekişte var olan ürünü günceller, kopya açmaz', () => {
    upsertProducts(db, [product()]);
    upsertProducts(db, [product({ name: 'Tam Buğday Ekmek', salePrice: '12.50' })]);

    expect(countProducts(db)).toBe(1);
    const row = db.prepare('SELECT name, sale_price AS salePrice FROM products').get() as {
      name: string;
      salePrice: string;
    };
    expect(row).toEqual({ name: 'Tam Buğday Ekmek', salePrice: '12.50' });
  });

  it('barkod listesi tam kümeyle değişir: kaldırılan barkod önbellekte kalmaz', () => {
    upsertProducts(db, [product({ barcodes: ['111', '222'] })]);
    upsertProducts(db, [product({ barcodes: ['222'] })]);

    const barcodes = db.prepare('SELECT value FROM product_barcodes ORDER BY value').all() as {
      value: string;
    }[];
    expect(barcodes).toEqual([{ value: '222' }]);
  });

  it('tam çekiş sunucuda silinen ürünü önbellekten düşürür', () => {
    upsertProducts(db, [product({ id: 'p1' }), product({ id: 'p2', name: 'Süt' })]);
    // Sunucu artık p2'yi göndermiyor (silinmiş): tam çekiş onu temizler.
    replaceProducts(db, [product({ id: 'p1' })]);

    expect(countProducts(db)).toBe(1);
    const remaining = db.prepare('SELECT id FROM products').all() as { id: string }[];
    expect(remaining).toEqual([{ id: 'p1' }]);
    // Barkodlar da birlikte gider — yetim satır kalmaz.
    const orphan = db
      .prepare('SELECT COUNT(*) AS total FROM product_barcodes WHERE product_id = ?')
      .get('p2') as { total: number };
    expect(orphan.total).toBe(0);
  });

  it('ayarları ve çekiş imlecini saklar', () => {
    saveSettings(
      db,
      {
        vatRates: [1, 10, 20],
        defaultVatRate: 20,
        scaleBarcodePrefixes: ['27'],
        currency: 'TRY',
        highDiscountThreshold: '10.00',
        negativeStockPolicy: 'WARN',
        receiptHeader: null,
        receiptFooter: null,
        receiptWidthMm: 80,
        autoPrintReceipt: true,
      },
      '2026-09-03T09:00:00.000Z',
    );
    expect(readSettings(db)?.defaultVatRate).toBe(20);

    expect(readPullCursor(db)).toBeNull();
    writePullCursor(db, '2026-09-03T09:00:00.000Z', '2026-09-03T09:00:01.000Z');
    expect(readPullCursor(db)).toBe('2026-09-03T09:00:00.000Z');
  });
});
