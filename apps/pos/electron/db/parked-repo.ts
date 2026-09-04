import { randomUUID } from 'node:crypto';

import type { PosDatabase } from './database';
import type { ParkedSale, SaleDraft } from '../shared/ipc-contracts';

/**
 * Park edilmiş sepetler. Sepetin TAMAMI (satırlar, indirim, müşteri) JSON olarak
 * saklanır: park bir satış değildir, sunucu sözleşmesine uyması gerekmez ve geri
 * alındığında kasiyerin bıraktığı hâle birebir dönmelidir.
 */
export function parkSale(
  db: PosDatabase,
  input: { label: string; draft: SaleDraft; grandTotal: string; now: Date },
): ParkedSale {
  const id = randomUUID();
  const parkedAt = input.now.toISOString();
  db.prepare(
    `INSERT INTO parked_sales (id, label, payload, item_count, grand_total, parked_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    input.label,
    JSON.stringify(input.draft),
    input.draft.lines.length,
    input.grandTotal,
    parkedAt,
  );
  return {
    id,
    label: input.label,
    itemCount: input.draft.lines.length,
    grandTotal: input.grandTotal,
    parkedAt,
  };
}

/** En son park edilen en üstte — kasiyer genelde az önce beklettiğine döner. */
export function listParked(db: PosDatabase): ParkedSale[] {
  return db
    .prepare(
      `SELECT id, label, item_count AS itemCount, grand_total AS grandTotal,
              parked_at AS parkedAt
         FROM parked_sales ORDER BY parked_at DESC`,
    )
    .all() as ParkedSale[];
}

/**
 * Park edilmiş sepeti geri alır ve kaydı SİLER — aynı sepet iki kez geri alınıp
 * iki kez satılmasın. Okuma ile silme tek transaction'da.
 */
export function unparkSale(db: PosDatabase, id: string): SaleDraft | null {
  const take = db.transaction((): SaleDraft | null => {
    const row = db.prepare('SELECT payload FROM parked_sales WHERE id = ?').get(id) as
      { payload: string } | undefined;
    if (!row) return null;
    db.prepare('DELETE FROM parked_sales WHERE id = ?').run(id);
    return JSON.parse(row.payload) as SaleDraft;
  });
  return take();
}

export function discardParked(db: PosDatabase, id: string): boolean {
  return db.prepare('DELETE FROM parked_sales WHERE id = ?').run(id).changes > 0;
}
