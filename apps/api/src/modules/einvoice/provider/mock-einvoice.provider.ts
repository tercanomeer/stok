import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';

import type {
  CreateInvoiceInput,
  EInvoiceProvider,
  ProviderInvoiceResult,
  ProviderStatusResult,
} from './einvoice-provider.js';

/**
 * Deterministik mock entegratör. Gerçek entegratör gelene kadar akışı (DRAFT→SENT→ACCEPTED,
 * PDF, iptal) uçtan uca çalıştırır. Ağ çağrısı yapmaz; PII saklamaz.
 */
@Injectable()
export class MockEInvoiceProvider implements EInvoiceProvider {
  createInvoice(input: CreateInvoiceInput): Promise<ProviderInvoiceResult> {
    const externalId = randomUUID();
    const prefix = input.type === 'E_INVOICE' ? 'EF' : 'EA';
    return Promise.resolve({
      externalId,
      invoiceNo: `${prefix}${Date.now().toString(36).toUpperCase()}`,
      status: 'SENT',
      response: { accepted: true, mock: true, externalId },
    });
  }

  getStatus(externalId: string): Promise<ProviderStatusResult> {
    // Mock: gönderilmiş fatura entegratörce kabul edilir.
    return Promise.resolve({ status: 'ACCEPTED', response: { externalId, mock: true } });
  }

  async getPdf(externalId: string): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 48, size: 'A4' });
      const chunks: Buffer[] = [];
      doc.on('data', (c: Buffer) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
      doc.fontSize(18).text('E-Fatura (MOCK)', { align: 'center' }).moveDown();
      doc.fontSize(10).text(`Belge No (ETTN): ${externalId}`);
      doc.text('Bu bir test/mock belgesidir.');
      doc.end();
    });
  }

  cancel(externalId: string): Promise<ProviderStatusResult> {
    return Promise.resolve({
      status: 'CANCELLED',
      response: { externalId, cancelled: true, mock: true },
    });
  }
}
