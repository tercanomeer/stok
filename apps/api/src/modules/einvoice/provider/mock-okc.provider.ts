import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';

import type { OkcProvider, OkcSaleInput } from './okc-provider.js';

/** Deterministik mock ÖKC. Ağ/donanım yok; her çağrı başarıyla döner. */
@Injectable()
export class MockOkcProvider implements OkcProvider {
  sendSale(_input: OkcSaleInput): Promise<{ ok: boolean; fiscalId?: string }> {
    return Promise.resolve({ ok: true, fiscalId: randomUUID() });
  }

  sendRefund(_input: { receiptNo: string; totalAmount: string }): Promise<{ ok: boolean }> {
    return Promise.resolve({ ok: true });
  }

  getDailyReport(date: string): Promise<{ date: string; ok: boolean }> {
    return Promise.resolve({ date, ok: true });
  }

  ping(): Promise<{ ok: boolean }> {
    return Promise.resolve({ ok: true });
  }
}
