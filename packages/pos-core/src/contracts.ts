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

// --- Alış faturası ---

/**
 * Alış hesaplamasının sözleşmesi. SATIŞTAN FARKI: `unitPrice` KDV **HARİÇ**
 * (`PurchaseItem.unitPrice`), KDV matrahın üstüne eklenir.
 */
export interface PurchaseLineInput {
  productId: string;
  quantity: string;
  /** Birim alış fiyatı — KDV HARİÇ. */
  unitPrice: string;
  vatRate: number;
  discountRate?: string;
}

export interface PurchaseCalculationInput {
  lines: PurchaseLineInput[];
}

export interface PurchaseLineResult {
  productId: string;
  quantity: string;
  unitPrice: string;
  vatRate: number;
  discountRate: string;
  /** İskonto sonrası satır matrahı (KDV hariç) — maliyetin dayandığı tutar. */
  lineTotal: string;
  vatAmount: string;
  /** Bu satırda verilen iskonto (KDV hariç). */
  discountAmount: string;
  /** Satırın KDV dahil tutarı — yalnız ekranda gösterim için. */
  lineGrandTotal: string;
}

export interface PurchaseTotals {
  /** KDV HARİÇ toplam matrah (satıştaki subtotal ile aynı anlamda değil). */
  subtotal: string;
  discountTotal: string;
  vatTotal: string;
  /** subtotal + vatTotal — tedarikçiye borçlanılan tutar. */
  grandTotal: string;
}

export interface PurchaseBreakdown {
  lines: PurchaseLineResult[];
  totals: PurchaseTotals;
}
