import { describe, expect, it } from 'vitest';

import type { Product } from './api-types';
import { isLowStock, isOutOfStock } from './stock-status';

function product(overrides: Partial<Product>): Product {
  return {
    id: 'p1',
    name: 'Test',
    code: null,
    categoryId: null,
    brandId: null,
    unitId: 'u1',
    salePrice: '10.00',
    vatRate: 20,
    stockQuantity: '0',
    criticalLevel: '0',
    trackStock: true,
    isWeighed: false,
    isActive: true,
    imageUrl: null,
    createdAt: '2026-09-03T00:00:00.000Z',
    barcodes: [],
    ...overrides,
  };
}

describe('isLowStock', () => {
  it('seviye tanımlı ve stok altındaysa kritiktir', () => {
    expect(isLowStock(product({ stockQuantity: '5', criticalLevel: '10' }))).toBe(true);
    expect(isLowStock(product({ stockQuantity: '10', criticalLevel: '10' }))).toBe(true);
  });

  it('seviye tanımsız ürün kritik DEĞİLDİR (sunucudaki kuralla aynı)', () => {
    expect(isLowStock(product({ stockQuantity: '0', criticalLevel: '0' }))).toBe(false);
  });

  it('stok seviyenin üstündeyse kritik değildir', () => {
    expect(isLowStock(product({ stockQuantity: '25', criticalLevel: '10' }))).toBe(false);
  });

  it('takipsiz ürün kritik olmaz', () => {
    expect(
      isLowStock(product({ trackStock: false, stockQuantity: '0', criticalLevel: '10' })),
    ).toBe(false);
  });
});

describe('isOutOfStock', () => {
  it('takipli ürünün stoğu sıfır veya altındaysa tükenmiştir', () => {
    expect(isOutOfStock(product({ stockQuantity: '0' }))).toBe(true);
    expect(isOutOfStock(product({ stockQuantity: '-2' }))).toBe(true);
    expect(isOutOfStock(product({ stockQuantity: '3' }))).toBe(false);
  });

  it('takipsiz ürün tükenmiş sayılmaz', () => {
    expect(isOutOfStock(product({ trackStock: false, stockQuantity: '0' }))).toBe(false);
  });
});
