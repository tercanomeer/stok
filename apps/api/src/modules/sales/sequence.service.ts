import { Injectable } from '@nestjs/common';

import type { TenantTransaction } from '../../prisma/prisma.service.js';

/**
 * Boşluksuz ardışık belge numarası (fiş / iade). SATIŞ TRANSACTION'ı İÇİNDE çağrılır:
 * UPDATE satırı FOR UPDATE gibi kilitler, eşzamanlı satışlar burada serileşir; transaction
 * rollback olursa artış geri alınır → boşluk oluşmaz. Postgres SEQUENCE kullanılmaz
 * (nextval rollback'te geri alınmaz, 01-proje "boşluksuz" kuralını bozar).
 */
@Injectable()
export class SequenceService {
  async next(tx: TenantTransaction, tenantId: string, kind: 'SALE' | 'RETURN'): Promise<number> {
    // Satır yoksa oluştur (RLS WITH CHECK: tenantId = app.tenant_id).
    await tx.$executeRaw`
      INSERT INTO receipt_sequences ("tenantId", "kind", "lastValue", "updatedAt")
      VALUES (${tenantId}, ${kind}, 0, now())
      ON CONFLICT ("tenantId", "kind") DO NOTHING`;
    const rows = await tx.$queryRaw<{ lastValue: number }[]>`
      UPDATE receipt_sequences
      SET "lastValue" = "lastValue" + 1, "updatedAt" = now()
      WHERE "tenantId" = ${tenantId} AND "kind" = ${kind}
      RETURNING "lastValue"`;
    return rows[0]!.lastValue;
  }
}
