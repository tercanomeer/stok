import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

import { AuditAction, Prisma, type StockMovementType } from '@stokk/db';

import type { ListMovementsInput } from './dto/stock.dto.js';
import { STOCK_LOW_EVENT, type StockLowEvent } from './stock.events.js';
import { BusinessRuleError, NotFoundError } from '../../common/errors/domain-error.js';
import { paginate, toSkipTake } from '../../common/pagination/pagination.js';
import { PrismaService, type TenantTransaction } from '../../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';

export interface ApplyMovementInput {
  productId: string;
  type: StockMovementType;
  /** İşaretli miktar: giriş pozitif, çıkış negatif. */
  quantity: Prisma.Decimal | string;
  unitCost?: Prisma.Decimal | string;
  reason?: string;
  saleId?: string;
  saleReturnId?: string;
  purchaseId?: string;
  stockCountId?: string;
  createdById?: string;
}

/**
 * Stok = hareket defteri (ledger). Anlık miktar hareketlerden türetilir;
 * `Product.stockQuantity` performans için tutulan denormalize kopyadır.
 *
 * TÜM stok değişiklikleri `applyMovement`'tan geçer (satış/alış/sayım/fire/düzeltme).
 * Faz 5/6 modülleri bu primitifi çağırır, ikinci bir stok yazma yolu açılmaz.
 */
@Injectable()
export class StockService {
  private readonly logger = new Logger(StockService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly events: EventEmitter2,
  ) {}

  /**
   * Tek stok hareketi uygular. ÇAĞIRAN BİR TRANSACTION İÇİNDE OLMALI (`withTenant`).
   *
   * Eşzamanlılık: ürün satırı `SELECT ... FOR UPDATE` ile kilitlenir. Aynı ürüne
   * paralel hareketler serileşir; `balanceAfter` ve `stockQuantity` birbirinden
   * ayrışamaz (Faz 4 doğrulaması: 50 paralel düşüm → ledger toplamı = denormalize alan).
   * Prisma FOR UPDATE üretmediği için ham SQL kullanılıyor; RLS `app.tenant_id`
   * ayarı transaction'da kurulu olduğu için yalnız tenant'ın satırı görünür.
   */
  async applyMovement(tx: TenantTransaction, tenantId: string, input: ApplyMovementInput) {
    const quantity = new Prisma.Decimal(input.quantity);

    // Ürünü kilitle ve mevcut durumu oku (RLS ile tenant'a daraltılmış).
    const locked = await tx.$queryRaw<
      {
        id: string;
        name: string;
        stockQuantity: string;
        criticalLevel: string;
        trackStock: boolean;
      }[]
    >`
      SELECT id, name, "stockQuantity"::text, "criticalLevel"::text, "trackStock"
      FROM products WHERE id = ${input.productId} AND "deletedAt" IS NULL
      FOR UPDATE`;

    const product = locked[0];
    if (!product) throw new NotFoundError('Ürün bulunamadı.');

    // Stok takibi kapalı ürün hareket üretmez (hizmet kalemi vb.).
    if (!product.trackStock) {
      throw new BusinessRuleError('STOCK_NOT_TRACKED', 'Bu ürün stok takibine kapalı.');
    }

    const current = new Prisma.Decimal(product.stockQuantity);
    const balanceAfter = current.plus(quantity);

    // Negatif stok politikası — tenant ayarı (uyar / engelle).
    if (balanceAfter.lessThan(0)) {
      const settings = await tx.tenantSettings.findFirst({ select: { negativeStockPolicy: true } });
      if (settings?.negativeStockPolicy === 'BLOCK') {
        throw new BusinessRuleError(
          'NEGATIVE_STOCK_BLOCKED',
          'Stok negatife düşemez (tenant ayarı: engelle).',
          { current: current.toFixed(3), requested: quantity.toFixed(3) },
        );
      }
      this.logger.warn(
        `Negatif stok (uyarı): ürün ${product.id}, bakiye ${balanceAfter.toFixed(3)}`,
      );
    }

    const movement = await tx.stockMovement.create({
      data: {
        tenantId,
        productId: input.productId,
        type: input.type,
        quantity,
        balanceAfter,
        unitCost: input.unitCost === undefined ? null : new Prisma.Decimal(input.unitCost),
        saleId: input.saleId ?? null,
        saleReturnId: input.saleReturnId ?? null,
        purchaseId: input.purchaseId ?? null,
        stockCountId: input.stockCountId ?? null,
        reason: input.reason ?? null,
        createdById: input.createdById ?? null,
      },
    });

    await tx.product.update({
      where: { id: input.productId },
      data: { stockQuantity: balanceAfter },
    });

    // Kritik seviye event'i BURADA EMİT EDİLMEZ: yan etki transaction sonrasına ait
    // (03-mimari). Transaction rollback olursa yanlış "kritik stok" bildirimi gitmesin
    // diye payload döndürülür; çağıran commit sonrası emit eder.
    const critical = new Prisma.Decimal(product.criticalLevel);
    const lowStock: StockLowEvent | null =
      balanceAfter.lessThanOrEqualTo(critical) && critical.greaterThan(0)
        ? {
            tenantId,
            productId: product.id,
            productName: product.name,
            stockQuantity: balanceAfter.toFixed(3),
            criticalLevel: critical.toFixed(3),
          }
        : null;

    return { movement, lowStock };
  }

  /** Toplanan kritik stok event'lerini yayınlar — çağıran commit'ten SONRA çağırır. */
  emitLowStock(events: (StockLowEvent | null)[]): void {
    for (const event of events) {
      if (event) this.events.emit(STOCK_LOW_EVENT, event);
    }
  }

  /** Fire kaydı — sebep zorunlu, çıkış hareketi (negatif). */
  async recordWaste(productId: string, quantity: string, reason: string, userId: string) {
    const { movement, lowStock } = await this.prisma.withTenant((tx, tenantId) =>
      this.applyMovement(tx, tenantId, {
        productId,
        type: 'WASTE',
        quantity: new Prisma.Decimal(quantity).negated(),
        reason,
        createdById: userId,
      }),
    );
    this.emitLowStock([lowStock]);
    await this.audit.record({
      action: AuditAction.CREATE,
      entity: 'StockMovement',
      entityId: movement.id,
      changes: { type: 'WASTE', productId, quantity, reason },
    });
    return movement;
  }

  /** Manuel düzeltme — hedef miktara getiren işaretli hareket, sebep zorunlu. */
  async adjust(productId: string, newQuantity: string, reason: string, userId: string) {
    const result = await this.prisma.withTenant(async (tx, tenantId) => {
      const locked = await tx.$queryRaw<{ stockQuantity: string }[]>`
        SELECT "stockQuantity"::text FROM products
        WHERE id = ${productId} AND "deletedAt" IS NULL FOR UPDATE`;
      if (!locked[0]) throw new NotFoundError('Ürün bulunamadı.');

      const delta = new Prisma.Decimal(newQuantity).minus(
        new Prisma.Decimal(locked[0].stockQuantity),
      );
      if (delta.isZero()) {
        throw new BusinessRuleError('NO_CHANGE', 'Yeni miktar mevcut stokla aynı.');
      }
      return this.applyMovement(tx, tenantId, {
        productId,
        type: 'MANUAL_ADJUSTMENT',
        quantity: delta,
        reason,
        createdById: userId,
      });
    });
    this.emitLowStock([result.lowStock]);
    await this.audit.record({
      action: AuditAction.UPDATE,
      entity: 'StockMovement',
      entityId: result.movement.id,
      changes: { type: 'MANUAL_ADJUSTMENT', productId, newQuantity, reason },
    });
    return result.movement;
  }

  /** Hareket geçmişi — ürün/tarih/tip filtreli, sayfalı. */
  async listMovements(input: ListMovementsInput) {
    return this.prisma.withTenant(async (tx) => {
      const where: Prisma.StockMovementWhereInput = {};
      if (input.productId) where.productId = input.productId;
      if (input.type) where.type = input.type;
      if (input.from || input.to) {
        where.createdAt = {
          ...(input.from ? { gte: new Date(input.from) } : {}),
          ...(input.to ? { lte: new Date(input.to) } : {}),
        };
      }

      const { skip, take } = toSkipTake(input);
      const [total, items] = await Promise.all([
        tx.stockMovement.count({ where }),
        tx.stockMovement.findMany({
          where,
          select: {
            id: true,
            productId: true,
            type: true,
            quantity: true,
            balanceAfter: true,
            reason: true,
            createdAt: true,
            product: { select: { name: true } },
          },
          orderBy: { createdAt: 'desc' },
          skip,
          take,
        }),
      ]);
      return paginate(items, total, input);
    });
  }

  /** Kritik seviye listesi — stok kritik seviyenin altına inmiş ürünler. */
  async lowStock() {
    return this.prisma.withTenant(
      (tx) =>
        tx.$queryRaw<{ id: string; name: string; stockQuantity: string; criticalLevel: string }[]>`
        SELECT id, name, "stockQuantity"::text, "criticalLevel"::text
        FROM products
        WHERE "deletedAt" IS NULL AND "trackStock" = true AND "isActive" = true
          AND "criticalLevel" > 0 AND "stockQuantity" <= "criticalLevel"
        ORDER BY ("stockQuantity" / NULLIF("criticalLevel", 0)) ASC`,
    );
  }
}
