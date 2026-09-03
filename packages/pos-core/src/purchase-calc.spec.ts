import { describe, expect, it } from 'vitest';

import { PosCoreError } from './money';
import {
  calculatePurchaseBreakdown,
  calculatePurchaseTotals,
  purchaseUnitCost,
} from './purchase-calc';

describe('calculatePurchaseBreakdown', () => {
  it('KDV matrahın ÜSTÜNE eklenir (alışta birim fiyat KDV hariç)', () => {
    const { lines, totals } = calculatePurchaseBreakdown({
      lines: [{ productId: 'p1', quantity: '10', unitPrice: '100.00', vatRate: 20 }],
    });
    expect(lines[0]?.lineTotal).toBe('1000.00');
    expect(lines[0]?.vatAmount).toBe('200.00');
    expect(lines[0]?.lineGrandTotal).toBe('1200.00');
    expect(totals).toEqual({
      subtotal: '1000.00',
      discountTotal: '0.00',
      vatTotal: '200.00',
      grandTotal: '1200.00',
    });
  });

  it('iskonto matrahtan düşülür, KDV iskontolu matrahtan hesaplanır', () => {
    const { lines, totals } = calculatePurchaseBreakdown({
      lines: [
        { productId: 'p1', quantity: '10', unitPrice: '100.00', discountRate: '10', vatRate: 20 },
      ],
    });
    expect(lines[0]?.lineTotal).toBe('900.00');
    expect(lines[0]?.vatAmount).toBe('180.00');
    expect(lines[0]?.discountAmount).toBe('100.00');
    expect(totals.discountTotal).toBe('100.00');
    expect(totals.grandTotal).toBe('1080.00');
  });

  it('çok kalemli faturada toplamlar satırların toplamıdır', () => {
    const totals = calculatePurchaseTotals({
      lines: [
        { productId: 'p1', quantity: '3', unitPrice: '12.50', vatRate: 10 },
        { productId: 'p2', quantity: '2', unitPrice: '7.25', discountRate: '5', vatRate: 20 },
      ],
    });
    // 3*12.50 = 37.50 KDV 3.75 · 2*7.25 = 14.50 → %5 iskonto 13.775 → 13.78 KDV 2.76
    expect(totals.subtotal).toBe('51.28');
    expect(totals.vatTotal).toBe('6.51');
    expect(totals.grandTotal).toBe('57.79');
    expect(totals.discountTotal).toBe('0.72');
  });

  it('kuruş yuvarlaması yarıyı yukarı yapar', () => {
    const { lines } = calculatePurchaseBreakdown({
      lines: [{ productId: 'p1', quantity: '1', unitPrice: '10.005', vatRate: 0 }],
    });
    expect(lines[0]?.lineTotal).toBe('10.01');
  });

  it('boş fatura reddedilir', () => {
    expect(() => calculatePurchaseBreakdown({ lines: [] })).toThrow(PosCoreError);
  });

  it('sıfır miktar reddedilir (birim maliyette 0/0)', () => {
    expect(() =>
      calculatePurchaseBreakdown({
        lines: [{ productId: 'p1', quantity: '0', unitPrice: '10.00', vatRate: 20 }],
      }),
    ).toThrow(PosCoreError);
  });

  it('%100 üstü iskonto reddedilir (negatif matrah)', () => {
    expect(() =>
      calculatePurchaseBreakdown({
        lines: [
          { productId: 'p1', quantity: '1', unitPrice: '10.00', discountRate: '150', vatRate: 20 },
        ],
      }),
    ).toThrow(PosCoreError);
  });

  it('geçersiz KDV oranı reddedilir', () => {
    expect(() =>
      calculatePurchaseBreakdown({
        lines: [{ productId: 'p1', quantity: '1', unitPrice: '10.00', vatRate: 120 }],
      }),
    ).toThrow(PosCoreError);
  });
});

describe('purchaseUnitCost', () => {
  it('iskontolu matrahı miktara böler, yuvarlamaz', () => {
    expect(purchaseUnitCost('900.00', '10')).toBe('90');
    expect(purchaseUnitCost('100.00', '3')).toMatch(/^33\.3333/);
  });

  it('sıfır miktarda hata verir', () => {
    expect(() => purchaseUnitCost('100.00', '0')).toThrow(PosCoreError);
  });
});
