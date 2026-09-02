/**
 * Satış hesaplamasının sözleşmesi.
 *
 * Uygulama Faz 6'da yazılır. Burada yalnızca giriş/çıkış şekli duruyor ki
 * backend ve POS aynı tipe göre derlensin — CLAUDE.md: "Satış/KDV/indirim hesabı
 * yalnızca @stokk/pos-core içinde; ikinci bir implementasyon yazılmaz."
 *
 * Para alanları string (`"123.45"`), miktar string (`"1.500"`). Float yasak.
 */
export interface SaleLineInput {
  productId: string;
  quantity: string;
  unitPrice: string;
  vatRate: number;
  discountRate?: string;
}

export interface SaleCalculationInput {
  lines: SaleLineInput[];
  documentDiscountRate?: string;
}

/** KDV oranı bazında matrah/vergi kırılımı — fişte ayrı satır olarak basılır. */
export interface VatBreakdownEntry {
  vatRate: number;
  base: string;
  vatAmount: string;
}

export interface SaleTotals {
  subtotal: string;
  discountTotal: string;
  vatBreakdown: VatBreakdownEntry[];
  vatTotal: string;
  grandTotal: string;
}

/** Satır bazında hesap sonucu — SaleItem satırları bu değerlerle yazılır (tek kaynak). */
export interface SaleLineResult {
  productId: string;
  quantity: string;
  unitPrice: string;
  vatRate: number;
  discountRate: string;
  /** KDV hariç matrah. */
  netAmount: string;
  vatAmount: string;
  /** KDV dahil, indirim sonrası satır toplamı (müşterinin ödediği). */
  lineTotal: string;
  /** Bu satırda verilen toplam indirim (KDV dahil). */
  discountAmount: string;
}

/** Satış hesabının tam dökümü: satır satır + toplamlar. */
export interface SaleBreakdown {
  lines: SaleLineResult[];
  totals: SaleTotals;
}
