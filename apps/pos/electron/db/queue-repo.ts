import type { PosDatabase } from './database';
import { MAX_ATTEMPTS, nextAttemptAt } from '../lib/backoff';

export type QueueEntity = 'sale';
export type QueueStatus = 'PENDING' | 'SYNCED' | 'FAILED';

export interface QueueRow {
  id: number;
  entity: QueueEntity;
  entityId: string;
  payload: string;
  attempts: number;
}

export interface QueueCounts {
  pending: number;
  failed: number;
}

export interface FailedQueueRow {
  entityId: string;
  attempts: number;
  lastError: string | null;
  updatedAt: string;
  soldAt: string | null;
  grandTotal: string | null;
}

/**
 * Kuyruğa alır. `INSERT OR IGNORE` + UNIQUE(entity, entity_id): aynı satış ikinci kez
 * kuyruğa GİRMEZ — çift gönderimin yerel tarafındaki savunma. Sunucu tarafı
 * `clientSaleId` benzersizliğiyle aynı garantiyi kendi başına da verir.
 *
 * @returns kuyruğa yeni bir kayıt eklendiyse true
 */
export function enqueue(
  db: PosDatabase,
  input: { entity: QueueEntity; entityId: string; payload: unknown; now: Date },
): boolean {
  const iso = input.now.toISOString();
  const result = db
    .prepare(
      `INSERT OR IGNORE INTO sync_queue
         (entity, entity_id, payload, status, attempts, next_attempt_at, created_at, updated_at)
       VALUES (?, ?, ?, 'PENDING', 0, ?, ?, ?)`,
    )
    .run(input.entity, input.entityId, JSON.stringify(input.payload), iso, iso, iso);
  return result.changes > 0;
}

/** Gönderilmeye hazır (bekleme süresi dolmuş) kayıtlar, eski→yeni. */
export function claimDue(db: PosDatabase, now: Date, limit: number): QueueRow[] {
  return db
    .prepare(
      `SELECT id, entity, entity_id AS entityId, payload, attempts
         FROM sync_queue
        WHERE status = 'PENDING' AND next_attempt_at <= ?
        ORDER BY id ASC
        LIMIT ?`,
    )
    .all(now.toISOString(), limit) as QueueRow[];
}

export function markSynced(db: PosDatabase, ids: readonly number[], now: Date): void {
  if (ids.length === 0) return;
  const statement = db.prepare(
    `UPDATE sync_queue SET status = 'SYNCED', last_error = NULL, updated_at = ? WHERE id = ?`,
  );
  const run = db.transaction((rows: readonly number[]) => {
    for (const id of rows) statement.run(now.toISOString(), id);
  });
  run(ids);
}

/**
 * Başarısız denemeyi işler: sayaç artar, bir sonraki deneme geriye doğru ötelenir.
 * `MAX_ATTEMPTS`'e ulaşınca kayıt FAILED olur ve döngü onu bir daha almaz.
 *
 * @returns kayıt kalıcı hata kuyruğuna düştüyse true
 */
export function markRetry(
  db: PosDatabase,
  input: { id: number; attempts: number; error: string; now: Date; random?: () => number },
): boolean {
  const attempts = input.attempts + 1;
  const exhausted = attempts >= MAX_ATTEMPTS;
  db.prepare(
    `UPDATE sync_queue
        SET status = ?, attempts = ?, last_error = ?, next_attempt_at = ?, updated_at = ?
      WHERE id = ?`,
  ).run(
    exhausted ? 'FAILED' : 'PENDING',
    attempts,
    input.error.slice(0, 500),
    nextAttemptAt(attempts, input.now, input.random),
    input.now.toISOString(),
    input.id,
  );
  return exhausted;
}

export function counts(db: PosDatabase): QueueCounts {
  const row = db
    .prepare(
      `SELECT
         SUM(CASE WHEN status = 'PENDING' THEN 1 ELSE 0 END) AS pending,
         SUM(CASE WHEN status = 'FAILED'  THEN 1 ELSE 0 END) AS failed
       FROM sync_queue`,
    )
    .get() as { pending: number | null; failed: number | null };
  return { pending: row.pending ?? 0, failed: row.failed ?? 0 };
}

/** Elle müdahale bekleyen satışlar — kullanıcıya gösterilir. */
export function listFailed(db: PosDatabase): FailedQueueRow[] {
  return db
    .prepare(
      `SELECT q.entity_id AS entityId, q.attempts, q.last_error AS lastError,
              q.updated_at AS updatedAt, s.sold_at AS soldAt, s.grand_total AS grandTotal
         FROM sync_queue q
         LEFT JOIN local_sales s ON s.id = q.entity_id
        WHERE q.status = 'FAILED'
        ORDER BY q.updated_at DESC`,
    )
    .all() as FailedQueueRow[];
}

/** "Tekrar dene" — sayaç sıfırlanır, kayıtlar bir sonraki turda gider. */
export function requeueFailed(db: PosDatabase, now: Date): number {
  const iso = now.toISOString();
  const result = db
    .prepare(
      `UPDATE sync_queue
          SET status = 'PENDING', attempts = 0, next_attempt_at = ?, updated_at = ?
        WHERE status = 'FAILED'`,
    )
    .run(iso, iso);
  db.prepare(`UPDATE local_sales SET status = 'PENDING' WHERE status = 'FAILED'`).run();
  return result.changes;
}
