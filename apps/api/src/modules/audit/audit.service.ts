import { Injectable, Logger } from '@nestjs/common';

import { AuditAction, Prisma } from '@stokk/db';

import type { ListAuditLogsInput } from './dto/audit.dto.js';
import { paginate, toSkipTake } from '../../common/pagination/pagination.js';
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
  /**
   * Denetim kaydı listesi — kim, ne zaman, neyi değiştirdi.
   * Salt okunur: audit kaydı ekrandan düzenlenemez, silinemez.
   */
  async list(input: ListAuditLogsInput) {
    return this.prisma.withTenant(async (tx) => {
      const where: Prisma.AuditLogWhereInput = {};
      if (input.action) where.action = input.action;
      if (input.entity) where.entity = input.entity;
      if (input.userId) where.userId = input.userId;
      if (input.from || input.to) {
        where.createdAt = {
          ...(input.from ? { gte: new Date(input.from) } : {}),
          ...(input.to ? { lte: new Date(input.to) } : {}),
        };
      }
      if (input.search) {
        where.OR = [
          { entity: { contains: input.search, mode: 'insensitive' } },
          { entityId: { contains: input.search } },
        ];
      }

      const { skip, take } = toSkipTake(input);
      const [total, items] = await Promise.all([
        tx.auditLog.count({ where }),
        tx.auditLog.findMany({
          where,
          select: {
            id: true,
            action: true,
            entity: true,
            entityId: true,
            changes: true,
            ipAddress: true,
            createdAt: true,
            user: { select: { id: true, fullName: true } },
          },
          orderBy: { createdAt: 'desc' },
          skip,
          take,
        }),
      ]);
      return paginate(items, total, input);
    });
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
