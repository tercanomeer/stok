import { describe, expect, it } from 'vitest';

import {
  formatCount,
  formatDate,
  formatMoney,
  formatPercent,
  formatQuantity,
  formatTime,
} from './format';

describe('formatMoney', () => {
  it('string para değerini tr-TR TRY biçimler', () => {
    const out = formatMoney('1234.5');
    expect(out).toContain('₺');
    expect(out).toContain('1.234'); // binlik ayıracı nokta
    expect(out).toContain(',50'); // ondalık ayıracı virgül, 2 hane
  });

  it('geçersiz girdi sıfıra düşer', () => {
    expect(formatMoney('abc')).toContain('0,00');
  });

  it('tam sayı stringde de iki ondalık gösterir', () => {
    expect(formatMoney('24')).toContain(',00');
  });
});

describe('formatQuantity', () => {
  it('ondalık miktarı virgülle biçimler', () => {
    expect(formatQuantity('2.5')).toBe('2,5');
  });
});

describe('formatCount', () => {
  it('binlik ayıracı ekler', () => {
    expect(formatCount(1234)).toBe('1.234');
  });
});

describe('formatPercent', () => {
  it('işaret başta, virgüllü', () => {
    expect(formatPercent(12.5)).toBe('%12,5');
  });
});

describe('formatDate / formatTime', () => {
  it('ISO tarihi Türkçe kısa biçimler', () => {
    expect(formatDate('2026-09-03')).toBe('3 Eyl 2026');
  });

  it('saat biçimi 24 saat', () => {
    expect(formatTime('2026-09-03T14:05:00')).toBe('14:05');
  });
});
