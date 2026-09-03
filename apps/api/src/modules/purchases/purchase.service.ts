import { Injectable } from '@nestjs/common';

import { AuditAction, Prisma } from '@stokk/db';
import { calculatePurchaseBreakdown, purchaseUnitCost, type PurchaseTotals } from '@stokk/pos-core';

import {
  BusinessRuleError,
  ConflictError,
  NotFoundError,
} from '../../common/errors/domain-error.js';
import { paginate, toSkipTake } from '../../common/pagination/pagination.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { ContactService } from '../contacts/contact.service.js';
import { StockService } from '../stock/stock.service.js';
import type { CreatePurchaseInput, ListPurchasesInput } from './dto/purchase.dto.js';

interface ComputedItem {
  productId: string;
  quantity: Prisma.Decimal;
  unitPrice: Prisma.Decimal; // KDV hariç
  discountRate: Prisma.Decimal;
  vatRate: number;
  lineTotal: Prisma.Decimal; // KDV hariç, iskonto sonrası matrah
  vatAmount: Prisma.Decimal;
}

@Injectable()
export class PurchaseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly stock: StockService,
    private readonly contacts: ContactService,
  ) {}

  /**
   * Alış faturası — TEK TRANSACTION'da (01-proje.md):
   *  1. Her kalem için stok girişi (applyMovement, PURCHASE, +miktar, unitCost)
   *  2. Ürünün ağırlıklı ortalama maliyeti güncellenir + lastPurchasePrice
   *  3. Tedarikçiye borç (ContactTransaction CREDIT — biz borçlanırız, balance düşer)
   */
  async create(input: CreatePurchaseInput, userId: string) {
    const { purchase, lowStockEvents } = await this.prisma.withTenant(async (tx, tenantId) => {
      const contact = await tx.contact.findFirst({
        where: { id: input.contactId, deletedAt: null },
        select: { id: true, type: true },
      });
      if (!contact) throw new NotFoundError('Tedarikçi bulunamadı.');
      if (contact.type === 'CUSTOMER') {
        throw new BusinessRuleError('NOT_A_SUPPLIER', 'Bu cari tedarikçi değil.');
      }

      const { computed, totals } = this.computeItems(input);
      const subtotal = new Prisma.Decimal(totals.subtotal);
      const vatTotal = new Prisma.Decimal(totals.vatTotal);
      const discountTotal = new Prisma.Decimal(totals.discountTotal);
      const grandTotal = new Prisma.Decimal(totals.grandTotal);

      const created = await tx.purchase.create({
        data: {
          tenantId,
          contactId: input.contactId,
          invoiceNo: input.invoiceNo ?? null,
          status: 'COMPLETED',
          invoiceDate: new Date(input.invoiceDate),
          subtotal,
          discountTotal,
          vatTotal,
          grandTotal,
          note: input.note ?? null,
          createdById: userId,
          items: {
            create: computed.map((c) => ({
              tenantId,
              productId: c.productId,
              quantity: c.quantity,
              unitPrice: c.unitPrice,
              discountRate: c.discountRate,
              vatRate: c.vatRate,
              lineTotal: c.lineTotal,
              vatAmount: c.vatAmount,
            })),
          },
        },
        select: { id: true },
      });

      const lowStockEvents = [];
      // Ürünleri her zaman productId artan sırayla kilitle — iki eşzamanlı fatura
      // kalemleri ters sırada kilitlerse deadlock olur (global kilit sırası kuralı).
      const ordered = [...computed].sort((a, b) => (a.productId < b.productId ? -1 : 1));
      for (const item of ordered) {
        // Ağırlıklı ortalama maliyet: mevcut stok kilitli okunur, yeni ortalama hesaplanır.
        const locked = await tx.$queryRaw<{ stockQuantity: string; averageCost: string }[]>`
          SELECT "stockQuantity"::text, "averageCost"::text FROM products
          WHERE id = ${item.productId} AND "deletedAt" IS NULL FOR UPDATE`;
        if (!locked[0]) throw new BusinessRuleError('PRODUCT_NOT_FOUND', 'Ürün bulunamadı.');

        const currentQty = new Prisma.Decimal(locked[0].stockQuantity);
        const currentAvg = new Prisma.Decimal(locked[0].averageCost);
        // Birim maliyet = iskonto sonrası satır matrahı / miktar (KDV hariç) — pos-core.
        const unitCost = new Prisma.Decimal(
          purchaseUnitCost(item.lineTotal.toString(), item.quantity.toString()),
        );
        const newAvg = this.weightedAverage(currentQty, currentAvg, item.quantity, unitCost);

        const { lowStock } = await this.stock.applyMovement(tx, tenantId, {
          productId: item.productId,
          type: 'PURCHASE',
          quantity: item.quantity,
          unitCost,
          purchaseId: created.id,
          createdById: userId,
        });
        lowStockEvents.push(lowStock);

        await tx.product.update({
          where: { id: item.productId },
          data: { averageCost: newAvg, lastPurchasePrice: unitCost.toDecimalPlaces(2) },
        });
      }

      // Tedarikçiye borç: biz borçlanırız → CREDIT (balance düşer, negatife gider).
      await this.contacts.applyTransaction(tx, tenantId, {
        contactId: input.contactId,
        type: 'CREDIT',
        amount: grandTotal,
        purchaseId: created.id,
        description: `Alış faturası${input.invoiceNo ? ' ' + input.invoiceNo : ''}`,
      });

      return { purchase: created, lowStockEvents };
    });

    this.stock.emitLowStock(lowStockEvents);
    await this.audit.record({
      action: AuditAction.CREATE,
      entity: 'Purchase',
      entityId: purchase.id,
    });
    return this.findOne(purchase.id);
  }

  /**
   * Alış faturası iptali — tüm etkileri geri alır (TEK TRANSACTION):
   *  1. Her kalem için ters stok hareketi (PURCHASE_RETURN, -miktar)
   *  2. Ağırlıklı ortalama maliyeti geri hesaplar (ters formül)
   *  3. Tedarikçi borcunu geri alır (DEBIT, balance artar)
   *
   * NOT: Araya satış girdiyse ağırlıklı ortalama TAM eski değere dönmez (Faz 1 notu:
   * "ters kayıt modeli, eski değere dönmez"). Hemen iptalde birebir döner.
   */
  async cancel(id: string, userId: string): Promise<void> {
    await this.prisma.withTenant(async (tx, tenantId) => {
      const purchase = await tx.purchase.findFirst({
        where: { id },
        select: {
          id: true,
          status: true,
          contactId: true,
          grandTotal: true,
          // productId artan: create() ile aynı kilit sırası (deadlock önleme).
          items: {
            select: { productId: true, quantity: true, lineTotal: true },
            orderBy: { productId: 'asc' },
          },
        },
      });
      if (!purchase) throw new NotFoundError('Alış faturası bulunamadı.');
      if (purchase.status !== 'COMPLETED') {
        throw new ConflictError('Yalnız tamamlanmış fatura iptal edilebilir.');
      }

      // Atomik claim: yalnız COMPLETED iken CANCELLED'a çevir (çift iptal önleme).
      const claimed = await tx.purchase.updateMany({
        where: { id, status: 'COMPLETED' },
        data: { status: 'CANCELLED', cancelledAt: new Date() },
      });
      if (claimed.count === 0) throw new ConflictError('Fatura zaten iptal edilmiş.');

      for (const item of purchase.items) {
        const locked = await tx.$queryRaw<{ stockQuantity: string; averageCost: string }[]>`
          SELECT "stockQuantity"::text, "averageCost"::text FROM products
          WHERE id = ${item.productId} AND "deletedAt" IS NULL FOR UPDATE`;
        if (!locked[0]) continue;

        const currentQty = new Prisma.Decimal(locked[0].stockQuantity);
        const currentAvg = new Prisma.Decimal(locked[0].averageCost);
        const unitCost = item.lineTotal.div(item.quantity);
        const revertedAvg = this.weightedAverageReverse(
          currentQty,
          currentAvg,
          item.quantity,
          unitCost,
        );

        await this.stock.applyMovement(tx, tenantId, {
          productId: item.productId,
          type: 'PURCHASE_RETURN',
          quantity: item.quantity.negated(),
          purchaseId: id,
          reason: 'Alış faturası iptali',
          createdById: userId,
        });
        await tx.product.update({
          where: { id: item.productId },
          data: { averageCost: revertedAvg },
        });
      }

      // Tedarikçi borcunu geri al: DEBIT (balance artar, sıfıra döner).
      await this.contacts.applyTransaction(tx, tenantId, {
        contactId: purchase.contactId,
        type: 'DEBIT',
        amount: purchase.grandTotal,
        purchaseId: id,
        description: 'Alış faturası iptali',
      });
    });

    await this.audit.record({ action: AuditAction.DELETE, entity: 'Purchase', entityId: id });
  }

  async list(input: ListPurchasesInput) {
    return this.prisma.withTenant(async (tx) => {
      const where: Prisma.PurchaseWhereInput = {};
      if (input.contactId) where.contactId = input.contactId;
      if (input.status) where.status = input.status;

      const { skip, take } = toSkipTake(input);
      const [total, items] = await Promise.all([
        tx.purchase.count({ where }),
        tx.purchase.findMany({
          where,
          select: {
            id: true,
            invoiceNo: true,
            status: true,
            invoiceDate: true,
            grandTotal: true,
            createdAt: true,
            contact: { select: { id: true, name: true } },
          },
          orderBy: { invoiceDate: 'desc' },
          skip,
          take,
        }),
      ]);
      return paginate(items, total, input);
    });
  }

  async findOne(id: string) {
    const purchase = await this.prisma.withTenant((tx) =>
      tx.purchase.findFirst({
        where: { id },
        select: {
          id: true,
          invoiceNo: true,
          status: true,
          invoiceDate: true,
          subtotal: true,
          discountTotal: true,
          vatTotal: true,
          grandTotal: true,
          note: true,
          createdAt: true,
          cancelledAt: true,
          contact: { select: { id: true, name: true } },
          items: {
            select: {
              id: true,
              productId: true,
              quantity: true,
              unitPrice: true,
              discountRate: true,
              vatRate: true,
              lineTotal: true,
              vatAmount: true,
              product: { select: { name: true } },
            },
          },
        },
      }),
    );
    if (!purchase) throw new NotFoundError('Alış faturası bulunamadı.');
    return purchase;
  }

  // --- Hesaplama ---
  /**
   * Satır ve toplam hesabı `@stokk/pos-core`'da (CLAUDE.md: ikinci implementasyon yok).
   * Web alış ekranı toplamları AYNI fonksiyonla gösterir; burada yalnız string sonuçlar
   * Prisma.Decimal'e çevrilir.
   */
  private computeItems(input: CreatePurchaseInput): {
    computed: ComputedItem[];
    totals: PurchaseTotals;
  } {
    const breakdown = calculatePurchaseBreakdown({
      lines: input.items.map((item) => ({
        productId: item.productId,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        vatRate: item.vatRate,
        ...(item.discountRate === undefined ? {} : { discountRate: item.discountRate }),
      })),
    });

    const computed = breakdown.lines.map((line) => ({
      productId: line.productId,
      quantity: new Prisma.Decimal(line.quantity),
      unitPrice: new Prisma.Decimal(line.unitPrice),
      discountRate: new Prisma.Decimal(line.discountRate),
      vatRate: line.vatRate,
      lineTotal: new Prisma.Decimal(line.lineTotal),
      vatAmount: new Prisma.Decimal(line.vatAmount),
    }));

    return { computed, totals: breakdown.totals };
  }

  /** newAvg = (qty0*avg0 + qtyIn*costIn) / (qty0 + qtyIn). qty0<=0 ise costIn. */
  private weightedAverage(
    qty0: Prisma.Decimal,
    avg0: Prisma.Decimal,
    qtyIn: Prisma.Decimal,
    costIn: Prisma.Decimal,
  ): Prisma.Decimal {
    const newQty = qty0.plus(qtyIn);
    if (qty0.lessThanOrEqualTo(0) || newQty.lessThanOrEqualTo(0)) return costIn.toDecimalPlaces(4);
    return qty0.mul(avg0).plus(qtyIn.mul(costIn)).div(newQty).toDecimalPlaces(4);
  }

  /**
   * Ters ağırlıklı ortalama: alış geri alınınca eski ortalamayı kurtarmaya çalışır.
   *
   * Araya satış girip stok azaldıktan sonra çok daha ucuz bir alış ortalamayı
   * seyrelttiyse, geri alınacak değer (qtyIn*costIn) kalan envanter değerini
   * (qtyNow*avgNow) aşabilir → pay negatif olur. Negatif `averageCost` anlamsız ve
   * sonraki alışlara sızarak COGS/kâr hesabını bozar; bu yüzden 0'a kelepçelenir
   * (bilinen sınırlama: ters kayıt modeli araya satış girdiğinde eski değeri birebir
   * kurtaramaz — hassasiyet kaybı kabul, negatif değer değil).
   */
  private weightedAverageReverse(
    qtyNow: Prisma.Decimal,
    avgNow: Prisma.Decimal,
    qtyIn: Prisma.Decimal,
    costIn: Prisma.Decimal,
  ): Prisma.Decimal {
    const qtyBefore = qtyNow.minus(qtyIn);
    if (qtyBefore.lessThanOrEqualTo(0)) return new Prisma.Decimal(0);
    const reverted = qtyNow.mul(avgNow).minus(qtyIn.mul(costIn)).div(qtyBefore).toDecimalPlaces(4);
    return reverted.lessThan(0) ? new Prisma.Decimal(0) : reverted;
  }
}
