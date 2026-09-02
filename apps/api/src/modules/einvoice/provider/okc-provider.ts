/**
 * ÖKC (Ödeme Kaydedici Cihaz / yeni nesil yazarkasa) entegrasyon sözleşmesi.
 * Faz 7'de mock; gerçek cihaz/entegrasyon bu interface'i uygular.
 */
export interface OkcSaleInput {
  receiptNo: string;
  totalAmount: string;
  vatTotal: string;
}

export interface OkcProvider {
  sendSale(input: OkcSaleInput): Promise<{ ok: boolean; fiscalId?: string }>;
  sendRefund(input: { receiptNo: string; totalAmount: string }): Promise<{ ok: boolean }>;
  getDailyReport(date: string): Promise<{ date: string; ok: boolean }>;
  ping(): Promise<{ ok: boolean }>;
}

export const OKC_PROVIDER = Symbol('OKC_PROVIDER');
