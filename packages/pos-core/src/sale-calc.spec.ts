import { describe, expect, it } from 'vitest';

import { PosCoreError } from './money';
import { calculateSaleBreakdown, calculateSaleTotals } from './sale-calc';

describe('calculateSaleTotals', () => {
  it('tek kalem: KDV dahil fiyattan KDV geri ayrıştırılır (kuruş yuvarlama)', () => {
    // 10.00 TL KDV dahil, %20 → KDV = 10*20/120 = 1.6667 → 1.67, net 8.33.
    const t = calculateSaleTotals({
      lines: [{ productId: 'p', quantity: '1', unitPrice: '10.00', vatRate: 20 }],
    });
    expect(t.grandTotal).toBe('10.00');
    expect(t.vatTotal).toBe('1.67');
    expect(t.subtotal).toBe('8.33');
    expect(t.discountTotal).toBe('0.00');
    expect(t.vatBreakdown).toEqual([{ vatRate: 20, base: '8.33', vatAmount: '1.67' }]);
  });

  it('net + vat = lineTotal ve grandTotal = subtotal + vatTotal ayrışmaz', () => {
    const t = calculateSaleTotals({
      lines: [
        { productId: 'a', quantity: '3', unitPrice: '4.99', vatRate: 20 },
        { productId: 'b', quantity: '2', unitPrice: '1.25', vatRate: 10 },
        { productId: 'c', quantity: '1.5', unitPrice: '7.30', vatRate: 1 },
      ],
    });
    expect(Number(t.subtotal) + Number(t.vatTotal)).toBeCloseTo(Number(t.grandTotal), 2);
    const breakdownVat = t.vatBreakdown.reduce((s, e) => s + Number(e.vatAmount), 0);
    const breakdownBase = t.vatBreakdown.reduce((s, e) => s + Number(e.base), 0);
    expect(breakdownVat).toBeCloseTo(Number(t.vatTotal), 2);
    expect(breakdownBase).toBeCloseTo(Number(t.subtotal), 2);
  });

  it('karışık KDV oranları vatBreakdown’da orana göre sıralı gruplanır', () => {
    const t = calculateSaleTotals({
      lines: [
        { productId: 'a', quantity: '1', unitPrice: '20.00', vatRate: 20 },
        { productId: 'b', quantity: '1', unitPrice: '11.00', vatRate: 10 },
        { productId: 'c', quantity: '1', unitPrice: '20.00', vatRate: 20 },
      ],
    });
    expect(t.vatBreakdown.map((e) => e.vatRate)).toEqual([10, 20]);
    // İki %20 kalemi tek grupta toplanır (16.67 * 2 = 33.34).
    expect(t.vatBreakdown.find((e) => e.vatRate === 20)?.base).toBe('33.34');
  });

  it('%100 satır indirimi → sıfır tutarlı satır, indirim toplamı brüte eşit', () => {
    const t = calculateSaleTotals({
      lines: [
        { productId: 'p', quantity: '2', unitPrice: '15.00', vatRate: 20, discountRate: '100' },
      ],
    });
    expect(t.grandTotal).toBe('0.00');
    expect(t.vatTotal).toBe('0.00');
    expect(t.subtotal).toBe('0.00');
    expect(t.discountTotal).toBe('30.00');
  });

  it('belge indirimi satır bazında oransal uygulanır', () => {
    const t = calculateSaleTotals({
      lines: [{ productId: 'p', quantity: '1', unitPrice: '100.00', vatRate: 20 }],
      documentDiscountRate: '10',
    });
    expect(t.grandTotal).toBe('90.00');
    expect(t.discountTotal).toBe('10.00');
  });

  it('satır + belge indirimi birlikte çarpımsal uygulanır', () => {
    // 100 * (1-0.10) * (1-0.10) = 81.00
    const t = calculateSaleTotals({
      lines: [
        { productId: 'p', quantity: '1', unitPrice: '100.00', vatRate: 20, discountRate: '10' },
      ],
      documentDiscountRate: '10',
    });
    expect(t.grandTotal).toBe('81.00');
  });

  it('tartılı ürün: 3 ondalık miktar desteklenir', () => {
    const t = calculateSaleTotals({
      lines: [{ productId: 'p', quantity: '1.250', unitPrice: '40.00', vatRate: 1 }],
    });
    expect(t.grandTotal).toBe('50.00');
  });

  it('boş satış reddedilir', () => {
    expect(() => calculateSaleTotals({ lines: [] })).toThrow(PosCoreError);
  });

  it('negatif/sıfır miktar reddedilir', () => {
    expect(() =>
      calculateSaleTotals({
        lines: [{ productId: 'p', quantity: '0', unitPrice: '10.00', vatRate: 20 }],
      }),
    ).toThrowError(/Miktar/);
    expect(() =>
      calculateSaleTotals({
        lines: [{ productId: 'p', quantity: '-1', unitPrice: '10.00', vatRate: 20 }],
      }),
    ).toThrow(PosCoreError);
  });

  it('negatif birim fiyat ve %100 üstü indirim reddedilir', () => {
    expect(() =>
      calculateSaleTotals({
        lines: [{ productId: 'p', quantity: '1', unitPrice: '-5.00', vatRate: 20 }],
      }),
    ).toThrow(PosCoreError);
    expect(() =>
      calculateSaleTotals({
        lines: [
          { productId: 'p', quantity: '1', unitPrice: '5.00', vatRate: 20, discountRate: '150' },
        ],
      }),
    ).toThrow(PosCoreError);
  });

  it('geçersiz KDV oranı reddedilir', () => {
    expect(() =>
      calculateSaleTotals({
        lines: [{ productId: 'p', quantity: '1', unitPrice: '5.00', vatRate: -1 }],
      }),
    ).toThrow(PosCoreError);
  });
});

describe('calculateSaleBreakdown (satır çıktısı)', () => {
  // calculateSaleTotals yalnız totals döner; SaleLineResult alanları (netAmount, vatAmount,
  // lineTotal, discountAmount, quantity/unitPrice/discountRate biçimi) hiçbir testte doğrudan
  // doğrulanmıyordu — statement/branch kapsamı çalıştırıyor ama değer doğruluğunu kontrol etmiyor.
  it('satır + belge indirimi birlikte: satır alanları kuruşu kuruşuna doğru hesaplanır', () => {
    // qty2 * 15.00 = 30.00 brüt, satır %10 + belge %10 çarpımsal → 30*0.9*0.9 = 24.30.
    const b = calculateSaleBreakdown({
      lines: [
        { productId: 'p1', quantity: '2', unitPrice: '15.00', vatRate: 20, discountRate: '10' },
      ],
      documentDiscountRate: '10',
    });
    expect(b.lines).toHaveLength(1);
    const line = b.lines[0]!;
    expect(line.productId).toBe('p1');
    expect(line.quantity).toBe('2');
    expect(line.unitPrice).toBe('15.00');
    expect(line.vatRate).toBe(20);
    expect(line.discountRate).toBe('10.00');
    expect(line.lineTotal).toBe('24.30');
    expect(line.vatAmount).toBe('4.05');
    expect(line.netAmount).toBe('20.25');
    expect(line.discountAmount).toBe('5.70');
    // net + vat = lineTotal kuruşu kuruşuna.
    expect((Number(line.netAmount) + Number(line.vatAmount)).toFixed(2)).toBe(line.lineTotal);
    expect(b.totals.grandTotal).toBe('24.30');
    expect(b.totals.discountTotal).toBe('5.70');
  });

  it('discountRate verilmezse çıktıda "0.00" olarak normalize edilir', () => {
    const b = calculateSaleBreakdown({
      lines: [{ productId: 'p', quantity: '1', unitPrice: '10.00', vatRate: 20 }],
    });
    expect(b.lines[0]!.discountRate).toBe('0.00');
    expect(b.lines[0]!.discountAmount).toBe('0.00');
  });

  it('tartılı ürün (3 ondalık miktar) çıktıda sondaki sıfırı korumaz — "1.250" → "1.25"', () => {
    // Decimal#toString trailing-zero'ları düşürür; contracts.ts örneği "1.500" gösterse de
    // gerçek çıktı normalize biçimdedir. Davranışı burada sabitliyoruz (regresyon uyarısı).
    const b = calculateSaleBreakdown({
      lines: [{ productId: 'p', quantity: '1.250', unitPrice: '40.00', vatRate: 1 }],
    });
    expect(b.lines[0]!.quantity).toBe('1.25');
  });

  it('indirimli tartılı üründe brüt-indirim-toplam kuruş tutarlılığı korunur (double-rounding)', () => {
    // qty 0.125 * 9.99 = 1.24875 (yuvarlanmamış). %10 satır indirimi.
    // discountAmount = round(gross) - round(gross*factor) = 1.25 - 1.12 = 0.13
    // NOT: bu, "round(gross - gross*factor) = 0.12" değerinden farklıdır — bilinçli tasarım:
    // fişte basılan grossRounded - discountAmount her zaman basılan lineTotal'a eşit olmalı.
    const b = calculateSaleBreakdown({
      lines: [
        { productId: 'p', quantity: '0.125', unitPrice: '9.99', vatRate: 20, discountRate: '10' },
      ],
    });
    const line = b.lines[0]!;
    expect(line.lineTotal).toBe('1.12');
    expect(line.vatAmount).toBe('0.19');
    expect(line.netAmount).toBe('0.93');
    expect(line.discountAmount).toBe('0.13');
    // Reconciliation invariantı: brüt (yuvarlanmış) - indirim = ödenen (lineTotal).
    const grossRounded = (Number(line.unitPrice) * Number(line.quantity)).toFixed(2);
    expect((Number(grossRounded) - Number(line.discountAmount)).toFixed(2)).toBe(line.lineTotal);
  });

  it('sıfır fiyatlı (promosyon/hediye) kalem tüm alanlarda "0.00" üretir, hata atmaz', () => {
    const b = calculateSaleBreakdown({
      lines: [{ productId: 'p', quantity: '1', unitPrice: '0.00', vatRate: 20 }],
    });
    const line = b.lines[0]!;
    expect(line.lineTotal).toBe('0.00');
    expect(line.vatAmount).toBe('0.00');
    expect(line.netAmount).toBe('0.00');
    expect(line.discountAmount).toBe('0.00');
  });

  it('çok küçük tutarlı tartılı kalem (kuruşun altı) sıfıra yuvarlanır', () => {
    // 0.001 kg * 0.01 TL/kg = 0.00001 → kuruşun çok altında, tüm alanlar 0.00'a yuvarlanır.
    const b = calculateSaleBreakdown({
      lines: [{ productId: 'p', quantity: '0.001', unitPrice: '0.01', vatRate: 10 }],
    });
    const line = b.lines[0]!;
    expect(line.lineTotal).toBe('0.00');
    expect(line.vatAmount).toBe('0.00');
    expect(line.netAmount).toBe('0.00');
  });

  it('çoklu belge+satır indirimi kombinasyonu: farklı KDV oranlı satırlarda toplamlar tutarlı', () => {
    const b = calculateSaleBreakdown({
      lines: [
        { productId: 'a', quantity: '2', unitPrice: '15.00', vatRate: 20, discountRate: '10' },
        { productId: 'b', quantity: '1.250', unitPrice: '40.00', vatRate: 1, discountRate: '0' },
      ],
      documentDiscountRate: '10',
    });
    // a: 24.30 (yukarıdaki testte doğrulandı) — b: doc %10 dışında satır indirimi yok → 50*0.9=45.00.
    expect(b.lines[0]!.lineTotal).toBe('24.30');
    expect(b.lines[1]!.lineTotal).toBe('45.00');
    expect(b.totals.grandTotal).toBe('69.30');
    expect(b.totals.discountTotal).toBe('10.70');
    // Satır discountAmount toplamı, genel discountTotal'a eşit olmalı.
    const sumLineDiscount = b.lines.reduce((s, l) => s + Number(l.discountAmount), 0);
    expect(sumLineDiscount.toFixed(2)).toBe(b.totals.discountTotal);
  });
});
