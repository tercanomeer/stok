import type {
  SaleBreakdown,
  SaleCalculationInput,
  SaleLineInput,
  SaleLineResult,
  SaleTotals,
  VatBreakdownEntry,
} from './contracts';
import { Decimal, d, PosCoreError, round2 } from './money';

/**
 * Satış hesabının TEK yeri (CLAUDE.md). Backend de POS da bunu çağırır.
 *
 * Satır birim fiyatı KDV DAHİL (SaleItem.unitPrice sözleşmesi). KDV, dahil fiyattan geri
 * ayrıştırılır: vat = lineTotal * oran / (100 + oran). net + vat = lineTotal her satırda
 * kuruşu kuruşuna tutar → grandTotal = subtotal + vatTotal ayrışmaz.
 *
 * İndirim iki kademeli: önce satır indirimi, sonra belge indirimi çarpımsal, satır bazında.
 */
export function calculateSaleBreakdown(input: SaleCalculationInput): SaleBreakdown {
  if (input.lines.length === 0) {
    throw new PosCoreError('EMPTY_SALE', 'Satışta en az bir kalem olmalı.');
  }
  const docDisc = parseRate(input.documentDiscountRate, 'BELGE_INDIRIMI');

  let subtotal = new Decimal(0);
  let vatTotal = new Decimal(0);
  let grandTotal = new Decimal(0);
  let discountTotal = new Decimal(0);
  const vatGroups = new Map<number, { base: Decimal; vatAmount: Decimal }>();
  const lines: SaleLineResult[] = [];

  for (const line of input.lines) {
    const c = computeLine(line, docDisc);

    subtotal = subtotal.plus(c.netAmount);
    vatTotal = vatTotal.plus(c.vatAmount);
    grandTotal = grandTotal.plus(c.lineTotal);
    const discountAmount = c.grossRounded.minus(c.lineTotal);
    discountTotal = discountTotal.plus(discountAmount);

    const group = vatGroups.get(line.vatRate) ?? {
      base: new Decimal(0),
      vatAmount: new Decimal(0),
    };
    group.base = group.base.plus(c.netAmount);
    group.vatAmount = group.vatAmount.plus(c.vatAmount);
    vatGroups.set(line.vatRate, group);

    lines.push({
      productId: line.productId,
      quantity: d(line.quantity).toString(),
      unitPrice: d(line.unitPrice).toFixed(2),
      vatRate: line.vatRate,
      discountRate: parseRate(line.discountRate, 'SATIR_INDIRIMI').toFixed(2),
      netAmount: c.netAmount.toFixed(2),
      vatAmount: c.vatAmount.toFixed(2),
      lineTotal: c.lineTotal.toFixed(2),
      discountAmount: discountAmount.toFixed(2),
    });
  }

  const vatBreakdown: VatBreakdownEntry[] = [...vatGroups.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([vatRate, g]) => ({
      vatRate,
      base: g.base.toFixed(2),
      vatAmount: g.vatAmount.toFixed(2),
    }));

  const totals: SaleTotals = {
    subtotal: subtotal.toFixed(2),
    discountTotal: discountTotal.toFixed(2),
    vatBreakdown,
    vatTotal: vatTotal.toFixed(2),
    grandTotal: grandTotal.toFixed(2),
  };
  return { lines, totals };
}

/** Yalnız toplamlar (POS özet ekranı). Dökümle aynı hesap. */
export function calculateSaleTotals(input: SaleCalculationInput): SaleTotals {
  return calculateSaleBreakdown(input).totals;
}

function computeLine(
  line: SaleLineInput,
  docDisc: Decimal,
): { lineTotal: Decimal; netAmount: Decimal; vatAmount: Decimal; grossRounded: Decimal } {
  const quantity = d(line.quantity);
  const unitPrice = d(line.unitPrice);
  if (quantity.lessThanOrEqualTo(0)) {
    throw new PosCoreError('INVALID_QUANTITY', 'Miktar sıfırdan büyük olmalı.');
  }
  if (unitPrice.lessThan(0)) {
    throw new PosCoreError('INVALID_UNIT_PRICE', 'Birim fiyat negatif olamaz.');
  }
  if (line.vatRate < 0 || !Number.isInteger(line.vatRate)) {
    throw new PosCoreError('INVALID_VAT_RATE', 'KDV oranı geçersiz.');
  }
  const lineDisc = parseRate(line.discountRate, 'SATIR_INDIRIMI');

  const gross = quantity.mul(unitPrice); // KDV dahil, indirim öncesi
  const factor = new Decimal(1)
    .minus(lineDisc.div(100))
    .mul(new Decimal(1).minus(docDisc.div(100)));
  const lineTotal = round2(gross.mul(factor)); // müşterinin ödediği (KDV dahil)
  const vatAmount = round2(lineTotal.mul(line.vatRate).div(100 + line.vatRate));
  const netAmount = lineTotal.minus(vatAmount); // net + vat = lineTotal (kuruşu kuruşuna)

  return { lineTotal, netAmount, vatAmount, grossRounded: round2(gross) };
}

function parseRate(value: string | undefined, code: string): Decimal {
  if (value === undefined) return new Decimal(0);
  const rate = d(value);
  if (rate.lessThan(0) || rate.greaterThan(100)) {
    throw new PosCoreError(`INVALID_${code}`, 'İndirim oranı 0-100 aralığında olmalı.');
  }
  return rate;
}

/**
 * İade tutarı — satırdan İADE EDİLEN ORANIN gerçekte tahsil edilen tutarı.
 *
 * `SaleItem.unitPrice` indirim ÖNCESİ ham birim fiyattır; müşterinin ödediği
 * `lineTotal`'dır (satır + belge indirimi uygulanmış). İadeyi `unitPrice × miktar`
 * ile hesaplamak indirimli satışta FAZLA ÖDEME üretir: 100 TL'lik ürün %10 indirimle
 * 90 TL'ye satıldıysa iadesi 90 TL olmalı, 100 TL değil.
 *
 * Bu yüzden ödenen tutar oranlanır: lineTotal × (iade miktarı / satılan miktar).
 * Backend iadeyi kaydederken, web iade ekranı tutarı gösterirken aynı fonksiyonu çağırır.
 */
export function calculateRefundAmount(
  lineTotal: string,
  soldQuantity: string,
  returnQuantity: string,
): string {
  const sold = d(soldQuantity);
  const returned = d(returnQuantity);
  if (sold.lessThanOrEqualTo(0)) {
    throw new PosCoreError('INVALID_QUANTITY', 'Satılan miktar sıfırdan büyük olmalı.');
  }
  if (returned.lessThan(0)) {
    throw new PosCoreError('INVALID_QUANTITY', 'İade miktarı negatif olamaz.');
  }
  if (returned.greaterThan(sold)) {
    throw new PosCoreError('RETURN_EXCEEDS_SOLD', 'İade miktarı satılandan fazla olamaz.');
  }
  return round2(d(lineTotal).mul(returned).div(sold)).toFixed(2);
}
