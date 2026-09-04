import { beforeEach, describe, expect, it } from 'vitest';

import { CatalogService } from './catalog-service';
import { saveSettings, upsertProducts, type CachedProduct } from '../db/cache-repo';
import { openDatabase, type PosDatabase } from '../db/database';

const NOW = '2026-09-04T10:00:00.000Z';

function product(overrides: Partial<CachedProduct> & { id: string }): CachedProduct {
  return {
    name: 'Ürün',
    salePrice: '10.00',
    vatRate: 1,
    stockQuantity: '25',
    trackStock: true,
    isActive: true,
    unitId: 'u1',
    updatedAt: NOW,
    barcodes: [],
    ...overrides,
  };
}

function withPrefixes(db: PosDatabase, prefixes: string[]): void {
  saveSettings(
    db,
    {
      vatRates: [1, 10, 20],
      defaultVatRate: 20,
      scaleBarcodePrefixes: prefixes,
      currency: 'TRY',
      highDiscountThreshold: '10.00',
      negativeStockPolicy: 'WARN',
      receiptHeader: null,
      receiptFooter: null,
      receiptWidthMm: 80,
      autoPrintReceipt: true,
    },
    NOW,
  );
}

let db: PosDatabase;
let catalog: CatalogService;

beforeEach(() => {
  db = openDatabase(':memory:');
  catalog = new CatalogService(db);
  upsertProducts(db, [
    product({ id: 'p1', name: 'Ekmek', barcodes: ['8690000000001'] }),
    product({ id: 'p4', name: 'Domates', salePrice: '40.00', barcodes: ['2700123000000'] }),
    // Tartı prefix'iyle başlayan ama tartılı OLMAYAN normal barkod.
    product({ id: 'p5', name: 'İthal ürün', barcodes: ['2712345678901'] }),
  ]);
});

describe('CatalogService.scan', () => {
  it('tam barkod eşleşmesinde miktar barkoddan OKUNMAZ', () => {
    withPrefixes(db, ['27']);

    const result = catalog.scan('8690000000001');
    expect(result.product?.id).toBe('p1');
    expect(result.quantity).toBeNull();
    expect(result.scale).toBe(false);
    expect(result.barcode).toBe('8690000000001');
  });

  it('tartı prefix’iyle başlayan NORMAL barkod tartılı sanılmaz', () => {
    // Tam eşleşme önce denendiği için p5 doğru ürün olarak dönüyor ve miktar
    // barkoddan uydurulmuyor.
    withPrefixes(db, ['27']);

    const result = catalog.scan('2712345678901');
    expect(result.scale).toBe(false);
    expect(result.product?.id).toBe('p5');
    expect(result.quantity).toBeNull();
  });

  it('tartılı barkoddan AĞIRLIK okunur, fiyat katalogdan gelir', () => {
    withPrefixes(db, ['27']);

    // 2700123 + 00750 (gram) + kontrol → 0.750 kg
    const result = catalog.scan('2700123007505');
    expect(result.scale).toBe(true);
    expect(result.quantity).toBe('0.750');
    expect(result.product?.id).toBe('p4');
    expect(result.product?.salePrice).toBe('40.00');
  });

  it('tartı prefix listesi boşsa ayrıştırma kapalıdır', () => {
    withPrefixes(db, []);

    expect(catalog.scan('2700123007505')).toMatchObject({ product: null, scale: false });
  });

  it('ayar hiç gelmemişse çökmez', () => {
    expect(catalog.scan('2700123007505')).toMatchObject({ product: null, scale: false });
  });

  it('tartılı barkod tanınır ama ürün yoksa scale=true, product=null', () => {
    withPrefixes(db, ['27']);

    const result = catalog.scan('2709999007505');
    expect(result.scale).toBe(true);
    expect(result.product).toBeNull();
  });

  it('bilinmeyen barkodda ürün null döner', () => {
    withPrefixes(db, ['27']);
    expect(catalog.scan('0000000000000').product).toBeNull();
  });

  it('barkodun başındaki/sonundaki boşluk temizlenir', () => {
    expect(catalog.scan('  8690000000001  ').product?.id).toBe('p1');
  });
});

describe('CatalogService — arama ve ayarlar', () => {
  it('ayar yoksa null döner', () => {
    expect(catalog.settings()).toBeNull();
  });

  it('ayarları önbellekten okur', () => {
    withPrefixes(db, ['27', '28']);
    expect(catalog.settings()?.scaleBarcodePrefixes).toEqual(['27', '28']);
  });

  it('arama yerel önbellekten çalışır', () => {
    expect(catalog.search('domates').map((item) => item.id)).toEqual(['p4']);
  });
});
