import { d, PosCoreError, round2 } from './money';

/**
 * Para üstü: nakit alınan − nakit borç. Parçalı ödemede nakit borcu, fiş toplamından
 * nakit-dışı (kart/veresiye/havale) parçalar düşülerek çağıran tarafından bulunur.
 * Alınan tutar borçtan azsa hata — POS ödemeyi kapatamaz.
 */
export function calculateChange(receivedAmount: string, cashDue: string): string {
  const received = d(receivedAmount);
  const due = d(cashDue);
  if (received.lessThan(0) || due.lessThan(0)) {
    throw new PosCoreError('INVALID_AMOUNT', 'Tutar negatif olamaz.');
  }
  if (received.lessThan(due)) {
    throw new PosCoreError('INSUFFICIENT_CASH', 'Alınan nakit, tutardan az.');
  }
  return round2(received.minus(due)).toFixed(2);
}
