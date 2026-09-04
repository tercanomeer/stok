import { Injectable } from '@nestjs/common';

import { AuditAction, CashMovementType, Prisma } from '@stokk/db';

import {
  BusinessRuleError,
  ConflictError,
  NotFoundError,
} from '../../common/errors/domain-error.js';
import { PrismaService, type TenantTransaction } from '../../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import type {
  CashMovementInput,
  CloseSessionInput,
  OpenSessionInput,
} from './dto/cash-session.dto.js';

export interface RecordCashMovementInput {
  cashSessionId: string;
  type: CashMovementType;
  /** İşaretli tutar: kasaya giriş pozitif, çıkış negatif. */
  amount: Prisma.Decimal | string;
  description?: string;
  saleId?: string;
  createdById?: string;
}

@Injectable()
export class CashSessionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Vardiya aç: kasa başına tek açık vardiya. Açılış nakiti OPENING hareketi olarak yazılır. */
  async open(input: OpenSessionInput, userId: string) {
    const session = await this.prisma.withTenant(async (tx, tenantId) => {
      const register = await tx.register.findFirst({
        where: { id: input.registerId, deletedAt: null },
        select: { id: true, isActive: true },
      });
      if (!register) throw new NotFoundError('Kasa bulunamadı.');
      if (!register.isActive) throw new BusinessRuleError('REGISTER_INACTIVE', 'Kasa pasif.');

      const open = await tx.cashSession.findFirst({
        where: { registerId: input.registerId, status: 'OPEN' },
        select: { id: true },
      });
      if (open) throw new ConflictError('Bu kasada zaten açık bir vardiya var.');

      const opening = new Prisma.Decimal(input.openingAmount);
      const created = await tx.cashSession.create({
        data: {
          tenantId,
          registerId: input.registerId,
          userId,
          status: 'OPEN',
          openingAmount: opening,
          note: input.note ?? null,
        },
        select: { id: true, registerId: true, status: true, openingAmount: true, openedAt: true },
      });
      await this.recordMovement(tx, tenantId, {
        cashSessionId: created.id,
        type: 'OPENING',
        amount: opening,
        description: 'Açılış nakiti',
        createdById: userId,
      });
      return created;
    });
    await this.audit.record({
      action: AuditAction.CREATE,
      entity: 'CashSession',
      entityId: session.id,
    });
    return session;
  }

  /**
   * Vardiya kapat: beklenen = kasa hareketlerinin toplamı (açılış + nakit satış + tahsilat
   * − gider − nakit iade ± manuel), fark = sayılan − beklenen. Fark eşiği aşsa da vardiya kapanır.
   */
  async close(id: string, input: CloseSessionInput) {
    const result = await this.prisma.withTenant(async (tx) => {
      const session = await tx.cashSession.findFirst({
        where: { id },
        select: { id: true, status: true },
      });
      if (!session) throw new NotFoundError('Vardiya bulunamadı.');

      // Atomik claim: yalnız OPEN iken CLOSED'a çevir (çift kapama önleme).
      const claimed = await tx.cashSession.updateMany({
        where: { id, status: 'OPEN' },
        data: { status: 'CLOSED' },
      });
      if (claimed.count === 0) throw new ConflictError('Vardiya zaten kapatılmış.');

      const agg = await tx.cashMovement.aggregate({
        where: { cashSessionId: id },
        _sum: { amount: true },
      });
      const expected = agg._sum.amount ?? new Prisma.Decimal(0);
      const closing = new Prisma.Decimal(input.closingAmount);
      const difference = closing.minus(expected);

      const settings = await tx.tenantSettings.findFirst({
        select: { cashDifferenceThreshold: true },
      });
      const threshold = settings?.cashDifferenceThreshold ?? new Prisma.Decimal(0);

      const updated = await tx.cashSession.update({
        where: { id },
        data: {
          closingAmount: closing,
          expectedAmount: expected,
          differenceAmount: difference,
          closedAt: new Date(),
          ...(input.note === undefined ? {} : { note: input.note }),
        },
        select: {
          id: true,
          status: true,
          openingAmount: true,
          closingAmount: true,
          expectedAmount: true,
          differenceAmount: true,
          closedAt: true,
        },
      });
      return { session: updated, overThreshold: difference.abs().greaterThan(threshold) };
    });
    await this.audit.record({
      action: AuditAction.UPDATE,
      entity: 'CashSession',
      entityId: id,
      changes: { status: 'CLOSED', difference: result.session.differenceAmount?.toString() },
    });
    return result;
  }

  /** Manuel kasa hareketi (para ekle/çek). İşaret tipe göre kurulur. */
  async addMovement(id: string, input: CashMovementInput, userId: string) {
    const movement = await this.prisma.withTenant(async (tx, tenantId) => {
      const session = await tx.cashSession.findFirst({
        where: { id },
        select: { status: true },
      });
      if (!session) throw new NotFoundError('Vardiya bulunamadı.');
      if (session.status !== 'OPEN') {
        throw new BusinessRuleError('SESSION_CLOSED', 'Kapalı vardiyaya hareket eklenemez.');
      }
      const magnitude = new Prisma.Decimal(input.amount);
      const signed = input.type === 'DEPOSIT' ? magnitude : magnitude.negated();
      return this.recordMovement(tx, tenantId, {
        cashSessionId: id,
        type: input.type,
        amount: signed,
        description: input.description,
        createdById: userId,
      });
    });
    await this.audit.record({
      action: AuditAction.CREATE,
      entity: 'CashMovement',
      entityId: movement.id,
    });
    return movement;
  }

  /** Kasa hareketi yazan tek yol — satış modülü de bunu (aynı tx içinde) çağırır. */
  async recordMovement(tx: TenantTransaction, tenantId: string, input: RecordCashMovementInput) {
    return tx.cashMovement.create({
      data: {
        tenantId,
        cashSessionId: input.cashSessionId,
        type: input.type,
        amount: new Prisma.Decimal(input.amount),
        description: input.description ?? null,
        saleId: input.saleId ?? null,
        createdById: input.createdById ?? null,
      },
      select: { id: true, type: true, amount: true, createdAt: true },
    });
  }

  async list(status?: 'OPEN' | 'CLOSED') {
    return this.prisma.withTenant((tx) =>
      tx.cashSession.findMany({
        where: status ? { status } : {},
        select: {
          id: true,
          registerId: true,
          userId: true,
          status: true,
          openingAmount: true,
          closingAmount: true,
          differenceAmount: true,
          openedAt: true,
          closedAt: true,
          register: { select: { name: true } },
        },
        orderBy: { openedAt: 'desc' },
      }),
    );
  }

  /**
   * Bir kasadaki AÇIK vardiya. POS vardiya açılış ekranı bunu sorar: kasiyerde
   * `cash-session.view-all` yetkisi yok (tüm vardiyaları göremez) ama kendi kasasında
   * açık vardiya olup olmadığını bilmek zorunda — yoksa her açılışta 409'a çarpar ve
   * devam eden vardiyaya katılamaz.
   */
  async findOpenByRegister(registerId: string) {
    return this.prisma.withTenant((tx) =>
      tx.cashSession.findFirst({
        where: { registerId, status: 'OPEN' },
        select: {
          id: true,
          registerId: true,
          userId: true,
          status: true,
          openingAmount: true,
          openedAt: true,
        },
      }),
    );
  }

  async findOne(id: string) {
    const session = await this.prisma.withTenant((tx) =>
      tx.cashSession.findFirst({
        where: { id },
        select: {
          id: true,
          registerId: true,
          userId: true,
          status: true,
          openingAmount: true,
          closingAmount: true,
          expectedAmount: true,
          differenceAmount: true,
          openedAt: true,
          closedAt: true,
          note: true,
          movements: {
            select: { id: true, type: true, amount: true, description: true, createdAt: true },
            orderBy: { createdAt: 'asc' },
          },
        },
      }),
    );
    if (!session) throw new NotFoundError('Vardiya bulunamadı.');
    return session;
  }
}
