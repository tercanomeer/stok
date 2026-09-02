// decimal.js default export = Decimal ctor; ayrıca named 'Decimal' de var, uyarı bastırılıyor.
// eslint-disable-next-line import-x/no-named-as-default
import Decimal from 'decimal.js';

// Para: yarıyı yukarı yuvarla (kuruş yuvarlaması), yüksek iç hassasiyet.
Decimal.set({ precision: 40, rounding: Decimal.ROUND_HALF_UP });

export { Decimal };

/** String/number → Decimal. Float ara değer üretilmez. */
export function d(value: string | number | Decimal): Decimal {
  return value instanceof Decimal ? value : new Decimal(value);
}

/** 2 basamağa (kuruş) yuvarla. */
export function round2(value: Decimal): Decimal {
  return value.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}

/** POS-core hatası — geçersiz giriş (framework bağımsız, HTTP bilmez). */
export class PosCoreError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'PosCoreError';
  }
}
