import { describe, expect, it } from 'vitest';

import { calculateChange } from './change';
import { PosCoreError } from './money';

describe('calculateChange', () => {
  it('para üstü = alınan - borç', () => {
    expect(calculateChange('100.00', '73.50')).toBe('26.50');
  });

  it('tam ödeme → 0.00', () => {
    expect(calculateChange('73.50', '73.50')).toBe('0.00');
  });

  it('eksik nakit reddedilir', () => {
    expect(() => calculateChange('50.00', '73.50')).toThrowError(/az/);
  });

  it('negatif tutar reddedilir', () => {
    expect(() => calculateChange('-1.00', '10.00')).toThrow(PosCoreError);
  });

  it('borç sıfırsa (tam kart/veresiye, nakit payı yok) para üstü 0.00', () => {
    expect(calculateChange('0.00', '0.00')).toBe('0.00');
  });

  it('kuruş altı fark yarıdan büyükse yukarı yuvarlanır (ROUND_HALF_UP sınırı)', () => {
    // 100.00 - 99.995 = 0.005 → tam sınır, yukarı yuvarlanır.
    expect(calculateChange('100.00', '99.995')).toBe('0.01');
  });

  it('kuruş altı fark yarıdan küçükse aşağı yuvarlanır', () => {
    // 10.001 - 10.00 = 0.001 → aşağı yuvarlanır.
    expect(calculateChange('10.001', '10.00')).toBe('0.00');
  });
});
