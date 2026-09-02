import { Injectable } from '@nestjs/common';

import { AuditAction } from '@stokk/db';

import type {
  CreateBrandInput,
  CreateCategoryInput,
  CreateUnitInput,
  UpdateBrandInput,
  UpdateCategoryInput,
  UpdateUnitInput,
} from './dto/catalog.dto.js';
import {
  BusinessRuleError,
  ConflictError,
  NotFoundError,
} from '../../common/errors/domain-error.js';
import { TR_COLLATION } from '../../common/pagination/collation.js';
import { PrismaService, type TenantTransaction } from '../../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';

/**
 * Kategori / marka / birim yönetimi. Üçü de aynı desende: soft delete, ve
 * kullanımdaki kayıt silinemez (409) — CLAUDE.md/plan Faz 3.
 */
@Injectable()
export class CatalogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // --- Kategori (ağaç) ---
  async listCategories() {
    return this.prisma.withTenant((tx) =>
      tx.$queryRawUnsafe(
        `SELECT c.id, c.name, c."parentId", c."sortOrder",
                (SELECT COUNT(*)::int FROM products p WHERE p."categoryId" = c.id AND p."deletedAt" IS NULL) AS "productCount"
         FROM categories c
         WHERE c."deletedAt" IS NULL
         ORDER BY c."sortOrder" ASC, c.name COLLATE "${TR_COLLATION}" ASC`,
      ),
    );
  }

  async createCategory(input: CreateCategoryInput) {
    const category = await this.prisma.withTenant(async (tx, tenantId) => {
      if (input.parentId) await this.assertCategoryExists(tx, input.parentId);
      return tx.category.create({
        data: {
          tenantId,
          name: input.name,
          parentId: input.parentId ?? null,
          sortOrder: input.sortOrder ?? 0,
        },
      });
    });
    await this.audit.record({
      action: AuditAction.CREATE,
      entity: 'Category',
      entityId: category.id,
    });
    return category;
  }

  async updateCategory(id: string, input: UpdateCategoryInput) {
    const category = await this.prisma.withTenant(async (tx) => {
      await this.assertCategoryExists(tx, id);
      if (input.parentId) {
        if (input.parentId === id) {
          throw new BusinessRuleError(
            'CATEGORY_SELF_PARENT',
            'Kategori kendi üst kategorisi olamaz.',
          );
        }
        await this.assertCategoryExists(tx, input.parentId);
      }
      return tx.category.update({
        where: { id },
        data: {
          ...(input.name === undefined ? {} : { name: input.name }),
          ...(input.parentId === undefined ? {} : { parentId: input.parentId }),
          ...(input.sortOrder === undefined ? {} : { sortOrder: input.sortOrder }),
        },
      });
    });
    await this.audit.record({ action: AuditAction.UPDATE, entity: 'Category', entityId: id });
    return category;
  }

  async removeCategory(id: string): Promise<void> {
    await this.prisma.withTenant(async (tx) => {
      await this.assertCategoryExists(tx, id);
      const [products, children] = await Promise.all([
        tx.product.count({ where: { categoryId: id, deletedAt: null } }),
        tx.category.count({ where: { parentId: id, deletedAt: null } }),
      ]);
      if (products > 0) throw new ConflictError('Bu kategoride ürünler var, silinemez.');
      if (children > 0) throw new ConflictError('Bu kategorinin alt kategorileri var, silinemez.');
      await tx.category.update({ where: { id }, data: { deletedAt: new Date() } });
    });
    await this.audit.record({ action: AuditAction.DELETE, entity: 'Category', entityId: id });
  }

  // --- Marka ---
  async listBrands() {
    return this.prisma.withTenant((tx) =>
      tx.$queryRawUnsafe(
        `SELECT b.id, b.name,
                (SELECT COUNT(*)::int FROM products p WHERE p."brandId" = b.id AND p."deletedAt" IS NULL) AS "productCount"
         FROM brands b WHERE b."deletedAt" IS NULL
         ORDER BY b.name COLLATE "${TR_COLLATION}" ASC`,
      ),
    );
  }

  async createBrand(input: CreateBrandInput) {
    const brand = await this.prisma.withTenant((tx, tenantId) =>
      tx.brand.create({ data: { tenantId, name: input.name } }),
    );
    await this.audit.record({ action: AuditAction.CREATE, entity: 'Brand', entityId: brand.id });
    return brand;
  }

  async updateBrand(id: string, input: UpdateBrandInput) {
    const brand = await this.prisma.withTenant(async (tx) => {
      const existing = await tx.brand.findFirst({
        where: { id, deletedAt: null },
        select: { id: true },
      });
      if (!existing) throw new NotFoundError('Marka bulunamadı.');
      return tx.brand.update({
        where: { id },
        data: input.name === undefined ? {} : { name: input.name },
      });
    });
    await this.audit.record({ action: AuditAction.UPDATE, entity: 'Brand', entityId: id });
    return brand;
  }

  async removeBrand(id: string): Promise<void> {
    await this.prisma.withTenant(async (tx) => {
      const existing = await tx.brand.findFirst({
        where: { id, deletedAt: null },
        select: { id: true },
      });
      if (!existing) throw new NotFoundError('Marka bulunamadı.');
      const products = await tx.product.count({ where: { brandId: id, deletedAt: null } });
      if (products > 0) throw new ConflictError('Bu markaya ait ürünler var, silinemez.');
      await tx.brand.update({ where: { id }, data: { deletedAt: new Date() } });
    });
    await this.audit.record({ action: AuditAction.DELETE, entity: 'Brand', entityId: id });
  }

  // --- Birim ---
  async listUnits() {
    return this.prisma.withTenant((tx) =>
      tx.$queryRawUnsafe(
        `SELECT u.id, u.name, u.abbreviation, u."allowsDecimal",
                (SELECT COUNT(*)::int FROM products p WHERE p."unitId" = u.id AND p."deletedAt" IS NULL) AS "productCount"
         FROM units u WHERE u."deletedAt" IS NULL
         ORDER BY u.name COLLATE "${TR_COLLATION}" ASC`,
      ),
    );
  }

  async createUnit(input: CreateUnitInput) {
    const unit = await this.prisma.withTenant((tx, tenantId) =>
      tx.unit.create({
        data: {
          tenantId,
          name: input.name,
          abbreviation: input.abbreviation,
          allowsDecimal: input.allowsDecimal ?? false,
        },
      }),
    );
    await this.audit.record({ action: AuditAction.CREATE, entity: 'Unit', entityId: unit.id });
    return unit;
  }

  async updateUnit(id: string, input: UpdateUnitInput) {
    const unit = await this.prisma.withTenant(async (tx) => {
      const existing = await tx.unit.findFirst({
        where: { id, deletedAt: null },
        select: { id: true },
      });
      if (!existing) throw new NotFoundError('Birim bulunamadı.');
      return tx.unit.update({
        where: { id },
        data: {
          ...(input.name === undefined ? {} : { name: input.name }),
          ...(input.abbreviation === undefined ? {} : { abbreviation: input.abbreviation }),
          ...(input.allowsDecimal === undefined ? {} : { allowsDecimal: input.allowsDecimal }),
        },
      });
    });
    await this.audit.record({ action: AuditAction.UPDATE, entity: 'Unit', entityId: id });
    return unit;
  }

  async removeUnit(id: string): Promise<void> {
    await this.prisma.withTenant(async (tx) => {
      const existing = await tx.unit.findFirst({
        where: { id, deletedAt: null },
        select: { id: true },
      });
      if (!existing) throw new NotFoundError('Birim bulunamadı.');
      const products = await tx.product.count({ where: { unitId: id, deletedAt: null } });
      if (products > 0) throw new ConflictError('Bu birimi kullanan ürünler var, silinemez.');
      await tx.unit.update({ where: { id }, data: { deletedAt: new Date() } });
    });
    await this.audit.record({ action: AuditAction.DELETE, entity: 'Unit', entityId: id });
  }

  private async assertCategoryExists(tx: TenantTransaction, id: string): Promise<void> {
    const found = await tx.category.findFirst({
      where: { id, deletedAt: null },
      select: { id: true },
    });
    if (!found) throw new NotFoundError('Kategori bulunamadı.');
  }
}
