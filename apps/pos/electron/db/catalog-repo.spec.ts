import { beforeEach, describe, expect, it } from 'vitest';

import { upsertProducts, type CachedProduct } from './cache-repo';
import { findByBarcode, findByScalePrefix, findProductById, searchProducts } from './catalog-repo';
import { openDatabase, type PosDatabase } from './database';

function product(overrides: Partial<CachedProduct> & { id: string }): CachedProduct {
  return {
    name: 'Ekmek',
    salePrice: '10.00',
    vatRate: 1,
    stockQuantity: '25',
    trackStock: true,
    isActive: true,
    unitId: 'u1',
    updatedAt: '2026-09-01T10:00:00.000Z',
    barcodes: [],
    ...overrides,
  };
}

let db: PosDatabase;

beforeEach(() => {
  db = openDatabase(':memory:');
  upsertProducts(db, [
    product({ id: 'p1', name: 'Tam buğday ekmek', barcodes: ['8690000000001'] }),
    product({ id: 'p2', name: 'Süt 1 L', barcodes: ['8690000000002', '8690000000012'] }),
    product({ id: 'p3', name: 'Pasif ürün', isActive: false, barcodes: ['8690000000003'] }),
    // Tartılı ürün: kayıtlı barkodun son 6 hanesi etiketle değişecek.
    product({ id: 'p4', name: 'Domates', barcodes: ['2700123000000'] }),
  ]);
});

describe('searchProducts', () => {
  it('boş sorguda aktif ürünleri ada göre verir', () => {
    const results = searchProducts(db, '');
    expect(results.map((item) => item.id)).toEqual(['p4', 'p2', 'p1']);
  });

  it('pasif ürünü HİÇ döndürmez', () => {
    expect(searchProducts(db, 'Pasif')).toHaveLength(0);
  });

  it('ada göre arar (büyük/küçük harf duyarsız)', () => {
    expect(searchProducts(db, 'süt').map((item) => item.id)).toEqual(['p2']);
  });

  it('barkod önekiyle arar', () => {
    expect(searchProducts(db, '869000000000').map((item) => item.id)).toContain('p1');
  });

  it('barkodu TAM eşleşen ürün listenin başına gelir', () => {
    // "8690000000002" hem p2'nin barkodu hem p2'nin ikinci barkodunun öneki.
    expect(searchProducts(db, '8690000000002')[0]?.id).toBe('p2');
  });

  it('LIKE jokeri arama metnine kaçırılır', () => {
    // Kaçırılmasa "%" tüm katalogu getirirdi.
    expect(searchProducts(db, '%')).toHaveLength(0);
  });

  it('barkodları tek sorguda getirir', () => {
    expect(searchProducts(db, 'Süt')[0]?.barcodes).toEqual(['8690000000002', '8690000000012']);
  });

  it('sonuç sayısını sınırlar', () => {
    expect(searchProducts(db, '', 2)).toHaveLength(2);
  });
});

describe('barkod eşleştirme', () => {
  it('tam barkod eşleşmesi ürünü bulur', () => {
    expect(findByBarcode(db, '8690000000001')?.id).toBe('p1');
  });

  it('bilinmeyen barkod null döner', () => {
    expect(findByBarcode(db, '0000000000000')).toBeNull();
  });

  it('tartılı barkod SABİT ilk 7 haneyle eşleşir', () => {
    // Etikette gömülü değer ve kontrol hanesi değişti; ürün yine bulunmalı.
    expect(findByScalePrefix(db, '2700123014500')?.id).toBe('p4');
    expect(findByScalePrefix(db, '2700123099998')?.id).toBe('p4');
  });

  it('farklı ürün kodu farklı ürüne gider', () => {
    expect(findByScalePrefix(db, '2700999014500')).toBeNull();
  });

  it('kimliğe göre ürün döner', () => {
    expect(findProductById(db, 'p2')?.name).toBe('Süt 1 L');
    expect(findProductById(db, 'yok')).toBeNull();
  });
});
