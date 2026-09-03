import { describe, expect, it } from 'vitest';

import { differenceTone, quantityDifference, quantitySum } from './quantity';

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

describe('quantitySum', () => {
  it('float artığı üretmez', () => {
    expect(quantitySum('0.1', '0.2')).toBe('0.3');
    expect(quantitySum('5', '24')).toBe('29');
  });

  it('ondalıklı miktarı korur (alış önizlemesi)', () => {
    expect(quantitySum('2.5', '1')).toBe('3.5');
    expect(quantitySum('1.005', '0.995')).toBe('2');
  });

  it('bozuk değeri sıfır sayar, "NaN" yazmaz', () => {
    expect(quantitySum('', '1')).toBe('1');
    expect(quantitySum('abc', '1')).toBe('1');
  });
});
