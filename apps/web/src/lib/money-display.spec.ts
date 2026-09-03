import { describe, expect, it } from 'vitest';

import { addMoney } from './money-display';

describe('addMoney', () => {
  it('float artığı üretmez', () => {
    expect(addMoney('0.10', '0.20')).toBe('0.30');
    expect(addMoney('1000.00', '200.00')).toBe('1200.00');
  });

  it('çok terimli toplar', () => {
    expect(addMoney('12.35', '0.05', '7.60')).toBe('20.00');
  });

  it('kuruş taşımasını doğru yapar', () => {
    expect(addMoney('0.99', '0.01')).toBe('1.00');
  });

  it('bozuk değeri sıfır sayar, çökmez', () => {
    expect(addMoney('10.00', '')).toBe('10.00');
  });
});
