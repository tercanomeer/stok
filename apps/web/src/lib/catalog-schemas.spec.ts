import { describe, expect, it } from 'vitest';

import { toDecimalString } from './catalog-schemas';

describe('toDecimalString', () => {
  it('virgülü ondalık ayracı olarak kabul eder', () => {
    expect(toDecimalString('12,50')).toBe('12.50');
    expect(toDecimalString('0,005')).toBe('0.005');
  });

  it('virgül varken noktayı binlik ayracı sayar', () => {
    expect(toDecimalString('3.500,00')).toBe('3500.00');
    expect(toDecimalString('1.234.567,89')).toBe('1234567.89');
  });

  it('boşluklu binlik ayracını temizler', () => {
    expect(toDecimalString('1 250,50')).toBe('1250.50');
  });

  it('virgül yoksa noktaya dokunmaz (İngilizce ondalık)', () => {
    expect(toDecimalString('12.50')).toBe('12.50');
  });

  it('belirsiz "3.500" değerini 1000 katına ÇIKARMAZ', () => {
    // Virgül yok: nokta ondalık kabul edilir. Sessizce 3500 yapmak kuruş hatasından pahalı.
    expect(toDecimalString('3.500')).toBe('3.500');
  });

  it('tam sayıyı ve boş girdiyi olduğu gibi bırakır', () => {
    expect(toDecimalString('1250')).toBe('1250');
    expect(toDecimalString('  ')).toBe('');
  });
});
