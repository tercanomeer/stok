import type {
  PurchaseBreakdown,
  PurchaseCalculationInput,
  PurchaseLineInput,
  PurchaseLineResult,
  PurchaseTotals,
} from './contracts';
import { Decimal, d, PosCoreError, round2 } from './money';

/**
 * Alış faturası hesabının TEK yeri (CLAUDE.md: "ikinci bir implementasyon yazılmaz").
 * Backend faturayı kaydederken, web alış ekranı toplamları gösterirken aynı fonksiyonu çağırır.
 *
 * SATIŞTAN FARKI: alışta birim fiyat KDV **HARİÇ** (`PurchaseItem.unitPrice` sözleşmesi).
 * KDV geri ayrıştırılmaz, matrahın ÜSTÜNE eklenir:
 *   matrah = miktar × birim fiyat × (1 − iskonto/100)
 *   KDV    = matrah × oran / 100
 *   satır  = matrah + KDV
 * Bu yüzden `subtotal` KDV hariç toplamdır ve `grandTotal = subtotal + vatTotal`.
 */
export function calculatePurchaseBreakdown(input: PurchaseCalculationInput): PurchaseBreakdown {
  if (input.lines.length === 0) {
    throw new PosCoreError('EMPTY_PURCHASE', 'Faturada en az bir kalem olmalı.');
  }

  let subtotal = new Decimal(0);
  let vatTotal = new Decimal(0);
  let discountTotal = new Decimal(0);
  const lines: PurchaseLineResult[] = [];

  for (const line of input.lines) {
    const c = computeLine(line);

    subtotal = subtotal.plus(c.lineTotal);
    vatTotal = vatTotal.plus(c.vatAmount);
    discountTotal = discountTotal.plus(c.discountAmount);

    lines.push({
      productId: line.productId,
      quantity: d(line.quantity).toString(),
      unitPrice: d(line.unitPrice).toFixed(2),
      vatRate: line.vatRate,
      discountRate: parseRate(line.discountRate).toFixed(2),
      lineTotal: c.lineTotal.toFixed(2),
      vatAmount: c.vatAmount.toFixed(2),
      discountAmount: c.discountAmount.toFixed(2),
      lineGrandTotal: c.lineTotal.plus(c.vatAmount).toFixed(2),
    });
  }

  const totals: PurchaseTotals = {
    subtotal: subtotal.toFixed(2),
    discountTotal: discountTotal.toFixed(2),
    vatTotal: vatTotal.toFixed(2),
    grandTotal: subtotal.plus(vatTotal).toFixed(2),
  };
  return { lines, totals };
}

/** Yalnız toplamlar (fatura özeti). Dökümle aynı hesap. */
export function calculatePurchaseTotals(input: PurchaseCalculationInput): PurchaseTotals {
  return calculatePurchaseBreakdown(input).totals;
}

function computeLine(line: PurchaseLineInput): {
  lineTotal: Decimal;
  vatAmount: Decimal;
  discountAmount: Decimal;
} {
  const quantity = d(line.quantity);
  const unitPrice = d(line.unitPrice);
  if (quantity.lessThanOrEqualTo(0)) {
    // "0" miktar birim maliyette 0/0 = NaN üretir ve ürün maliyetini bozar.
    throw new PosCoreError('INVALID_QUANTITY', 'Miktar sıfırdan büyük olmalı.');
  }
  if (unitPrice.lessThan(0)) {
    throw new PosCoreError('INVALID_UNIT_PRICE', 'Birim fiyat negatif olamaz.');
  }
  if (line.vatRate < 0 || line.vatRate > 100 || !Number.isInteger(line.vatRate)) {
    throw new PosCoreError('INVALID_VAT_RATE', 'KDV oranı geçersiz.');
  }

  const discountRate = parseRate(line.discountRate);
  const gross = quantity.mul(unitPrice); // KDV hariç, iskonto öncesi
  const lineTotal = round2(gross.mul(new Decimal(1).minus(discountRate.div(100))));
  const vatAmount = round2(lineTotal.mul(line.vatRate).div(100));

  return { lineTotal, vatAmount, discountAmount: round2(gross.minus(lineTotal)) };
}

function parseRate(value: string | undefined): Decimal {
  if (value === undefined) return new Decimal(0);
  const rate = d(value);
  if (rate.lessThan(0) || rate.greaterThan(100)) {
    // >100 negatif matrah → negatif maliyet ve bozuk ortalama maliyet.
    throw new PosCoreError('INVALID_DISCOUNT_RATE', 'İskonto oranı 0-100 aralığında olmalı.');
  }
  return rate;
}

/**
 * Birim maliyet = iskonto sonrası satır matrahı / miktar (KDV hariç).
 * Ağırlıklı ortalama maliyet bunun üstüne kurulur, o yüzden YUVARLANMAZ —
 * çağıran gerekli hassasiyette kullanır.
 */
export function purchaseUnitCost(lineTotal: string, quantity: string): string {
  const qty = d(quantity);
  if (qty.lessThanOrEqualTo(0)) {
    throw new PosCoreError('INVALID_QUANTITY', 'Miktar sıfırdan büyük olmalı.');
  }
  return d(lineTotal).div(qty).toString();
}
