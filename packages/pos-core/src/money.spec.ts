import { describe, expect, it } from 'vitest';

import { d, Decimal, round2 } from './money';

describe('money yardımcıları', () => {
  it('d() Decimal girişini olduğu gibi döndürür (yeniden sarmalamaz)', () => {
    const original = new Decimal('1.23');
    expect(d(original)).toBe(original);
  });

  it('d() string/number’ı Decimal’a çevirir', () => {
    expect(d('2.50').toFixed(2)).toBe('2.50');
    expect(d(3).toFixed(2)).toBe('3.00');
  });

  it('round2 yarıyı yukarı yuvarlar', () => {
    expect(round2(new Decimal('1.005')).toFixed(2)).toBe('1.01');
  });
});
