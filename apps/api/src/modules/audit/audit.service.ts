import { Injectable, Logger } from '@nestjs/common';

import { AuditAction, Prisma } from '@stokk/db';

import { PrismaService } from '../../prisma/prisma.service.js';
import { getTenantContext } from '../../prisma/tenant-context.js';

export interface AuditEntry {
  action: AuditAction;
  entity: string;
  entityId?: string;
  changes?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}

/** PII yazılmaz — CLAUDE.md "Audit log'a PII yazma (şifre, kart no, CVV)". */
const REDACTED_FIELDS = new Set([
  'password',
  'passwordHash',
  'totpSecret',
  'refreshToken',
  'tokenHash',
  'cardNumber',
  'cvv',
  'pan',
]);

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async record(entry: AuditEntry): Promise<void> {
    const context = getTenantContext();
    if (!context) {
      this.logger.warn(`Tenant bağlamı olmadan audit kaydı atlandı: ${entry.entity}`);
      return;
    }

    try {
      await this.prisma.withTenant((tx) =>
        tx.auditLog.create({
          data: {
            tenantId: context.tenantId,
            userId: context.userId,
            action: entry.action,
            entity: entry.entity,
            entityId: entry.entityId ?? null,
            // Nullable Json sütununda SQL NULL için Prisma.DbNull gerekiyor.
            changes: entry.changes
              ? (redact(entry.changes) as Prisma.InputJsonObject)
              : Prisma.DbNull,
            ipAddress: entry.ipAddress ?? null,
            userAgent: entry.userAgent ?? null,
          },
        }),
      );
    } catch (error: unknown) {
      // Denetim kaydı asıl işlemi düşürmez; kaybı log'a yazıp devam ederiz.
      this.logger.error(
        `Audit kaydı yazılamadı (${entry.entity}): ${error instanceof Error ? error.message : 'bilinmeyen'}`,
      );
    }
  }
}

export function redact(input: Record<string, unknown>): Record<string, unknown> {
  const output: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(input)) {
    if (REDACTED_FIELDS.has(key)) {
      output[key] = '[gizlendi]';
    } else if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      output[key] = redact(value as Record<string, unknown>);
    } else {
      output[key] = value;
    }
  }

  return output;
}
