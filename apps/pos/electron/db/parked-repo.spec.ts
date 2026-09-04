import { beforeEach, describe, expect, it } from 'vitest';

import { openDatabase, type PosDatabase } from './database';
import { discardParked, listParked, parkSale, unparkSale } from './parked-repo';
import type { SaleDraft } from '../shared/ipc-contracts';

const NOW = new Date('2026-09-04T10:00:00.000Z');

function draft(overrides: Partial<SaleDraft> = {}): SaleDraft {
  return {
    lines: [
      { productId: 'p1', name: 'Ekmek', quantity: '2', unitPrice: '10.00', vatRate: 1 },
      { productId: 'p2', name: 'Süt', quantity: '1', unitPrice: '30.00', vatRate: 10 },
    ],
    payments: [],
    ...overrides,
  };
}

let db: PosDatabase;

beforeEach(() => {
  db = openDatabase(':memory:');
});

describe('parked-repo', () => {
  it('sepeti park eder ve listede gösterir', () => {
    parkSale(db, { label: 'Ahmet Bey', draft: draft(), grandTotal: '50.00', now: NOW });

    const list = listParked(db);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ label: 'Ahmet Bey', itemCount: 2, grandTotal: '50.00' });
  });

  it('en son park edilen en üstte durur', () => {
    parkSale(db, { label: 'ilk', draft: draft(), grandTotal: '10.00', now: NOW });
    parkSale(db, {
      label: 'ikinci',
      draft: draft(),
      grandTotal: '20.00',
      now: new Date(NOW.getTime() + 60_000),
    });

    expect(listParked(db).map((sale) => sale.label)).toEqual(['ikinci', 'ilk']);
  });

  it('geri alınan sepet bıraktığı hâliyle döner', () => {
    const input = draft({
      contactId: 'c1',
      contactName: 'Ahmet Bey',
      documentDiscountRate: '5',
      note: 'kapıya bırak',
    });
    const parked = parkSale(db, { label: 'Ahmet', draft: input, grandTotal: '50.00', now: NOW });

    expect(unparkSale(db, parked.id)).toEqual(input);
  });

  it('geri alınan sepet listeden DÜŞER — aynı sepet iki kez satılamaz', () => {
    const parked = parkSale(db, { label: 'x', draft: draft(), grandTotal: '50.00', now: NOW });

    expect(unparkSale(db, parked.id)).not.toBeNull();
    expect(unparkSale(db, parked.id)).toBeNull();
    expect(listParked(db)).toHaveLength(0);
  });

  it('olmayan kaydı geri almak null döner', () => {
    expect(unparkSale(db, 'yok')).toBeNull();
  });

  it('park kaydı silinebilir', () => {
    const parked = parkSale(db, { label: 'x', draft: draft(), grandTotal: '50.00', now: NOW });

    expect(discardParked(db, parked.id)).toBe(true);
    expect(discardParked(db, parked.id)).toBe(false);
    expect(listParked(db)).toHaveLength(0);
  });
});
