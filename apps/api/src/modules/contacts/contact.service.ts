import { Injectable } from '@nestjs/common';

import { AuditAction, Prisma, type ContactTransactionType, type PaymentMethod } from '@stokk/db';

import type {
  CreateContactInput,
  ListContactsInput,
  UpdateContactInput,
} from './dto/contact.dto.js';
import {
  BusinessRuleError,
  ConflictError,
  NotFoundError,
} from '../../common/errors/domain-error.js';
import { paginate, toSkipTake } from '../../common/pagination/pagination.js';
import { PrismaService, type TenantTransaction } from '../../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';

export interface ApplyContactTxInput {
  contactId: string;
  type: ContactTransactionType;
  /** Pozitif tutar. İşaret `type`'tan gelir: DEBIT +balance, CREDIT -balance. */
  amount: Prisma.Decimal | string;
  saleId?: string;
  purchaseId?: string;
  paymentMethod?: PaymentMethod;
  description?: string;
}

const CONTACT_SELECT = {
  id: true,
  type: true,
  name: true,
  code: true,
  taxNumber: true,
  taxOffice: true,
  phone: true,
  email: true,
  address: true,
  creditLimit: true,
  balance: true,
  isActive: true,
  createdAt: true,
} as const;

/**
 * Cari hesap. Bakiye konvansiyonu: balance > 0 = cari bize borçlu, < 0 = biz borçluyuz.
 * DEBIT +balance, CREDIT -balance. `balance` denormalize, hareketlerden türetilir.
 */
@Injectable()
export class ContactService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Tek cari hareketi uygular. ÇAĞIRAN BİR TRANSACTION İÇİNDE OLMALI.
   * Cari satırını FOR UPDATE ile kilitler; paralel hareketler serileşir, balanceAfter
   * ve denormalize `balance` ayrışamaz (satış/alış/tahsilat aynı cariye aynı anda gelebilir).
   */
  async applyTransaction(tx: TenantTransaction, tenantId: string, input: ApplyContactTxInput) {
    const amount = new Prisma.Decimal(input.amount);
    if (amount.lessThanOrEqualTo(0)) {
      throw new BusinessRuleError('INVALID_AMOUNT', 'Tutar pozitif olmalı.');
    }

    const locked = await tx.$queryRaw<{ id: string; balance: string; creditLimit: string }[]>`
      SELECT id, balance::text, "creditLimit"::text
      FROM contacts WHERE id = ${input.contactId} AND "deletedAt" IS NULL
      FOR UPDATE`;

    const contact = locked[0];
    if (!contact) throw new NotFoundError('Cari bulunamadı.');

    const current = new Prisma.Decimal(contact.balance);
    const signed = input.type === 'DEBIT' ? amount : amount.negated();
    const balanceAfter = current.plus(signed);

    const transaction = await tx.contactTransaction.create({
      data: {
        tenantId,
        contactId: input.contactId,
        type: input.type,
        amount,
        balanceAfter,
        saleId: input.saleId ?? null,
        purchaseId: input.purchaseId ?? null,
        paymentMethod: input.paymentMethod ?? null,
        description: input.description ?? null,
      },
    });

    await tx.contact.update({ where: { id: input.contactId }, data: { balance: balanceAfter } });
    return transaction;
  }

  // --- CRUD ---
  async list(input: ListContactsInput) {
    return this.prisma.withTenant(async (tx) => {
      const where: Prisma.ContactWhereInput = { deletedAt: null };
      if (input.type) where.type = { in: [input.type, 'BOTH'] };
      if (input.balance === 'debtor') where.balance = { gt: 0 };
      if (input.balance === 'creditor') where.balance = { lt: 0 };
      if (input.search) {
        where.OR = [
          { name: { contains: input.search, mode: 'insensitive' } },
          { code: { contains: input.search, mode: 'insensitive' } },
          { taxNumber: { contains: input.search } },
        ];
      }
      const { skip, take } = toSkipTake(input);
      const [total, items] = await Promise.all([
        tx.contact.count({ where }),
        tx.contact.findMany({
          where,
          select: CONTACT_SELECT,
          orderBy: { createdAt: 'desc' },
          skip,
          take,
        }),
      ]);
      return paginate(items, total, input);
    });
  }

  async findOne(id: string) {
    const contact = await this.prisma.withTenant((tx) =>
      tx.contact.findFirst({ where: { id, deletedAt: null }, select: CONTACT_SELECT }),
    );
    if (!contact) throw new NotFoundError('Cari bulunamadı.');
    return contact;
  }

  async create(input: CreateContactInput) {
    const contact = await this.prisma.withTenant((tx, tenantId) =>
      tx.contact.create({
        data: {
          tenantId,
          type: input.type,
          name: input.name,
          code: input.code ?? null,
          taxNumber: input.taxNumber ?? null,
          taxOffice: input.taxOffice ?? null,
          phone: input.phone ?? null,
          email: input.email ?? null,
          address: input.address ?? null,
          creditLimit: input.creditLimit ?? '0',
          note: input.note ?? null,
        },
        select: CONTACT_SELECT,
      }),
    );
    await this.audit.record({
      action: AuditAction.CREATE,
      entity: 'Contact',
      entityId: contact.id,
    });
    return contact;
  }

  async update(id: string, input: UpdateContactInput) {
    const contact = await this.prisma.withTenant(async (tx) => {
      const existing = await tx.contact.findFirst({
        where: { id, deletedAt: null },
        select: { id: true },
      });
      if (!existing) throw new NotFoundError('Cari bulunamadı.');
      return tx.contact.update({
        where: { id },
        data: {
          ...(input.type === undefined ? {} : { type: input.type }),
          ...(input.name === undefined ? {} : { name: input.name }),
          ...(input.code === undefined ? {} : { code: input.code }),
          ...(input.taxNumber === undefined ? {} : { taxNumber: input.taxNumber }),
          ...(input.taxOffice === undefined ? {} : { taxOffice: input.taxOffice }),
          ...(input.phone === undefined ? {} : { phone: input.phone }),
          ...(input.email === undefined ? {} : { email: input.email }),
          ...(input.address === undefined ? {} : { address: input.address }),
          ...(input.creditLimit === undefined ? {} : { creditLimit: input.creditLimit }),
          ...(input.isActive === undefined ? {} : { isActive: input.isActive }),
          ...(input.note === undefined ? {} : { note: input.note }),
        },
        select: CONTACT_SELECT,
      });
    });
    await this.audit.record({ action: AuditAction.UPDATE, entity: 'Contact', entityId: id });
    return contact;
  }

  async remove(id: string): Promise<void> {
    await this.prisma.withTenant(async (tx) => {
      const contact = await tx.contact.findFirst({
        where: { id, deletedAt: null },
        select: { id: true, balance: true },
      });
      if (!contact) throw new NotFoundError('Cari bulunamadı.');
      if (!contact.balance.isZero()) {
        throw new ConflictError('Bakiyesi olan cari silinemez, önce kapatın.');
      }
      await tx.contact.update({ where: { id }, data: { deletedAt: new Date(), isActive: false } });
    });
    await this.audit.record({ action: AuditAction.DELETE, entity: 'Contact', entityId: id });
  }
}
