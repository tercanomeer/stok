import { Inject, Injectable } from '@nestjs/common';

import { AuditAction, Prisma, type EInvoiceType } from '@stokk/db';

import {
  BusinessRuleError,
  ConflictError,
  NotFoundError,
} from '../../common/errors/domain-error.js';
import { paginate, toSkipTake } from '../../common/pagination/pagination.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import type { ListEInvoicesInput } from './dto/einvoice.dto.js';
import { EINVOICE_PROVIDER, type EInvoiceProvider } from './provider/einvoice-provider.js';

const SELECT = {
  id: true,
  saleId: true,
  contactId: true,
  type: true,
  status: true,
  externalId: true,
  invoiceNo: true,
  totalAmount: true,
  vatTotal: true,
  errorMessage: true,
  sentAt: true,
  respondedAt: true,
  createdAt: true,
} as const;

/**
 * E-Fatura/E-Arşiv kayıt ve durum akışı: DRAFT → SENT → ACCEPTED/REJECTED (→ CANCELLED).
 * Entegratör soyutlaması (EInvoiceProvider) arkasında; Faz 7'de mock.
 */
@Injectable()
export class EInvoiceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Inject(EINVOICE_PROVIDER) private readonly provider: EInvoiceProvider,
  ) {}

  /**
   * Satıştan e-belge taslağı üretir. Mükellef (vergi no'lu) cari → E_FATURA, aksi halde
   * E_ARŞİV. E-Arşiv, mükellef olmayan satışlarda tenant eşiği (eArchiveThreshold) üstünde
   * zorunludur; altında da üretilebilir (bilgi amaçlı işaretlenir).
   */
  async createFromSale(saleId: string) {
    const einvoice = await this.prisma.withTenant(async (tx, tenantId) => {
      const sale = await tx.sale.findFirst({
        where: { id: saleId },
        select: {
          id: true,
          status: true,
          grandTotal: true,
          vatTotal: true,
          contactId: true,
          contact: { select: { name: true, taxNumber: true } },
        },
      });
      if (!sale) throw new NotFoundError('Satış bulunamadı.');
      if (sale.status === 'CANCELLED' || sale.status === 'PARKED') {
        throw new BusinessRuleError('SALE_NOT_INVOICEABLE', 'Bu satış için belge kesilemez.');
      }
      const existing = await tx.eInvoice.findFirst({
        where: { saleId, status: { not: 'CANCELLED' } },
        select: { id: true },
      });
      if (existing) throw new ConflictError('Bu satış için zaten bir e-belge var.');

      const type: EInvoiceType = sale.contact?.taxNumber ? 'E_INVOICE' : 'E_ARCHIVE';
      return tx.eInvoice.create({
        data: {
          tenantId,
          saleId,
          contactId: sale.contactId ?? null,
          type,
          status: 'DRAFT',
          totalAmount: sale.grandTotal,
          vatTotal: sale.vatTotal,
        },
        select: SELECT,
      });
    });
    await this.audit.record({
      action: AuditAction.CREATE,
      entity: 'EInvoice',
      entityId: einvoice.id,
    });
    return einvoice;
  }

  /** DRAFT → SENT: entegratöre gönderir. */
  async send(id: string) {
    const einvoice = await this.prisma.withTenant(async (tx) => {
      const record = await tx.eInvoice.findFirst({
        where: { id },
        select: {
          id: true,
          status: true,
          type: true,
          totalAmount: true,
          vatTotal: true,
          contact: { select: { name: true, taxNumber: true } },
        },
      });
      if (!record) throw new NotFoundError('E-belge bulunamadı.');
      if (record.status !== 'DRAFT') throw new ConflictError('Yalnız taslak belge gönderilir.');

      const result = await this.provider.createInvoice({
        type: record.type,
        totalAmount: record.totalAmount.toFixed(2),
        vatTotal: record.vatTotal.toFixed(2),
        customerName: record.contact?.name,
        customerTaxNumber: record.contact?.taxNumber ?? undefined,
      });

      return tx.eInvoice.update({
        where: { id },
        data: {
          status: result.status,
          externalId: result.externalId,
          invoiceNo: result.invoiceNo,
          providerResponse: result.response as Prisma.InputJsonValue,
          errorMessage: result.errorMessage ?? null,
          sentAt: new Date(),
          ...(result.status === 'REJECTED' ? { respondedAt: new Date() } : {}),
        },
        select: SELECT,
      });
    });
    await this.audit.record({
      action: AuditAction.UPDATE,
      entity: 'EInvoice',
      entityId: id,
      changes: { status: einvoice.status },
    });
    return einvoice;
  }

  /** SENT → ACCEPTED/REJECTED: entegratörden güncel durumu çeker. */
  async refreshStatus(id: string) {
    return this.prisma.withTenant(async (tx) => {
      const record = await tx.eInvoice.findFirst({
        where: { id },
        select: { id: true, status: true, externalId: true },
      });
      if (!record) throw new NotFoundError('E-belge bulunamadı.');
      if (record.status !== 'SENT') throw new ConflictError('Yalnız gönderilmiş belge sorgulanır.');
      if (!record.externalId) throw new BusinessRuleError('NO_EXTERNAL_ID', 'Belge numarası yok.');

      const result = await this.provider.getStatus(record.externalId);
      return tx.eInvoice.update({
        where: { id },
        data: {
          status: result.status,
          providerResponse: result.response as Prisma.InputJsonValue,
          respondedAt: new Date(),
        },
        select: SELECT,
      });
    });
  }

  async getPdf(id: string): Promise<Buffer> {
    const record = await this.prisma.withTenant((tx) =>
      tx.eInvoice.findFirst({ where: { id }, select: { externalId: true, status: true } }),
    );
    if (!record) throw new NotFoundError('E-belge bulunamadı.');
    if (!record.externalId) throw new BusinessRuleError('NOT_SENT', 'Belge henüz gönderilmedi.');
    return this.provider.getPdf(record.externalId);
  }

  async cancel(id: string) {
    const einvoice = await this.prisma.withTenant(async (tx) => {
      const record = await tx.eInvoice.findFirst({
        where: { id },
        select: { id: true, status: true, externalId: true },
      });
      if (!record) throw new NotFoundError('E-belge bulunamadı.');
      if (record.status === 'CANCELLED') throw new ConflictError('Belge zaten iptal.');
      if (!record.externalId)
        throw new BusinessRuleError('NOT_SENT', 'Gönderilmemiş belge iptal edilemez.');

      const result = await this.provider.cancel(record.externalId);
      return tx.eInvoice.update({
        where: { id },
        data: {
          status: result.status,
          providerResponse: result.response as Prisma.InputJsonValue,
          respondedAt: new Date(),
        },
        select: SELECT,
      });
    });
    await this.audit.record({
      action: AuditAction.UPDATE,
      entity: 'EInvoice',
      entityId: id,
      changes: { status: 'CANCELLED' },
    });
    return einvoice;
  }

  async list(input: ListEInvoicesInput) {
    return this.prisma.withTenant(async (tx) => {
      const where: Prisma.EInvoiceWhereInput = {};
      if (input.status) where.status = input.status;
      const { skip, take } = toSkipTake(input);
      const [total, items] = await Promise.all([
        tx.eInvoice.count({ where }),
        tx.eInvoice.findMany({ where, select: SELECT, orderBy: { createdAt: 'desc' }, skip, take }),
      ]);
      return paginate(items, total, input);
    });
  }

  async findOne(id: string) {
    const record = await this.prisma.withTenant((tx) =>
      tx.eInvoice.findFirst({ where: { id }, select: SELECT }),
    );
    if (!record) throw new NotFoundError('E-belge bulunamadı.');
    return record;
  }
}
