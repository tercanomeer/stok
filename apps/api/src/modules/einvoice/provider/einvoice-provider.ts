/**
 * E-Fatura / E-Arşiv entegratör sözleşmesi. Gerçek entegrasyon (ör. GİB, özel entegratör)
 * bu interface'i uygular; Faz 7'de mock ile geliştirilir. Servis katmanı yalnız bu
 * soyutlamaya bağımlıdır (03-mimari: yasal adapter'lar arkasında).
 */
export interface CreateInvoiceInput {
  type: 'E_INVOICE' | 'E_ARCHIVE';
  totalAmount: string;
  vatTotal: string;
  customerName?: string | undefined;
  customerTaxNumber?: string | undefined;
}

export interface ProviderInvoiceResult {
  externalId: string;
  invoiceNo: string;
  status: 'SENT' | 'REJECTED';
  response: Record<string, unknown>;
  errorMessage?: string;
}

export interface ProviderStatusResult {
  status: 'SENT' | 'ACCEPTED' | 'REJECTED' | 'CANCELLED';
  response: Record<string, unknown>;
}

export interface EInvoiceProvider {
  createInvoice(input: CreateInvoiceInput): Promise<ProviderInvoiceResult>;
  getStatus(externalId: string): Promise<ProviderStatusResult>;
  getPdf(externalId: string): Promise<Buffer>;
  cancel(externalId: string): Promise<ProviderStatusResult>;
}

export const EINVOICE_PROVIDER = Symbol('EINVOICE_PROVIDER');
