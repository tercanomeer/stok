import { beforeEach, describe, expect, it } from 'vitest';

import { openDatabase, type PosDatabase } from './database';
import {
  findLocalSale,
  markSaleSynced,
  saveLocalSale,
  type LocalSaleInput,
} from './local-sale-repo';
import { claimDue, counts } from './queue-repo';

const NOW = new Date('2026-09-03T10:00:00.000Z');

function saleInput(overrides: Partial<LocalSaleInput> = {}): LocalSaleInput {
  return {
    cashSessionId: 'cs1',
    soldAt: '2026-09-03T09:59:00.000Z',
    lines: [
      {
        productId: 'p1',
        name: 'Ekmek',
        quantity: '2',
        unitPrice: '10.00',
        vatRate: 1,
      },
    ],
    payments: [{ method: 'CASH', amount: '20.00', receivedAmount: '50.00' }],
    ...overrides,
  };
}

describe('yerel satış deposu', () => {
  let db: PosDatabase;

  beforeEach(() => {
    db = openDatabase(':memory:');
  });

  it('satışı yazar ve AYNI transaction içinde kuyruğa alır', () => {
    const sale = saveLocalSale(db, saleInput(), NOW, 'client-1');

    expect(sale.status).toBe('PENDING');
    expect(findLocalSale(db, 'client-1')?.grandTotal).toBe(sale.grandTotal);
    expect(counts(db)).toEqual({ pending: 1, failed: 0 });
  });

  it('tutarı pos-core hesaplar — POS kendi formülünü yazmaz', () => {
    // 2 × 10.00 TL, KDV dahil fiyat → grandTotal 20.00
    const sale = saveLocalSale(db, saleInput(), NOW, 'client-1');
    expect(sale.grandTotal).toBe('20.00');

    // %10 satır indirimi → 18.00
    const discounted = saveLocalSale(
      db,
      saleInput({
        lines: [
          {
            productId: 'p1',
            name: 'Ekmek',
            quantity: '2',
            unitPrice: '10.00',
            vatRate: 1,
            discountRate: '10',
          },
        ],
        payments: [{ method: 'CASH', amount: '18.00' }],
      }),
      NOW,
      'client-2',
    );
    expect(discounted.grandTotal).toBe('18.00');
  });

  it('kuyruk gövdesi sunucunun beklediği alanları taşır (clientSaleId dahil)', () => {
    saveLocalSale(db, saleInput({ note: 'kapıda' }), NOW, 'client-1');
    const [row] = claimDue(db, NOW, 10);
    const payload = JSON.parse(row?.payload ?? '{}') as Record<string, unknown>;

    expect(payload.clientSaleId).toBe('client-1');
    expect(payload.cashSessionId).toBe('cs1');
    expect(payload.soldAt).toBe('2026-09-03T09:59:00.000Z');
    expect(payload.note).toBe('kapıda');
    expect(payload.lines).toHaveLength(1);
    expect(payload.payments).toHaveLength(1);
    // Yerel gösterim alanı (`name`) sunucu sözleşmesinde YOK — strict parse'a takılırdı.
    expect(JSON.stringify(payload.lines)).not.toContain('Ekmek');
  });

  it('kalem ve ödemeler satışa bağlı yazılır', () => {
    saveLocalSale(db, saleInput(), NOW, 'client-1');
    const items = db.prepare('SELECT * FROM local_sale_items WHERE sale_id = ?').all('client-1');
    const payments = db.prepare('SELECT * FROM local_payments WHERE sale_id = ?').all('client-1');
    expect(items).toHaveLength(1);
    expect(payments).toHaveLength(1);
  });

  it('sunucu kabul edince gerçek fiş numarası yerel kayda yazılır', () => {
    saveLocalSale(db, saleInput(), NOW, 'client-1');
    markSaleSynced(db, 'client-1', { saleId: 'srv-1', receiptNo: 'F-000042' });

    const stored = findLocalSale(db, 'client-1');
    expect(stored?.status).toBe('SYNCED');
    expect(stored?.receiptNo).toBe('F-000042');
    expect(stored?.serverSaleId).toBe('srv-1');
  });
});
