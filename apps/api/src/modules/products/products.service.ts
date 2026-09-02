import { Injectable } from '@nestjs/common';

import { AuditAction, Prisma } from '@stokk/db';

import type {
  AddBarcodeInput,
  BulkPriceInput,
  CreateProductInput,
  ListProductsInput,
  UpdateProductInput,
} from './dto/product.dto.js';
import {
  BusinessRuleError,
  ConflictError,
  NotFoundError,
} from '../../common/errors/domain-error.js';
import { paginate, parseSort, toSkipTake } from '../../common/pagination/pagination.js';
import { PrismaService, type TenantTransaction } from '../../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';

const PRODUCT_SELECT = {
  id: true,
  name: true,
  code: true,
  categoryId: true,
  brandId: true,
  unitId: true,
  salePrice: true,
  vatRate: true,
  stockQuantity: true,
  criticalLevel: true,
  trackStock: true,
  isWeighed: true,
  isActive: true,
  imageUrl: true,
  createdAt: true,
  barcodes: { select: { id: true, value: true, isPrimary: true } },
} as const;

const SORT_FIELDS = ['name', 'salePrice', 'stockQuantity', 'createdAt'] as const;

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Ürün listesi — sunucu taraflı sayfalama, arama, filtre.
   * Arama ad / barkod / kod üzerinde; trigram indeksi ile 20.000 üründe hızlı.
   */
  async list(input: ListProductsInput) {
    return this.prisma.withTenant(async (tx) => {
      const where: Prisma.ProductWhereInput = { deletedAt: null };
      if (input.categoryId) where.categoryId = input.categoryId;
      if (input.brandId) where.brandId = input.brandId;
      if (input.stock === 'active') where.isActive = true;
      if (input.stock === 'out') where.stockQuantity = { lte: 0 };

      if (input.search) {
        const term = input.search;
        where.OR = [
          { name: { contains: term, mode: 'insensitive' } },
          { code: { contains: term, mode: 'insensitive' } },
          // Barkod TAM eşleşme: okuyucu tam kodu verir, (tenantId, value) unique
          // indeksini kullanır — substring'e göre ~300x hızlı.
          { barcodes: { some: { value: term } } },
        ];
      }

      const sort = parseSort(input.sort, SORT_FIELDS, { field: 'name', direction: 'asc' });
      const { skip, take } = toSkipTake(input);

      // "low" (kritik seviye altı) iki sütun karşılaştırması; Prisma where ile ifade
      // edilemiyor, ham SQL id listesi ile daraltıyoruz.
      if (input.stock === 'low') {
        const lowIds = await tx.$queryRaw<{ id: string }[]>`
          SELECT id FROM products
          WHERE "deletedAt" IS NULL AND "trackStock" = true
            AND "stockQuantity" <= "criticalLevel"`;
        where.id = { in: lowIds.map((r) => r.id) };
      }

      const total = await tx.product.count({ where });

      let items;
      if (sort.field === 'name') {
        // Türkçe sıralama SAYFALAMADAN ÖNCE yapılmalı. Prisma orderBy COLLATE
        // desteklemediği için filtreye uyan (id, name) çekilir, Türkçe collator ile
        // sıralanır, sayfa dilimlenir, sonra tam satırlar sıra korunarak yüklenir.
        // Sayfayı DB varsayılan sırasıyla çekip bellekte sıralamak YANLIŞ sayfa
        // döndürürdü (hedef pazarda tenant kataloğu <= 20.000, bu yük kabul edilebilir).
        const idRows = await tx.product.findMany({ where, select: { id: true, name: true } });
        const collator = new Intl.Collator('tr');
        idRows.sort((a, b) =>
          sort.direction === 'asc'
            ? collator.compare(a.name, b.name)
            : collator.compare(b.name, a.name),
        );
        const pageIds = idRows.slice(skip, skip + take).map((r) => r.id);
        const rows = await tx.product.findMany({
          where: { id: { in: pageIds } },
          select: PRODUCT_SELECT,
        });
        const byId = new Map(rows.map((r) => [r.id, r]));
        items = pageIds
          .map((id) => byId.get(id))
          .filter((r): r is (typeof rows)[number] => r !== undefined);
      } else {
        items = await tx.product.findMany({
          where,
          select: PRODUCT_SELECT,
          skip,
          take,
          orderBy: { [sort.field]: sort.direction },
        });
      }

      return paginate(items, total, input);
    });
  }

  async findOne(id: string) {
    const product = await this.prisma.withTenant((tx) =>
      tx.product.findFirst({ where: { id, deletedAt: null }, select: PRODUCT_SELECT }),
    );
    if (!product) throw new NotFoundError('Ürün bulunamadı.');
    return product;
  }

  async create(input: CreateProductInput) {
    const product = await this.prisma.withTenant(async (tx, tenantId) => {
      await this.assertReferences(tx, input);
      await this.assertVatRate(tx, input.vatRate);
      if (input.barcodes?.length) await this.assertBarcodesFree(tx, input.barcodes);

      return tx.product.create({
        data: {
          tenantId,
          name: input.name,
          code: input.code ?? null,
          categoryId: input.categoryId ?? null,
          brandId: input.brandId ?? null,
          unitId: input.unitId,
          salePrice: input.salePrice,
          vatRate: input.vatRate,
          criticalLevel: input.criticalLevel ?? '0',
          trackStock: input.trackStock ?? true,
          isWeighed: input.isWeighed ?? false,
          description: input.description ?? null,
          ...(input.barcodes?.length
            ? {
                barcodes: {
                  create: input.barcodes.map((value, index) => ({
                    tenantId,
                    value,
                    isPrimary: index === 0,
                  })),
                },
              }
            : {}),
        },
        select: PRODUCT_SELECT,
      });
    });

    await this.audit.record({
      action: AuditAction.CREATE,
      entity: 'Product',
      entityId: product.id,
      changes: { name: input.name, code: input.code },
    });
    return product;
  }

  async update(id: string, input: UpdateProductInput) {
    const product = await this.prisma.withTenant(async (tx) => {
      const existing = await tx.product.findFirst({
        where: { id, deletedAt: null },
        select: { id: true },
      });
      if (!existing) throw new NotFoundError('Ürün bulunamadı.');
      await this.assertReferences(tx, input);
      if (input.vatRate !== undefined) await this.assertVatRate(tx, input.vatRate);

      return tx.product.update({
        where: { id },
        data: {
          ...(input.name === undefined ? {} : { name: input.name }),
          ...(input.code === undefined ? {} : { code: input.code }),
          ...(input.categoryId === undefined ? {} : { categoryId: input.categoryId }),
          ...(input.brandId === undefined ? {} : { brandId: input.brandId }),
          ...(input.unitId === undefined ? {} : { unitId: input.unitId }),
          ...(input.salePrice === undefined ? {} : { salePrice: input.salePrice }),
          ...(input.vatRate === undefined ? {} : { vatRate: input.vatRate }),
          ...(input.criticalLevel === undefined ? {} : { criticalLevel: input.criticalLevel }),
          ...(input.trackStock === undefined ? {} : { trackStock: input.trackStock }),
          ...(input.isWeighed === undefined ? {} : { isWeighed: input.isWeighed }),
          ...(input.isActive === undefined ? {} : { isActive: input.isActive }),
          ...(input.description === undefined ? {} : { description: input.description }),
          ...(input.imageUrl === undefined ? {} : { imageUrl: input.imageUrl }),
        },
        select: PRODUCT_SELECT,
      });
    });
    await this.audit.record({ action: AuditAction.UPDATE, entity: 'Product', entityId: id });
    return product;
  }

  async remove(id: string): Promise<void> {
    await this.prisma.withTenant(async (tx) => {
      const existing = await tx.product.findFirst({
        where: { id, deletedAt: null },
        select: { id: true },
      });
      if (!existing) throw new NotFoundError('Ürün bulunamadı.');
      // Barkodlar fiziksel silinir: silinen ürünün barkodu tekrar kullanılabilmeli
      // (aynı ürünü tekrar açan esnaf eski barkodu yeniden verebilir).
      await tx.barcode.deleteMany({ where: { productId: id } });
      await tx.product.update({ where: { id }, data: { deletedAt: new Date(), isActive: false } });
    });
    await this.audit.record({ action: AuditAction.DELETE, entity: 'Product', entityId: id });
  }

  // --- Barkod ---
  async addBarcode(productId: string, input: AddBarcodeInput) {
    const barcode = await this.prisma.withTenant(async (tx, tenantId) => {
      const product = await tx.product.findFirst({
        where: { id: productId, deletedAt: null },
        select: { id: true },
      });
      if (!product) throw new NotFoundError('Ürün bulunamadı.');
      await this.assertBarcodesFree(tx, [input.value]);

      if (input.isPrimary) {
        await tx.barcode.updateMany({ where: { productId }, data: { isPrimary: false } });
      }
      return tx.barcode.create({
        data: { tenantId, productId, value: input.value, isPrimary: input.isPrimary ?? false },
      });
    });
    await this.audit.record({ action: AuditAction.UPDATE, entity: 'Product', entityId: productId });
    return barcode;
  }

  async removeBarcode(productId: string, barcodeId: string): Promise<void> {
    await this.prisma.withTenant(async (tx) => {
      const barcode = await tx.barcode.findFirst({
        where: { id: barcodeId, productId },
        select: { id: true },
      });
      if (!barcode) throw new NotFoundError('Barkod bulunamadı.');
      await tx.barcode.delete({ where: { id: barcodeId } });
    });
  }

  /**
   * Toplu fiyat güncelleme. `preview` true ise yalnız etkilenen ürünleri döner.
   * Değişen her ürün için fiyat geçmişi kaydı yazılır.
   */
  async bulkPrice(input: BulkPriceInput) {
    return this.prisma.withTenant(async (tx, tenantId) => {
      const where: Prisma.ProductWhereInput = { deletedAt: null };
      if (input.productIds) where.id = { in: input.productIds };
      if (input.categoryId) where.categoryId = input.categoryId;
      if (input.brandId) where.brandId = input.brandId;

      const products = await tx.product.findMany({
        where,
        select: { id: true, name: true, salePrice: true },
      });

      const factor = new Prisma.Decimal(input.value);
      const changes = products.map((product) => {
        const oldPrice = product.salePrice;
        const newPrice =
          input.mode === 'percent'
            ? oldPrice.mul(new Prisma.Decimal(1).plus(factor.div(100)))
            : oldPrice.plus(factor);
        const rounded = newPrice.lessThan(0) ? new Prisma.Decimal(0) : newPrice.toDecimalPlaces(2);
        return { id: product.id, name: product.name, oldPrice, newPrice: rounded };
      });

      if (input.preview) {
        return {
          preview: true,
          affected: changes.length,
          items: changes.map((c) => ({
            id: c.id,
            name: c.name,
            oldPrice: c.oldPrice.toFixed(2),
            newPrice: c.newPrice.toFixed(2),
          })),
        };
      }

      for (const change of changes) {
        await tx.product.update({ where: { id: change.id }, data: { salePrice: change.newPrice } });
        await tx.productPriceHistory.create({
          data: {
            tenantId,
            productId: change.id,
            oldPrice: change.oldPrice,
            newPrice: change.newPrice,
            reason: `Toplu fiyat güncelleme (${input.mode})`,
          },
        });
      }

      await this.audit.record({
        action: AuditAction.UPDATE,
        entity: 'Product',
        changes: { bulkPrice: input.mode, value: input.value, affected: changes.length },
      });

      return { preview: false, affected: changes.length };
    });
  }

  private async assertReferences(
    tx: TenantTransaction,
    input: {
      categoryId?: string | undefined;
      brandId?: string | undefined;
      unitId?: string | undefined;
    },
  ): Promise<void> {
    if (input.categoryId) {
      const c = await tx.category.findFirst({
        where: { id: input.categoryId, deletedAt: null },
        select: { id: true },
      });
      if (!c) throw new BusinessRuleError('CATEGORY_NOT_FOUND', 'Kategori bulunamadı.');
    }
    if (input.brandId) {
      const b = await tx.brand.findFirst({
        where: { id: input.brandId, deletedAt: null },
        select: { id: true },
      });
      if (!b) throw new BusinessRuleError('BRAND_NOT_FOUND', 'Marka bulunamadı.');
    }
    if (input.unitId) {
      const u = await tx.unit.findFirst({
        where: { id: input.unitId, deletedAt: null },
        select: { id: true },
      });
      if (!u) throw new BusinessRuleError('UNIT_NOT_FOUND', 'Birim bulunamadı.');
    }
  }

  /** Ürün KDV oranı tenant ayarındaki listeden olmalı (Faz 1 architect notu). */
  private async assertVatRate(tx: TenantTransaction, vatRate: number): Promise<void> {
    const settings = await tx.tenantSettings.findFirst({ select: { vatRates: true } });
    if (settings && !settings.vatRates.includes(vatRate)) {
      throw new BusinessRuleError(
        'INVALID_VAT_RATE',
        `KDV oranı tanımlı oranlardan biri olmalı: ${settings.vatRates.join(', ')}.`,
      );
    }
  }

  private async assertBarcodesFree(tx: TenantTransaction, values: string[]): Promise<void> {
    if (new Set(values).size !== values.length) {
      throw new ConflictError('Aynı barkod birden fazla kez verildi.');
    }
    const existing = await tx.barcode.findFirst({
      where: { value: { in: values } },
      select: { value: true },
    });
    if (existing) {
      throw new ConflictError(`Bu barkod zaten kullanımda: ${existing.value}`);
    }
  }
}
