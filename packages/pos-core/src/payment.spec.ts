import { describe, expect, it } from 'vitest';

import { maxEffectiveDiscountRate, settlePayments } from './payment';
import { calculateSaleBreakdown } from './sale-calc';

describe('settlePayments', () => {
  it('tek nakit ödeme tam tutarı kapatır', () => {
    expect(settlePayments([{ method: 'CASH', amount: '100.00' }], '100.00')).toEqual({
      paidTotal: '100.00',
      cashDue: '100.00',
      cashReceived: '100.00',
      changeDue: '0.00',
      creditTotal: '0.00',
    });
  });

  it('fazla verilen nakitten para üstü çıkar', () => {
    const result = settlePayments(
      [{ method: 'CASH', amount: '87.50', receivedAmount: '100.00' }],
      '87.50',
    );
    expect(result.changeDue).toBe('12.50');
  });

  it('parçalı ödemede para üstü YALNIZ nakit parçadan hesaplanır', () => {
    // 150 TL fiş: 100 kart, 50 nakit; müşteri 100 TL veriyor → para üstü 50.
    const result = settlePayments(
      [
        { method: 'CARD', amount: '100.00' },
        { method: 'CASH', amount: '50.00', receivedAmount: '100.00' },
      ],
      '150.00',
    );
    expect(result.changeDue).toBe('50.00');
    expect(result.cashDue).toBe('50.00');
  });

  it('veresiye tutarını ayrı toplar', () => {
    const result = settlePayments(
      [
        { method: 'CASH', amount: '20.00' },
        { method: 'CREDIT', amount: '30.00' },
      ],
      '50.00',
    );
    expect(result.creditTotal).toBe('30.00');
  });

  it('eksik ödeme reddedilir', () => {
    expect(() => settlePayments([{ method: 'CASH', amount: '99.99' }], '100.00')).toThrow(
      /karşılamıyor/,
    );
  });

  it('fazla ödeme de reddedilir — fark para üstü değil, hatadır', () => {
    // Fazlalık `receivedAmount` ile taşınır; `amount` fişi aşamaz.
    expect(() => settlePayments([{ method: 'CASH', amount: '120.00' }], '100.00')).toThrow(
      /karşılamıyor/,
    );
  });

  it('alınan nakit borçtan azsa hata verir', () => {
    expect(() =>
      settlePayments([{ method: 'CASH', amount: '100.00', receivedAmount: '90.00' }], '100.00'),
    ).toThrow(/az/);
  });

  it('sıfır ve negatif tutarlı ödeme kabul edilmez', () => {
    expect(() => settlePayments([{ method: 'CASH', amount: '0' }], '0')).toThrow(/sıfırdan büyük/);
  });

  it('ödeme yoksa hata verir', () => {
    expect(() => settlePayments([], '10.00')).toThrow(/En az bir ödeme/);
  });

  it('kuruş farkı float toleransına takılmaz', () => {
    // 0.1 + 0.2 float'ta 0.30000000000000004 eder; Decimal ile tam 0.30.
    expect(
      settlePayments(
        [
          { method: 'CASH', amount: '0.10' },
          { method: 'CARD', amount: '0.20' },
        ],
        '0.30',
      ).paidTotal,
    ).toBe('0.30');
  });
});

describe('maxEffectiveDiscountRate', () => {
  it('indirimsiz satışta sıfır', () => {
    const breakdown = calculateSaleBreakdown({
      lines: [{ productId: 'p1', quantity: '2', unitPrice: '10.00', vatRate: 20 }],
    });
    expect(maxEffectiveDiscountRate(breakdown)).toBe('0.00');
  });

  it('satır indirimini oran olarak verir', () => {
    const breakdown = calculateSaleBreakdown({
      lines: [
        { productId: 'p1', quantity: '1', unitPrice: '100.00', vatRate: 20, discountRate: '15' },
      ],
    });
    expect(maxEffectiveDiscountRate(breakdown)).toBe('15.00');
  });

  it('satır + belge indirimi BİLEŞİK ölçülür (%10 + %10 = %19)', () => {
    const breakdown = calculateSaleBreakdown({
      lines: [
        { productId: 'p1', quantity: '1', unitPrice: '100.00', vatRate: 20, discountRate: '10' },
      ],
      documentDiscountRate: '10',
    });
    expect(maxEffectiveDiscountRate(breakdown)).toBe('19.00');
  });

  it('satırlardan EN YÜKSEĞİNİ verir', () => {
    const breakdown = calculateSaleBreakdown({
      lines: [
        { productId: 'p1', quantity: '1', unitPrice: '100.00', vatRate: 20, discountRate: '5' },
        { productId: 'p2', quantity: '1', unitPrice: '100.00', vatRate: 20, discountRate: '30' },
      ],
    });
    expect(maxEffectiveDiscountRate(breakdown)).toBe('30.00');
  });
});
