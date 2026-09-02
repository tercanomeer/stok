import { Injectable } from '@nestjs/common';

import { AuditAction, Prisma } from '@stokk/db';

import { StockService } from './stock.service.js';
import {
  BusinessRuleError,
  ConflictError,
  NotFoundError,
} from '../../common/errors/domain-error.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';

/**
 * Sayım akışı: başlat → kalem gir (barkodla) → tamamla → iptal.
 *
 * Sayım DEVAM EDERKEN stok değişmez: her kalem yalnız sayılan miktarı kaydeder,
 * StockMovement üretmez. Tamamlanınca her ürün için fark TEK bir COUNT_ADJUSTMENT
 * hareketi olarak yazılır (01-proje.md: "fark tek bir düzeltme hareketi").
 */
@Injectable()
export class StockCountService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly stock: StockService,
  ) {}

  async start(note: string | undefined, userId: string) {
    const count = await this.prisma.withTenant(async (tx, tenantId) => {
      const code = `SAY-${Date.now().toString(36).toUpperCase()}`;
      return tx.stockCount.create({
        data: { tenantId, code, status: 'IN_PROGRESS', note: note ?? null, startedById: userId },
        select: { id: true, code: true, status: true, startedAt: true },
      });
    });
    await this.audit.record({
      action: AuditAction.CREATE,
      entity: 'StockCount',
      entityId: count.id,
    });
    return count;
  }

  /**
   * Barkodla hızlı kalem girişi. Aynı ürün tekrar okutulursa sayılan miktar üstüne eklenir
   * (kasiyer üst üste okutur). Sayım anındaki sistem miktarı da dondurulur (expected).
   */
  async addItem(countId: string, barcodeOrProductId: string, countedDelta: string) {
    return this.prisma.withTenant(async (tx, tenantId) => {
      const count = await tx.stockCount.findFirst({
        where: { id: countId },
        select: { status: true },
      });
      if (!count) throw new NotFoundError('Sayım bulunamadı.');
      if (count.status !== 'IN_PROGRESS') {
        throw new BusinessRuleError('COUNT_NOT_IN_PROGRESS', 'Sayım devam etmiyor.');
      }

      const product = await tx.product.findFirst({
        where: {
          deletedAt: null,
          OR: [{ id: barcodeOrProductId }, { barcodes: { some: { value: barcodeOrProductId } } }],
        },
        select: { id: true, stockQuantity: true, trackStock: true },
      });
      if (!product) throw new NotFoundError('Ürün bulunamadı.');
      // Takipsiz ürün sayıma alınırsa complete tüm transaction'ı geri alır ve sayım
      // bir daha tamamlanamaz (kalem silme yok); girişte reddediliyor.
      if (!product.trackStock) {
        throw new BusinessRuleError(
          'STOCK_NOT_TRACKED',
          'Bu ürün stok takibine kapalı, sayıma alınamaz.',
        );
      }

      const existing = await tx.stockCountItem.findFirst({
        where: { stockCountId: countId, productId: product.id },
        select: { id: true, countedQuantity: true },
      });

      const delta = new Prisma.Decimal(countedDelta);
      if (existing) {
        return tx.stockCountItem.update({
          where: { id: existing.id },
          data: { countedQuantity: existing.countedQuantity.plus(delta) },
          select: { id: true, productId: true, expectedQuantity: true, countedQuantity: true },
        });
      }

      return tx.stockCountItem.create({
        data: {
          tenantId,
          stockCountId: countId,
          productId: product.id,
          expectedQuantity: product.stockQuantity,
          countedQuantity: delta,
        },
        select: { id: true, productId: true, expectedQuantity: true, countedQuantity: true },
      });
    });
  }

  /**
   * Sayımı tamamla: her kalem için (sayılan − sistem) farkı tek COUNT_ADJUSTMENT
   * hareketi olarak yazılır. Fark sıfırsa hareket üretilmez.
   */
  async complete(countId: string, userId: string) {
    const result = await this.prisma.withTenant(async (tx, tenantId) => {
      const exists = await tx.stockCount.findFirst({
        where: { id: countId },
        select: { id: true },
      });
      if (!exists) throw new NotFoundError('Sayım bulunamadı.');

      // Atomik claim: yalnız IN_PROGRESS iken COMPLETED'a çevir. Count satırını
      // kilitleyip iki eşzamanlı tamamlamanın çift düzeltme yazmasını engeller —
      // ikinci istek count=0 alır ve düzeltme uygulanmadan reddedilir.
      const claimed = await tx.stockCount.updateMany({
        where: { id: countId, status: 'IN_PROGRESS' },
        data: { status: 'COMPLETED', completedAt: new Date() },
      });
      if (claimed.count === 0) {
        throw new ConflictError('Sayım zaten kapatılmış veya iptal edilmiş.');
      }

      // Kilit sırası her zaman productId artan — iki eşzamanlı sayım farklı sırayla
      // ürün kilitleyip deadlock'a girmesin (global kilit sırası kuralı).
      const items = await tx.stockCountItem.findMany({
        where: { stockCountId: countId },
        select: { productId: true, expectedQuantity: true, countedQuantity: true },
        orderBy: { productId: 'asc' },
      });

      let adjustments = 0;
      const lowStockEvents = [];
      for (const item of items) {
        const delta = item.countedQuantity.minus(item.expectedQuantity);
        if (delta.isZero()) continue;
        const { lowStock } = await this.stock.applyMovement(tx, tenantId, {
          productId: item.productId,
          type: 'COUNT_ADJUSTMENT',
          quantity: delta,
          reason: 'Sayım farkı',
          stockCountId: countId,
          createdById: userId,
        });
        lowStockEvents.push(lowStock);
        adjustments += 1;
      }

      return { countId, items: items.length, adjustments, lowStockEvents };
    });

    // Yan etki transaction sonrasında (03-mimari).
    this.stock.emitLowStock(result.lowStockEvents);

    await this.audit.record({
      action: AuditAction.UPDATE,
      entity: 'StockCount',
      entityId: countId,
      changes: { status: 'COMPLETED', adjustments: result.adjustments },
    });
    return result;
  }

  async cancel(countId: string): Promise<void> {
    await this.prisma.withTenant(async (tx) => {
      const exists = await tx.stockCount.findFirst({
        where: { id: countId },
        select: { id: true },
      });
      if (!exists) throw new NotFoundError('Sayım bulunamadı.');
      const claimed = await tx.stockCount.updateMany({
        where: { id: countId, status: 'IN_PROGRESS' },
        data: { status: 'CANCELLED', completedAt: new Date() },
      });
      if (claimed.count === 0) {
        throw new ConflictError('Yalnız devam eden sayım iptal edilebilir.');
      }
    });
    await this.audit.record({
      action: AuditAction.UPDATE,
      entity: 'StockCount',
      entityId: countId,
      changes: { status: 'CANCELLED' },
    });
  }

  async list() {
    return this.prisma.withTenant((tx) =>
      tx.stockCount.findMany({
        select: {
          id: true,
          code: true,
          status: true,
          note: true,
          startedAt: true,
          completedAt: true,
          _count: { select: { items: true } },
        },
        orderBy: { startedAt: 'desc' },
      }),
    );
  }

  async findOne(countId: string) {
    const count = await this.prisma.withTenant((tx) =>
      tx.stockCount.findFirst({
        where: { id: countId },
        select: {
          id: true,
          code: true,
          status: true,
          note: true,
          startedAt: true,
          completedAt: true,
          items: {
            select: {
              id: true,
              productId: true,
              expectedQuantity: true,
              countedQuantity: true,
              product: { select: { name: true } },
            },
          },
        },
      }),
    );
    if (!count) throw new NotFoundError('Sayım bulunamadı.');
    return count;
  }
}
