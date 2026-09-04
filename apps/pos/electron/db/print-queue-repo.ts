import { randomUUID } from 'node:crypto';

import type { PosDatabase } from './database';
import type { PrintJob, ReceiptData } from '../shared/ipc-contracts';

/**
 * Kuyrukta tutulacak en fazla fiş.
 *
 * Yazıcısı günlerce bozuk kalan bir dükkânda kuyruk sınırsız birikirdi; her satır
 * bir fişin tamamını (JSON) taşıdığı için hem SQLite dosyası hem de listeyi tek
 * seferde okuyan ekran şişerdi. Sınır aşılınca EN ESKİ kayıtlar düşer: kasiyerin
 * geriye dönüp basacağı fiş her zaman en yenilerdir.
 */
const MAX_JOBS = 200;

/**
 * Basılamamış fişler.
 *
 * Kuyruk `sync_queue`'dan AYRI: senkronizasyon kuyruğu para/stok doğruluğu için
 * vazgeçilmezdir, bu kuyruk ise yalnız kağıt işidir. Karıştırılırsa "yazıcı
 * kapalı" hatası satışın sunucuya gitmesini geciktirirdi.
 */
export function enqueue(
  db: PosDatabase,
  input: { clientSaleId: string; receipt: ReceiptData; error: string; now: Date },
): PrintJob {
  const id = randomUUID();
  const iso = input.now.toISOString();
  db.prepare(
    `INSERT INTO print_queue (id, client_sale_id, payload, attempts, last_error, created_at, updated_at)
     VALUES (?, ?, ?, 1, ?, ?, ?)`,
  ).run(id, input.clientSaleId, JSON.stringify(input.receipt), input.error, iso, iso);
  trim(db);
  return {
    id,
    clientSaleId: input.clientSaleId,
    receiptNo: input.receipt.receiptNo,
    grandTotal: input.receipt.grandTotal,
    attempts: 1,
    lastError: input.error,
    createdAt: iso,
  };
}

/** Eskiden yeniye: fişler basıldıkları sırayla çıksın. */
export function listPending(db: PosDatabase): PrintJob[] {
  const rows = db
    .prepare(
      `SELECT id, client_sale_id AS clientSaleId, payload, attempts,
              last_error AS lastError, created_at AS createdAt
         FROM print_queue ORDER BY created_at`,
    )
    .all() as (Omit<PrintJob, 'receiptNo' | 'grandTotal'> & { payload: string })[];

  return rows.map((row) => {
    // Bozuk bir satır BÜTÜN listeyi düşürmemeli: kasiyer o zaman kuyruğu hiç
    // göremez ve bozuk kaydı silemezdi.
    const receipt = parseReceipt(row.payload);
    return {
      id: row.id,
      clientSaleId: row.clientSaleId,
      receiptNo: receipt?.receiptNo ?? null,
      grandTotal: receipt?.grandTotal ?? '0.00',
      attempts: row.attempts,
      lastError: receipt ? row.lastError : 'Fiş kaydı okunamıyor.',
      createdAt: row.createdAt,
    };
  });
}

/** Sınırı aşan en eski kayıtları düşürür. */
function trim(db: PosDatabase): void {
  db.prepare(
    `DELETE FROM print_queue WHERE id IN (
       SELECT id FROM print_queue ORDER BY created_at DESC LIMIT -1 OFFSET ?
     )`,
  ).run(MAX_JOBS);
}

export function countPending(db: PosDatabase): number {
  const row = db.prepare('SELECT COUNT(*) AS total FROM print_queue').get() as { total: number };
  return row.total;
}

/** Okunamayan fiş `null` döner; çağıran o kaydı kuyruktan düşürür. */
export function readReceipt(db: PosDatabase, id: string): ReceiptData | null {
  const row = db.prepare('SELECT payload FROM print_queue WHERE id = ?').get(id) as
    { payload: string } | undefined;
  return row ? parseReceipt(row.payload) : null;
}

/** Bozuk JSON kuyruğu düşürmemeli; okunamayan kayıt `null` olur. */
function parseReceipt(payload: string): ReceiptData | null {
  try {
    return JSON.parse(payload) as ReceiptData;
  } catch {
    return null;
  }
}

export function markAttempt(db: PosDatabase, id: string, error: string, now: Date): void {
  db.prepare(
    `UPDATE print_queue SET attempts = attempts + 1, last_error = ?, updated_at = ? WHERE id = ?`,
  ).run(error, now.toISOString(), id);
}

export function remove(db: PosDatabase, id: string): boolean {
  return db.prepare('DELETE FROM print_queue WHERE id = ?').run(id).changes > 0;
}
