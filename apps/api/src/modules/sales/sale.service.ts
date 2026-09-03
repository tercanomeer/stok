import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';

import { AuditAction, Prisma } from '@stokk/db';
import { calculateRefundAmount, calculateSaleBreakdown, type SaleBreakdown } from '@stokk/pos-core';
import { PERMISSIONS } from '@stokk/types';

import { SequenceService } from './sequence.service.js';
import {
  BusinessRuleError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '../../common/errors/domain-error.js';
import { paginate, toSkipTake } from '../../common/pagination/pagination.js';
import { PrismaService, type TenantTransaction } from '../../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import type { AuthenticatedUser } from '../auth/auth.service.js';
import { CashSessionService } from '../cash-sessions/cash-session.service.js';
import { ContactService } from '../contacts/contact.service.js';
import type { StockLowEvent } from '../stock/stock.events.js';
import { StockService } from '../stock/stock.service.js';
import type {
  CompleteParkedInput,
  CreateSaleInput,
  ListSalesInput,
  ParkSaleInput,
  ReturnSaleInput,
  SaleLineDtoInput,
  SalePaymentInput,
} from './dto/sale.dto.js';

interface LoadedProduct {
  id: string;
  name: string;
  averageCost: Prisma.Decimal;
  isActive: boolean;
  trackStock: boolean;
}

@Injectable()
export class SaleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly stock: StockService,
    private readonly contacts: ContactService,
    private readonly cash: CashSessionService,
    private readonly sequence: SequenceService,
  ) {}

  /**
   * Satış oluştur — clientSaleId ile IDEMPOTENT (offline sync at-least-once). Tek transaction'da:
   * stok düşümü + (veresiye ise) cari borç + nakit ise kasa hareketi + boşluksuz fiş no.
   */
  async create(input: CreateSaleInput, user: AuthenticatedUser) {
    let outcome: { saleId: string; duplicate: boolean; lowStock: (StockLowEvent | null)[] };
    try {
      outcome = await this.createInTransaction(input, user);
    } catch (error) {
      // Eşzamanlı aynı clientSaleId yarışı: ön-kontrol ikisinde de "yok" görür, ikinci INSERT
      // @@unique([tenantId, clientSaleId])'e takılır (P2002). Bunu idempotent kabul edip mevcut
      // satışı döndürüyoruz — offline POS retry'ı 409/hata değil, satışın kendisini almalı.
      // (meta.target driver adapter'da alan adı taşımayabilir; kazanan satışın varlığıyla teyit.)
      if (input.clientSaleId && this.isUniqueViolation(error)) {
        const clientSaleId = input.clientSaleId;
        const existing = await this.prisma.withTenant((tx) =>
          tx.sale.findFirst({ where: { clientSaleId }, select: { id: true } }),
        );
        if (existing) return this.findOne(existing.id);
      }
      throw error;
    }

    if (!outcome.duplicate) {
      this.stock.emitLowStock(outcome.lowStock);
      await this.audit.record({
        action: AuditAction.CREATE,
        entity: 'Sale',
        entityId: outcome.saleId,
      });
    }
    return this.findOne(outcome.saleId);
  }

  private async createInTransaction(input: CreateSaleInput, user: AuthenticatedUser) {
    return this.prisma.withTenant(async (tx, tenantId) => {
      if (input.clientSaleId) {
        const dup = await tx.sale.findFirst({
          where: { clientSaleId: input.clientSaleId },
          select: { id: true },
        });
        if (dup)
          return { saleId: dup.id, duplicate: true, lowStock: [] as (StockLowEvent | null)[] };
      }

      const session = await this.requireOpenSession(tx, input.cashSessionId);
      const breakdown = calculateSaleBreakdown({
        lines: input.lines.map((l) => this.toCalcLine(l)),
        ...(input.documentDiscountRate === undefined
          ? {}
          : { documentDiscountRate: input.documentDiscountRate }),
      });
      const products = await this.loadProducts(tx, input.lines);
      await this.assertDiscountAllowed(tx, breakdown, user);
      const split = this.splitPayments(input.payments, breakdown.totals.grandTotal);

      const sale = await tx.sale.create({
        data: {
          tenantId,
          cashSessionId: session.id,
          registerId: session.registerId,
          userId: user.id,
          contactId: input.contactId ?? null,
          receiptNo: `PENDING-${randomUUID()}`,
          clientSaleId: input.clientSaleId ?? null,
          status: 'COMPLETED',
          subtotal: breakdown.totals.subtotal,
          discountTotal: breakdown.totals.discountTotal,
          vatTotal: breakdown.totals.vatTotal,
          grandTotal: breakdown.totals.grandTotal,
          vatBreakdown: breakdown.totals.vatBreakdown as unknown as Prisma.InputJsonValue,
          soldAt: input.soldAt ? new Date(input.soldAt) : new Date(),
          note: input.note ?? null,
          items: { create: this.buildItems(tenantId, breakdown, input.lines, products) },
          payments: { create: this.buildPayments(tenantId, input.payments) },
        },
        select: { id: true },
      });

      const lowStock = await this.finalize(tx, tenantId, sale.id, breakdown, split, {
        contactId: input.contactId,
        cashSessionId: session.id,
        user,
      });
      return { saleId: sale.id, duplicate: false, lowStock };
    });
  }

  /** Benzersizlik ihlali (P2002) mi. Hangi kısıt olduğu clientSaleId re-fetch'iyle teyit edilir. */
  private isUniqueViolation(error: unknown): boolean {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
  }

  /** Park: yarım satışı sakla (stok/ödeme yok, geçici fiş no). Tamamlanınca gerçek no alır. */
  async park(input: ParkSaleInput, user: AuthenticatedUser) {
    const saleId = await this.prisma.withTenant(async (tx, tenantId) => {
      const session = await this.requireOpenSession(tx, input.cashSessionId);
      const breakdown = calculateSaleBreakdown({
        lines: input.lines.map((l) => this.toCalcLine(l)),
        ...(input.documentDiscountRate === undefined
          ? {}
          : { documentDiscountRate: input.documentDiscountRate }),
      });
      // Yüksek indirim yetkisi park anında da zorlanır — park→tamamla ile atlanamasın.
      await this.assertDiscountAllowed(tx, breakdown, user);
      const products = await this.loadProducts(tx, input.lines);
      const sale = await tx.sale.create({
        data: {
          tenantId,
          cashSessionId: session.id,
          registerId: session.registerId,
          userId: user.id,
          contactId: input.contactId ?? null,
          receiptNo: `PARK-${randomUUID()}`,
          status: 'PARKED',
          subtotal: breakdown.totals.subtotal,
          discountTotal: breakdown.totals.discountTotal,
          vatTotal: breakdown.totals.vatTotal,
          grandTotal: breakdown.totals.grandTotal,
          vatBreakdown: breakdown.totals.vatBreakdown as unknown as Prisma.InputJsonValue,
          note: input.note ?? null,
          items: { create: this.buildItems(tenantId, breakdown, input.lines, products) },
        },
        select: { id: true },
      });
      return sale.id;
    });
    await this.audit.record({ action: AuditAction.CREATE, entity: 'Sale', entityId: saleId });
    return this.findOne(saleId);
  }

  /** Park edilmiş satışı tamamla: ödeme al, stok düş, gerçek fiş no ver. */
  async completeParked(id: string, input: CompleteParkedInput, user: AuthenticatedUser) {
    const outcome = await this.prisma.withTenant(async (tx, tenantId) => {
      const parked = await tx.sale.findFirst({
        where: { id },
        select: {
          id: true,
          status: true,
          cashSessionId: true,
          contactId: true,
          grandTotal: true,
          items: {
            select: {
              productId: true,
              quantity: true,
              unitPrice: true,
              vatRate: true,
              discountRate: true,
            },
          },
        },
      });
      if (!parked) throw new NotFoundError('Satış bulunamadı.');
      if (parked.status !== 'PARKED')
        throw new ConflictError('Yalnız park edilmiş satış tamamlanır.');

      const session = await this.requireOpenSession(tx, parked.cashSessionId);
      const breakdown = calculateSaleBreakdown({
        lines: parked.items.map((i) => ({
          productId: i.productId,
          quantity: i.quantity.toString(),
          unitPrice: i.unitPrice.toFixed(2),
          vatRate: i.vatRate,
          discountRate: i.discountRate.toFixed(2),
        })),
      });
      const split = this.splitPayments(input.payments, parked.grandTotal.toFixed(2));

      const claimed = await tx.sale.updateMany({
        where: { id, status: 'PARKED' },
        data: { status: 'COMPLETED', soldAt: new Date() },
      });
      if (claimed.count === 0) throw new ConflictError('Satış zaten tamamlanmış.');

      await tx.salePayment.createMany({
        data: this.buildPaymentsFlat(tenantId, id, input.payments),
      });
      const lowStock = await this.finalize(tx, tenantId, id, breakdown, split, {
        contactId: parked.contactId ?? undefined,
        cashSessionId: session.id,
        user,
      });
      return { saleId: id, lowStock };
    });
    this.stock.emitLowStock(outcome.lowStock);
    await this.audit.record({ action: AuditAction.UPDATE, entity: 'Sale', entityId: id });
    return this.findOne(id);
  }

  /** Satış iptali — aynı vardiya, kapanmadan. Stok/cari/kasa etkilerini geri alır. */
  async cancel(id: string, user: AuthenticatedUser): Promise<void> {
    await this.prisma.withTenant(async (tx, tenantId) => {
      const sale = await tx.sale.findFirst({
        where: { id },
        select: {
          id: true,
          status: true,
          cashSessionId: true,
          contactId: true,
          items: { select: { productId: true, quantity: true }, orderBy: { productId: 'asc' } },
          payments: { select: { method: true, amount: true } },
          cashSession: { select: { status: true } },
        },
      });
      if (!sale) throw new NotFoundError('Satış bulunamadı.');
      if (sale.status !== 'COMPLETED')
        throw new ConflictError('Yalnız tamamlanmış satış iptal edilir.');
      if (sale.cashSession.status !== 'OPEN') {
        throw new BusinessRuleError('SESSION_CLOSED', 'Vardiya kapandı; iade kullanın.');
      }

      const claimed = await tx.sale.updateMany({
        where: { id, status: 'COMPLETED' },
        data: { status: 'CANCELLED', cancelledAt: new Date() },
      });
      if (claimed.count === 0) throw new ConflictError('Satış zaten iptal edilmiş.');

      for (const item of sale.items) {
        await this.stock.applyMovement(tx, tenantId, {
          productId: item.productId,
          type: 'SALE_RETURN',
          quantity: item.quantity,
          saleId: id,
          reason: 'Satış iptali',
          createdById: user.id,
        });
      }

      const creditAmount = this.sumByMethod(sale.payments, 'CREDIT');
      if (creditAmount.greaterThan(0) && sale.contactId) {
        await this.contacts.applyTransaction(tx, tenantId, {
          contactId: sale.contactId,
          type: 'CREDIT',
          amount: creditAmount,
          saleId: id,
          description: 'Satış iptali',
        });
      }
      const cashAmount = this.sumByMethod(sale.payments, 'CASH');
      if (cashAmount.greaterThan(0)) {
        await this.cash.recordMovement(tx, tenantId, {
          cashSessionId: sale.cashSessionId,
          type: 'SALE_REFUND',
          amount: cashAmount.negated(),
          saleId: id,
          description: 'Satış iptali',
          createdById: user.id,
        });
      }
    });
    await this.audit.record({
      action: AuditAction.UPDATE,
      entity: 'Sale',
      entityId: id,
      changes: { status: 'CANCELLED' },
    });
  }

  /** Kalem bazlı iade — orijinal fişe referansla, stok geri, ödeme yöntemine göre. */
  async createReturn(saleId: string, input: ReturnSaleInput, user: AuthenticatedUser) {
    const outcome = await this.prisma.withTenant(async (tx, tenantId) => {
      const sale = await tx.sale.findFirst({
        where: { id: saleId },
        select: {
          id: true,
          status: true,
          contactId: true,
          cashSessionId: true,
          items: {
            select: {
              id: true,
              productId: true,
              quantity: true,
              unitPrice: true,
              vatRate: true,
              // İade tutarı ÖDENEN tutardan (lineTotal) oranlanır; ham unitPrice
              // indirim öncesidir ve indirimli satışta fazla ödeme üretir.
              lineTotal: true,
              returnItems: { select: { quantity: true } },
            },
          },
        },
      });
      if (!sale) throw new NotFoundError('Satış bulunamadı.');
      if (sale.status !== 'COMPLETED' && sale.status !== 'PARTIALLY_RETURNED') {
        throw new ConflictError('Bu satış iade edilebilir durumda değil.');
      }
      const itemById = new Map(sale.items.map((i) => [i.id, i]));

      const returnLines = input.items
        .map((r) => {
          const item = itemById.get(r.saleItemId);
          if (!item) throw new ValidationError('İade kalemi bu satışa ait değil.');
          const already = item.returnItems.reduce(
            (a, x) => a.plus(x.quantity),
            new Prisma.Decimal(0),
          );
          const remaining = item.quantity.minus(already);
          const qty = new Prisma.Decimal(r.quantity);
          if (qty.greaterThan(remaining)) {
            throw new BusinessRuleError('RETURN_EXCEEDS_SOLD', 'İade miktarı satılandan fazla.', {
              saleItemId: r.saleItemId,
              remaining: remaining.toFixed(3),
            });
          }
          return { item, qty };
        })
        .sort((a, b) => (a.item.productId < b.item.productId ? -1 : 1));

      // İade tutarı = ödenen satır tutarının iade edilen oranı (pos-core, TEK hesap).
      // Web iade ekranı da aynı fonksiyonu çağırır; ekranda görülen tutarla
      // kasadan çıkan tutar ayrışamaz.
      const refundByItem = new Map(
        returnLines.map((l) => [
          l.item.id,
          new Prisma.Decimal(
            calculateRefundAmount(
              l.item.lineTotal.toString(),
              l.item.quantity.toString(),
              l.qty.toString(),
            ),
          ),
        ]),
      );
      const totalAmount = returnLines.reduce(
        (acc, l) => acc.plus(refundByItem.get(l.item.id) ?? new Prisma.Decimal(0)),
        new Prisma.Decimal(0),
      );

      const returnNo = String(await this.sequence.next(tx, tenantId, 'RETURN'));
      const saleReturn = await tx.saleReturn.create({
        data: {
          tenantId,
          saleId,
          returnNo,
          totalAmount,
          refundMethod: input.refundMethod,
          reason: input.reason,
          createdById: user.id,
          items: {
            create: returnLines.map((l) => ({
              tenantId,
              saleItemId: l.item.id,
              productId: l.item.productId,
              quantity: l.qty,
              unitPrice: l.item.unitPrice,
              vatRate: l.item.vatRate,
              lineTotal: refundByItem.get(l.item.id) ?? new Prisma.Decimal(0),
            })),
          },
        },
        select: { id: true },
      });

      const lowStock: (StockLowEvent | null)[] = [];
      for (const l of returnLines) {
        const { lowStock: low } = await this.stock.applyMovement(tx, tenantId, {
          productId: l.item.productId,
          type: 'SALE_RETURN',
          quantity: l.qty,
          saleReturnId: saleReturn.id,
          reason: 'İade',
          createdById: user.id,
        });
        lowStock.push(low);
      }

      // Geri ödeme: veresiye → cari CREDIT (borç azalır); nakit → kasadan çıkış (vardiya açıksa).
      if (input.refundMethod === 'CREDIT') {
        if (!sale.contactId)
          throw new BusinessRuleError('REFUND_NO_CONTACT', 'Veresiye iade için cari gerekli.');
        await this.contacts.applyTransaction(tx, tenantId, {
          contactId: sale.contactId,
          type: 'CREDIT',
          amount: totalAmount,
          saleId,
          description: `İade ${returnNo}`,
        });
      } else if (input.refundMethod === 'CASH') {
        const session = await tx.cashSession.findFirst({
          where: { id: sale.cashSessionId },
          select: { status: true },
        });
        if (session?.status !== 'OPEN') {
          throw new BusinessRuleError('NO_OPEN_SESSION', 'Nakit iade için vardiya açık olmalı.');
        }
        await this.cash.recordMovement(tx, tenantId, {
          cashSessionId: sale.cashSessionId,
          type: 'SALE_REFUND',
          amount: totalAmount.negated(),
          saleId,
          description: `İade ${returnNo}`,
          createdById: user.id,
        });
      }

      // Orijinal satış durumu: tüm kalemler tamamen iade edildiyse RETURNED, değilse PARTIALLY_RETURNED.
      const fullyReturned = sale.items.every((i) => {
        const already = i.returnItems.reduce((a, x) => a.plus(x.quantity), new Prisma.Decimal(0));
        const extra = returnLines.find((l) => l.item.id === i.id)?.qty ?? new Prisma.Decimal(0);
        return already.plus(extra).greaterThanOrEqualTo(i.quantity);
      });
      await tx.sale.update({
        where: { id: saleId },
        data: { status: fullyReturned ? 'RETURNED' : 'PARTIALLY_RETURNED' },
      });

      return { returnId: saleReturn.id, lowStock };
    });
    this.stock.emitLowStock(outcome.lowStock);
    await this.audit.record({
      action: AuditAction.CREATE,
      entity: 'SaleReturn',
      entityId: outcome.returnId,
    });
    return this.getReturn(outcome.returnId);
  }

  async list(input: ListSalesInput) {
    return this.prisma.withTenant(async (tx) => {
      const where: Prisma.SaleWhereInput = {};
      if (input.cashSessionId) where.cashSessionId = input.cashSessionId;
      if (input.status) where.status = input.status;
      if (input.userId) where.userId = input.userId;
      // Ödeme tipi satışın kendisinde değil kalemlerinde: parçalı ödemede satış
      // hem nakit hem kart olabilir, `some` ile "bu yöntemi içeren satışlar" denir.
      if (input.paymentMethod) where.payments = { some: { method: input.paymentMethod } };
      if (input.from || input.to) {
        where.soldAt = {
          ...(input.from ? { gte: new Date(input.from) } : {}),
          ...(input.to ? { lte: new Date(input.to) } : {}),
        };
      }
      if (input.search) {
        where.receiptNo = { contains: input.search, mode: 'insensitive' };
      }
      const { skip, take } = toSkipTake(input);
      const [total, items] = await Promise.all([
        tx.sale.count({ where }),
        tx.sale.findMany({
          where,
          select: {
            id: true,
            receiptNo: true,
            status: true,
            grandTotal: true,
            soldAt: true,
            contact: { select: { id: true, name: true } },
            user: { select: { id: true, fullName: true } },
            payments: { select: { method: true } },
          },
          orderBy: { soldAt: 'desc' },
          skip,
          take,
        }),
      ]);
      return paginate(items, total, input);
    });
  }

  async findOne(id: string) {
    const sale = await this.prisma.withTenant((tx) =>
      tx.sale.findFirst({
        where: { id },
        select: {
          id: true,
          receiptNo: true,
          clientSaleId: true,
          status: true,
          subtotal: true,
          discountTotal: true,
          vatTotal: true,
          grandTotal: true,
          vatBreakdown: true,
          soldAt: true,
          cancelledAt: true,
          note: true,
          contact: { select: { id: true, name: true } },
          user: { select: { id: true, fullName: true } },
          items: {
            select: {
              id: true,
              productId: true,
              productName: true,
              quantity: true,
              unitPrice: true,
              discountRate: true,
              vatRate: true,
              netAmount: true,
              vatAmount: true,
              lineTotal: true,
              // İade ekranı kalan iade edilebilir miktarı bilmek zorunda; sunucu
              // `createReturn`'de aynı toplamı kullanıyor (RETURN_EXCEEDS_SOLD).
              returnItems: { select: { quantity: true } },
            },
          },
          payments: { select: { id: true, method: true, amount: true, receivedAmount: true } },
          returns: {
            select: {
              id: true,
              returnNo: true,
              totalAmount: true,
              refundMethod: true,
              createdAt: true,
            },
          },
        },
      }),
    );
    if (!sale) throw new NotFoundError('Satış bulunamadı.');
    return sale;
  }

  /** Fiş verisi — yazdırma için tam yapı (başlık/altlık tenant ayarından). */
  async receipt(id: string) {
    return this.prisma.withTenant(async (tx) => {
      const sale = await tx.sale.findFirst({
        where: { id },
        select: {
          receiptNo: true,
          soldAt: true,
          subtotal: true,
          discountTotal: true,
          vatTotal: true,
          grandTotal: true,
          vatBreakdown: true,
          contact: { select: { name: true } },
          items: {
            select: {
              productName: true,
              quantity: true,
              unitPrice: true,
              lineTotal: true,
              vatRate: true,
            },
          },
          payments: { select: { method: true, amount: true, receivedAmount: true } },
        },
      });
      if (!sale) throw new NotFoundError('Satış bulunamadı.');
      const settings = await tx.tenantSettings.findFirst({
        select: { receiptHeader: true, receiptFooter: true, currency: true },
      });
      return {
        ...sale,
        header: settings?.receiptHeader ?? null,
        footer: settings?.receiptFooter ?? null,
      };
    });
  }

  async getReturn(id: string) {
    const ret = await this.prisma.withTenant((tx) =>
      tx.saleReturn.findFirst({
        where: { id },
        select: {
          id: true,
          returnNo: true,
          totalAmount: true,
          refundMethod: true,
          reason: true,
          createdAt: true,
          saleId: true,
          items: {
            select: { id: true, productId: true, quantity: true, unitPrice: true, lineTotal: true },
          },
        },
      }),
    );
    if (!ret) throw new NotFoundError('İade bulunamadı.');
    return ret;
  }

  // --- iç yardımcılar ---

  private async requireOpenSession(tx: TenantTransaction, cashSessionId: string) {
    const session = await tx.cashSession.findFirst({
      where: { id: cashSessionId },
      select: { id: true, status: true, registerId: true },
    });
    if (!session) throw new NotFoundError('Vardiya bulunamadı.');
    if (session.status !== 'OPEN') {
      throw new BusinessRuleError('SESSION_CLOSED', 'Satış için vardiya açık olmalı.');
    }
    return session;
  }

  /** DTO satırını pos-core hesap girdisine indir (exactOptional: undefined alanları at). */
  private toCalcLine(line: SaleLineDtoInput) {
    return {
      productId: line.productId,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      vatRate: line.vatRate,
      ...(line.discountRate === undefined ? {} : { discountRate: line.discountRate }),
    };
  }

  private async loadProducts(tx: TenantTransaction, lines: SaleLineDtoInput[]) {
    const ids = [...new Set(lines.map((l) => l.productId))];
    const rows = await tx.product.findMany({
      where: { id: { in: ids }, deletedAt: null },
      select: { id: true, name: true, averageCost: true, isActive: true, trackStock: true },
    });
    const map = new Map<string, LoadedProduct>(rows.map((r) => [r.id, r]));
    for (const id of ids) {
      const p = map.get(id);
      if (!p) throw new NotFoundError('Ürün bulunamadı.');
      if (!p.isActive) throw new BusinessRuleError('PRODUCT_INACTIVE', 'Pasif ürün satılamaz.');
    }
    return map;
  }

  private buildItems(
    tenantId: string,
    breakdown: SaleBreakdown,
    lines: SaleLineDtoInput[],
    products: Map<string, LoadedProduct>,
  ) {
    return breakdown.lines.map((line, i) => {
      const product = products.get(line.productId)!;
      return {
        tenantId,
        productId: line.productId,
        productName: product.name,
        quantity: new Prisma.Decimal(line.quantity),
        unitPrice: new Prisma.Decimal(line.unitPrice),
        discountRate: new Prisma.Decimal(line.discountRate),
        vatRate: line.vatRate,
        netAmount: new Prisma.Decimal(line.netAmount),
        vatAmount: new Prisma.Decimal(line.vatAmount),
        lineTotal: new Prisma.Decimal(line.lineTotal),
        unitCost: product.averageCost,
        note: lines[i]?.note ?? null,
      };
    });
  }

  private buildPayments(tenantId: string, payments: SalePaymentInput[]) {
    return payments.map((p) => ({
      tenantId,
      method: p.method,
      amount: new Prisma.Decimal(p.amount),
      receivedAmount: p.receivedAmount === undefined ? null : new Prisma.Decimal(p.receivedAmount),
      reference: p.reference ?? null,
    }));
  }

  private buildPaymentsFlat(tenantId: string, saleId: string, payments: SalePaymentInput[]) {
    return this.buildPayments(tenantId, payments).map((p) => ({ ...p, saleId }));
  }

  private splitPayments(payments: SalePaymentInput[], grandTotal: string) {
    const total = payments.reduce(
      (a, p) => a.plus(new Prisma.Decimal(p.amount)),
      new Prisma.Decimal(0),
    );
    if (!total.equals(new Prisma.Decimal(grandTotal))) {
      throw new BusinessRuleError('PAYMENT_MISMATCH', 'Ödeme toplamı fiş tutarına eşit değil.', {
        grandTotal,
        paid: total.toFixed(2),
      });
    }
    return {
      cash: this.sumByMethod(payments, 'CASH'),
      credit: this.sumByMethod(payments, 'CREDIT'),
    };
  }

  private sumByMethod(
    payments: { method: string; amount: Prisma.Decimal | string }[],
    method: string,
  ) {
    return payments
      .filter((p) => p.method === method)
      .reduce((a, p) => a.plus(new Prisma.Decimal(p.amount)), new Prisma.Decimal(0));
  }

  /**
   * Yüksek indirim yetkisi — SATIŞ HESABI ÜZERİNDEN (pos-core breakdown). max(oran) değil,
   * satır + belge indiriminin BİLEŞİK efektif oranı ölçülür (indirim tutarı / brüt): 10%+10%
   * ~19% eder ve eşiği aşabilir. park() ve create() ikisi de çağırır — park→tamamla yolu
   * kontrolü atlamasın (security-auditor bulgusu).
   */
  private async assertDiscountAllowed(
    tx: TenantTransaction,
    breakdown: SaleBreakdown,
    user: AuthenticatedUser,
  ): Promise<void> {
    let maxEffective = new Prisma.Decimal(0);
    for (const line of breakdown.lines) {
      const discount = new Prisma.Decimal(line.discountAmount);
      const gross = new Prisma.Decimal(line.lineTotal).plus(discount); // KDV dahil, indirim öncesi
      if (gross.lessThanOrEqualTo(0)) continue;
      const effective = discount.div(gross).mul(100);
      if (effective.greaterThan(maxEffective)) maxEffective = effective;
    }
    if (maxEffective.lessThanOrEqualTo(0)) return;

    const settings = await tx.tenantSettings.findFirst({ select: { highDiscountThreshold: true } });
    const threshold = settings?.highDiscountThreshold ?? new Prisma.Decimal(10);
    if (
      maxEffective.greaterThan(threshold) &&
      !user.permissions.includes(PERMISSIONS.SALE_DISCOUNT_HIGH)
    ) {
      throw new ForbiddenError('Yüksek indirim yetkiniz yok.', {
        required: PERMISSIONS.SALE_DISCOUNT_HIGH,
        threshold: threshold.toFixed(2),
      });
    }
  }

  private async finalize(
    tx: TenantTransaction,
    tenantId: string,
    saleId: string,
    breakdown: SaleBreakdown,
    split: { cash: Prisma.Decimal; credit: Prisma.Decimal },
    ctx: { contactId: string | undefined; cashSessionId: string; user: AuthenticatedUser },
  ): Promise<(StockLowEvent | null)[]> {
    // Veresiye: cari borç + kredi limiti kontrolü.
    if (split.credit.greaterThan(0)) {
      if (!ctx.contactId)
        throw new BusinessRuleError('CREDIT_NO_CONTACT', 'Veresiye için müşteri gerekli.');
      await this.assertCreditWithinLimit(tx, ctx.contactId, split.credit, ctx.user);
      await this.contacts.applyTransaction(tx, tenantId, {
        contactId: ctx.contactId,
        type: 'DEBIT',
        amount: split.credit,
        saleId,
        description: 'Veresiye satış',
      });
    }

    // Stok düşümü — productId sırasıyla (kilit sırası, deadlock önleme).
    const ordered = [...breakdown.lines].sort((a, b) => (a.productId < b.productId ? -1 : 1));
    const lowStock: (StockLowEvent | null)[] = [];
    for (const line of ordered) {
      const { lowStock: low } = await this.stock.applyMovement(tx, tenantId, {
        productId: line.productId,
        type: 'SALE',
        quantity: new Prisma.Decimal(line.quantity).negated(),
        saleId,
        createdById: ctx.user.id,
      });
      lowStock.push(low);
    }

    // Nakit → kasaya giriş (satışın nakit kısmı; para üstü drawer'dan çıkar, net = nakit kısmı).
    if (split.cash.greaterThan(0)) {
      await this.cash.recordMovement(tx, tenantId, {
        cashSessionId: ctx.cashSessionId,
        type: 'SALE',
        amount: split.cash,
        saleId,
        description: 'Satış (nakit)',
        createdById: ctx.user.id,
      });
    }

    // Boşluksuz fiş no EN SON alınır: receipt_sequences satır kilidi transaction'ın geri
    // kalanı boyunca değil, yalnız burada ~2 round-trip tutulur (postgres-pro/performance
    // bulgusu). Hâlâ tx içinde → rollback numarayı tüketmez, gap-free korunur.
    const receiptNo = String(await this.sequence.next(tx, tenantId, 'SALE'));
    await tx.sale.update({ where: { id: saleId }, data: { receiptNo } });
    return lowStock;
  }

  private async assertCreditWithinLimit(
    tx: TenantTransaction,
    contactId: string,
    creditAmount: Prisma.Decimal,
    user: AuthenticatedUser,
  ): Promise<void> {
    const rows = await tx.$queryRaw<{ balance: string; creditLimit: string }[]>`
      SELECT balance::text, "creditLimit"::text FROM contacts
      WHERE id = ${contactId} AND "deletedAt" IS NULL FOR UPDATE`;
    if (!rows[0]) throw new NotFoundError('Cari bulunamadı.');
    const limit = new Prisma.Decimal(rows[0].creditLimit);
    const newBalance = new Prisma.Decimal(rows[0].balance).plus(creditAmount);
    // Kredi limiti = izin verilen azami borç. 0 = SIFIR limit (veresiye kapalı), "limitsiz"
    // DEĞİL (schema.prisma Contact.creditLimit: "0 = limitsiz değil, sıfır limit"). Aşımı
    // SALE_CREDIT_OVER_LIMIT izni olan kullanıcı geçebilir.
    if (newBalance.greaterThan(limit)) {
      if (!user.permissions.includes(PERMISSIONS.SALE_CREDIT_OVER_LIMIT)) {
        throw new BusinessRuleError('CREDIT_LIMIT_EXCEEDED', 'Kredi limiti aşıldı.', {
          creditLimit: limit.toFixed(2),
          wouldBe: newBalance.toFixed(2),
        });
      }
    }
  }
}
