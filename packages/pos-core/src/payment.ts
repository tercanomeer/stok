import { calculateChange } from './change';
import type { SaleBreakdown } from './contracts';
import { Decimal, d, PosCoreError, round2 } from './money';

export type PaymentMethod = 'CASH' | 'CARD' | 'CREDIT' | 'TRANSFER';

export interface PaymentInput {
  method: PaymentMethod;
  amount: string;
  /** Nakitte müşterinin verdiği tutar; verilmezse borcun tamamı verilmiş sayılır. */
  receivedAmount?: string | undefined;
}

export interface PaymentSettlement {
  /** Ödemelerin toplamı — fiş tutarına eşit olmak zorunda. */
  paidTotal: string;
  /** Nakit parçaların toplamı (müşterinin nakit borcu). */
  cashDue: string;
  cashReceived: string;
  changeDue: string;
  /** Veresiye parçaların toplamı — cariye borç yazılacak tutar. */
  creditTotal: string;
}

/**
 * Parçalı ödemeyi kapatır: toplam tutuyor mu, para üstü ne kadar.
 *
 * Para üstü YALNIZ nakit parçadan çıkar — kart ve veresiye tutarları düşüldükten
 * sonra kalan nakit borcu, müşterinin verdiği nakitle karşılaştırılır. Toplam
 * karşılaştırması kuruş kuruşuna yapılır; float toleransı yoktur.
 */
export function settlePayments(
  payments: readonly PaymentInput[],
  grandTotal: string,
): PaymentSettlement {
  if (payments.length === 0) {
    throw new PosCoreError('NO_PAYMENT', 'En az bir ödeme gerekli.');
  }

  let paidTotal = new Decimal(0);
  let cashDue = new Decimal(0);
  let cashReceived = new Decimal(0);
  let creditTotal = new Decimal(0);

  for (const payment of payments) {
    const amount = d(payment.amount);
    if (amount.lessThanOrEqualTo(0)) {
      throw new PosCoreError('INVALID_AMOUNT', 'Ödeme tutarı sıfırdan büyük olmalı.');
    }
    paidTotal = paidTotal.plus(amount);
    if (payment.method === 'CASH') {
      cashDue = cashDue.plus(amount);
      cashReceived = cashReceived.plus(
        payment.receivedAmount === undefined ? amount : d(payment.receivedAmount),
      );
    }
    if (payment.method === 'CREDIT') creditTotal = creditTotal.plus(amount);
  }

  if (!round2(paidTotal).equals(round2(d(grandTotal)))) {
    throw new PosCoreError('PAYMENT_MISMATCH', 'Ödeme toplamı fiş tutarını karşılamıyor.');
  }

  return {
    paidTotal: round2(paidTotal).toFixed(2),
    cashDue: round2(cashDue).toFixed(2),
    cashReceived: round2(cashReceived).toFixed(2),
    changeDue: calculateChange(round2(cashReceived).toFixed(2), round2(cashDue).toFixed(2)),
    creditTotal: round2(creditTotal).toFixed(2),
  };
}

/**
 * Satıştaki EN YÜKSEK etkin indirim oranı (%).
 *
 * "Yüksek indirim yetkisi" kuralının dayandığı sayı. Satır indirimi ile belge
 * indirimi çarpımsal uygulandığı için girilen oranlar tek başına gerçeği vermez;
 * satırın gerçekte verdiği indirimin, indirim öncesi tutara oranı ölçülür.
 * Sunucu da kasa da aynı sayıyı görsün diye burada, tek yerde.
 */
export function maxEffectiveDiscountRate(breakdown: SaleBreakdown): string {
  let max = new Decimal(0);
  for (const line of breakdown.lines) {
    const discount = d(line.discountAmount);
    if (discount.lessThanOrEqualTo(0)) continue;
    const gross = d(line.lineTotal).plus(discount); // KDV dahil, indirim öncesi
    if (gross.lessThanOrEqualTo(0)) continue;
    const effective = discount.div(gross).mul(100);
    if (effective.greaterThan(max)) max = effective;
  }
  return round2(max).toFixed(2);
}
