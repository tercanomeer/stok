import { describe, expect, it } from 'vitest';

import { differenceTone, quantityDifference } from './quantity';

describe('quantityDifference', () => {
  it('float artığı üretmez', () => {
    expect(quantityDifference('0.3', '0.1')).toBe('0.2');
    expect(quantityDifference('1.005', '1')).toBe('0.005');
  });

  it('eksik sayımda negatif döner', () => {
    expect(quantityDifference('8', '10')).toBe('-2');
  });

  it('fark yoksa sıfır döner', () => {
    expect(quantityDifference('10', '10')).toBe('0');
    expect(quantityDifference('10.000', '10')).toBe('0');
  });
});

describe('differenceTone', () => {
  it('fazla, eksik ve tam sayımı ayırır', () => {
    expect(differenceTone('2')).toBe('success');
    expect(differenceTone('-2')).toBe('danger');
    expect(differenceTone('0')).toBe('neutral');
  });
});
