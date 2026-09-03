import { describe, expect, it } from 'vitest';

import type { SaleItemDetail } from './api-types';
import {
  exceedsRemaining,
  hasReturnableItems,
  remainingQuantity,
  returnedQuantity,
} from './sale-return';

function item(quantity: string, returns: string[]): SaleItemDetail {
  return {
    id: 'i1',
    productId: 'p1',
    productName: 'Test',
    quantity,
    unitPrice: '10.00',
    discountRate: '0.00',
    vatRate: 20,
    netAmount: '8.33',
    vatAmount: '1.67',
    lineTotal: '10.00',
    returnItems: returns.map((q) => ({ quantity: q })),
  };
}

describe('returnedQuantity', () => {
  it('iade kalemlerini kayıpsız toplar', () => {
    expect(returnedQuantity(item('10', ['1.5', '2.25']))).toBe('3.75');
  });

  it('iade yoksa sıfır', () => {
    expect(returnedQuantity(item('10', []))).toBe('0');
  });
});

describe('remainingQuantity', () => {
  it('satılandan iade edileni düşer', () => {
    expect(remainingQuantity(item('10', ['4']))).toBe('6');
  });

  it('ondalıklı miktarda float kalıntısı bırakmaz', () => {
    // 0.3 - 0.1 float ile 0.19999999999999998 çıkar; ölçekli çıkarma 0.2 verir.
    expect(remainingQuantity(item('0.3', ['0.1']))).toBe('0.2');
  });

  it('tamamı iade edilmişse sıfır, negatife düşmez', () => {
    expect(remainingQuantity(item('5', ['5']))).toBe('0');
    expect(remainingQuantity(item('5', ['6']))).toBe('0');
  });
});

describe('exceedsRemaining', () => {
  it('kalandan fazlasını reddeder', () => {
    expect(exceedsRemaining(item('10', ['4']), '7')).toBe(true);
    expect(exceedsRemaining(item('10', ['4']), '6')).toBe(false);
  });
});

describe('hasReturnableItems', () => {
  it('tüm kalemler iade edilmişse false', () => {
    expect(hasReturnableItems([item('2', ['2'])])).toBe(false);
  });

  it('kalan varsa true', () => {
    expect(hasReturnableItems([item('2', ['2']), item('3', ['1'])])).toBe(true);
  });
});
