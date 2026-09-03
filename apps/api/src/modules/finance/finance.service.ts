import { Injectable } from '@nestjs/common';

import { AuditAction, Prisma } from '@stokk/db';

import {
  BusinessRuleError,
  ConflictError,
  NotFoundError,
} from '../../common/errors/domain-error.js';
import { paginate, toSkipTake } from '../../common/pagination/pagination.js';
import { PrismaService, type TenantTransaction } from '../../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { CashSessionService } from '../cash-sessions/cash-session.service.js';
import type {
  CreateExpenseCategoryInput,
  CreateExpenseInput,
  CreateIncomeInput,
  ListExpensesInput,
  ListIncomesInput,
  UpdateExpenseCategoryInput,
  UpdateExpenseInput,
  UpdateIncomeInput,
} from './dto/finance.dto.js';

/**
 * Gelir/gider defteri. Nakit ödenen gider veya nakit alınan gelir, verilen vardiyaya
 * bir kasa hareketi olarak yazılır (vardiya kapanış mutabakatına girer). Nakit-dışı
 * (kart/havale) yalnız kayıt oluşturur, kasayı etkilemez.
 */
@Injectable()
export class FinanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly cash: CashSessionService,
  ) {}

  // --- Gider kategorileri ---
  async listCategories() {
    return this.prisma.withTenant((tx) =>
      tx.expenseCategory.findMany({
        where: { deletedAt: null },
        select: { id: true, name: true, createdAt: true },
        orderBy: { name: 'asc' },
      }),
    );
  }

  async createCategory(input: CreateExpenseCategoryInput) {
    const category = await this.prisma.withTenant(async (tx, tenantId) => {
      try {
        return await tx.expenseCategory.create({
          data: { tenantId, name: input.name },
          select: { id: true, name: true, createdAt: true },
        });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          throw new ConflictError('Bu isimde bir gider kategorisi zaten var.');
        }
        throw error;
      }
    });
    await this.audit.record({
      action: AuditAction.CREATE,
      entity: 'ExpenseCategory',
      entityId: category.id,
    });
    return category;
  }

  async updateCategory(id: string, input: UpdateExpenseCategoryInput) {
    const category = await this.prisma.withTenant(async (tx) => {
      const existing = await tx.expenseCategory.findFirst({
        where: { id, deletedAt: null },
        select: { id: true },
      });
      if (!existing) throw new NotFoundError('Gider kategorisi bulunamadı.');
      try {
        return await tx.expenseCategory.update({
          where: { id },
          data: { name: input.name },
          select: { id: true, name: true, createdAt: true },
        });
      } catch (error) {
        // (tenantId, name) unique — aynı adla ikinci kategori açılamaz.
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          throw new ConflictError('Bu adda bir gider kategorisi zaten var.');
        }
        throw error;
      }
    });
    await this.audit.record({
      action: AuditAction.UPDATE,
      entity: 'ExpenseCategory',
      entityId: id,
      changes: { name: input.name },
    });
    return category;
  }

  async removeCategory(id: string): Promise<void> {
    await this.prisma.withTenant(async (tx) => {
      const category = await tx.expenseCategory.findFirst({
        where: { id, deletedAt: null },
        select: { _count: { select: { expenses: true } } },
      });
      if (!category) throw new NotFoundError('Gider kategorisi bulunamadı.');
      if (category._count.expenses > 0) {
        throw new ConflictError('Gideri olan kategori silinemez.');
      }
      await tx.expenseCategory.update({ where: { id }, data: { deletedAt: new Date() } });
    });
    await this.audit.record({
      action: AuditAction.DELETE,
      entity: 'ExpenseCategory',
      entityId: id,
    });
  }

  // --- Gider ---
  async createExpense(input: CreateExpenseInput, userId: string) {
    const expense = await this.prisma.withTenant(async (tx, tenantId) => {
      if (input.categoryId) {
        const category = await tx.expenseCategory.findFirst({
          where: { id: input.categoryId, deletedAt: null },
          select: { id: true },
        });
        if (!category) throw new NotFoundError('Gider kategorisi bulunamadı.');
      }

      const created = await tx.expense.create({
        data: {
          tenantId,
          categoryId: input.categoryId ?? null,
          amount: new Prisma.Decimal(input.amount),
          paymentMethod: input.paymentMethod,
          description: input.description,
          expenseDate: new Date(input.expenseDate),
          cashSessionId: input.cashSessionId ?? null,
          documentNo: input.documentNo ?? null,
          createdById: userId,
        },
        select: { id: true, amount: true, description: true, expenseDate: true, createdAt: true },
      });

      // Nakit gider → kasadan çıkış (vardiya açıksa).
      if (input.cashSessionId && input.paymentMethod === 'CASH') {
        await this.requireOpenSession(tx, input.cashSessionId);
        await this.cash.recordMovement(tx, tenantId, {
          cashSessionId: input.cashSessionId,
          type: 'EXPENSE',
          amount: new Prisma.Decimal(input.amount).negated(),
          description: `Gider: ${input.description}`,
          createdById: userId,
        });
      }
      return created;
    });
    await this.audit.record({
      action: AuditAction.CREATE,
      entity: 'Expense',
      entityId: expense.id,
    });
    return expense;
  }

  async listExpenses(input: ListExpensesInput) {
    return this.prisma.withTenant(async (tx) => {
      const where: Prisma.ExpenseWhereInput = { deletedAt: null };
      if (input.categoryId) where.categoryId = input.categoryId;
      if (input.from || input.to) {
        where.expenseDate = {
          ...(input.from ? { gte: new Date(input.from) } : {}),
          ...(input.to ? { lte: new Date(input.to) } : {}),
        };
      }
      const { skip, take } = toSkipTake(input);
      const [total, items] = await Promise.all([
        tx.expense.count({ where }),
        tx.expense.findMany({
          where,
          select: {
            id: true,
            amount: true,
            paymentMethod: true,
            description: true,
            expenseDate: true,
            documentNo: true,
            category: { select: { id: true, name: true } },
          },
          orderBy: { expenseDate: 'desc' },
          skip,
          take,
        }),
      ]);
      return paginate(items, total, input);
    });
  }

  // --- Gelir ---
  async createIncome(input: CreateIncomeInput, userId: string) {
    const income = await this.prisma.withTenant(async (tx, tenantId) => {
      const created = await tx.income.create({
        data: {
          tenantId,
          amount: new Prisma.Decimal(input.amount),
          paymentMethod: input.paymentMethod,
          description: input.description,
          incomeDate: new Date(input.incomeDate),
          cashSessionId: input.cashSessionId ?? null,
          documentNo: input.documentNo ?? null,
          createdById: userId,
        },
        select: { id: true, amount: true, description: true, incomeDate: true, createdAt: true },
      });

      // Nakit gelir → kasaya giriş (vardiya açıksa).
      if (input.cashSessionId && input.paymentMethod === 'CASH') {
        await this.requireOpenSession(tx, input.cashSessionId);
        await this.cash.recordMovement(tx, tenantId, {
          cashSessionId: input.cashSessionId,
          type: 'DEPOSIT',
          amount: new Prisma.Decimal(input.amount),
          description: `Gelir: ${input.description}`,
          createdById: userId,
        });
      }
      return created;
    });
    await this.audit.record({ action: AuditAction.CREATE, entity: 'Income', entityId: income.id });
    return income;
  }

  async listIncomes(input: ListIncomesInput) {
    return this.prisma.withTenant(async (tx) => {
      const where: Prisma.IncomeWhereInput = { deletedAt: null };
      if (input.from || input.to) {
        where.incomeDate = {
          ...(input.from ? { gte: new Date(input.from) } : {}),
          ...(input.to ? { lte: new Date(input.to) } : {}),
        };
      }
      const { skip, take } = toSkipTake(input);
      const [total, items] = await Promise.all([
        tx.income.count({ where }),
        tx.income.findMany({
          where,
          select: {
            id: true,
            amount: true,
            paymentMethod: true,
            description: true,
            incomeDate: true,
            documentNo: true,
          },
          orderBy: { incomeDate: 'desc' },
          skip,
          take,
        }),
      ]);
      return paginate(items, total, input);
    });
  }

  /**
   * Vardiyaya bağlı mali kayıt DEĞİŞTİRİLEMEZ.
   *
   * Nakit gider/gelir kasa hareketi doğurur ve o hareket vardiya kapanış
   * mutabakatına girer. Kaydı sonradan değiştirmek/silmek, hareketle kaydı
   * ayrıştırır ve kapanmış vardiyanın farkını geçersiz kılar. (Kasa hareketi
   * bugün gidere FK ile bağlı değil; POS vardiyaya bağlı gider üretmeye
   * başladığında `CashMovement.expenseId` eklenip düzenlemeye izin verilebilir.)
   */
  private assertNotCashLinked(cashSessionId: string | null): void {
    if (cashSessionId) {
      throw new BusinessRuleError(
        'CASH_LINKED_RECORD',
        'Vardiyaya bağlı kayıt değiştirilemez veya silinemez — kasa mutabakatını bozar.',
      );
    }
  }

  async updateExpense(id: string, input: UpdateExpenseInput) {
    const expense = await this.prisma.withTenant(async (tx) => {
      const existing = await tx.expense.findFirst({
        where: { id, deletedAt: null },
        select: { id: true, cashSessionId: true },
      });
      if (!existing) throw new NotFoundError('Gider kaydı bulunamadı.');
      this.assertNotCashLinked(existing.cashSessionId);

      if (input.categoryId) {
        const category = await tx.expenseCategory.findFirst({
          where: { id: input.categoryId, deletedAt: null },
          select: { id: true },
        });
        if (!category) throw new NotFoundError('Gider kategorisi bulunamadı.');
      }

      return tx.expense.update({
        where: { id },
        data: {
          ...(input.amount === undefined ? {} : { amount: new Prisma.Decimal(input.amount) }),
          ...(input.paymentMethod === undefined ? {} : { paymentMethod: input.paymentMethod }),
          ...(input.description === undefined ? {} : { description: input.description }),
          ...(input.expenseDate === undefined ? {} : { expenseDate: new Date(input.expenseDate) }),
          ...(input.categoryId === undefined ? {} : { categoryId: input.categoryId }),
          ...(input.documentNo === undefined ? {} : { documentNo: input.documentNo }),
        },
        select: {
          id: true,
          amount: true,
          paymentMethod: true,
          description: true,
          expenseDate: true,
          documentNo: true,
          category: { select: { id: true, name: true } },
        },
      });
    });
    await this.audit.record({
      action: AuditAction.UPDATE,
      entity: 'Expense',
      entityId: id,
      changes: { fields: Object.keys(input) },
    });
    return expense;
  }

  /** Yumuşak silme — mali kayıt geçmişi korunur, listeden düşer. */
  async removeExpense(id: string): Promise<void> {
    await this.prisma.withTenant(async (tx) => {
      const existing = await tx.expense.findFirst({
        where: { id, deletedAt: null },
        select: { id: true, cashSessionId: true },
      });
      if (!existing) throw new NotFoundError('Gider kaydı bulunamadı.');
      this.assertNotCashLinked(existing.cashSessionId);
      await tx.expense.update({ where: { id }, data: { deletedAt: new Date() } });
    });
    await this.audit.record({ action: AuditAction.DELETE, entity: 'Expense', entityId: id });
  }

  async updateIncome(id: string, input: UpdateIncomeInput) {
    const income = await this.prisma.withTenant(async (tx) => {
      const existing = await tx.income.findFirst({
        where: { id, deletedAt: null },
        select: { id: true, cashSessionId: true },
      });
      if (!existing) throw new NotFoundError('Gelir kaydı bulunamadı.');
      this.assertNotCashLinked(existing.cashSessionId);

      return tx.income.update({
        where: { id },
        data: {
          ...(input.amount === undefined ? {} : { amount: new Prisma.Decimal(input.amount) }),
          ...(input.paymentMethod === undefined ? {} : { paymentMethod: input.paymentMethod }),
          ...(input.description === undefined ? {} : { description: input.description }),
          ...(input.incomeDate === undefined ? {} : { incomeDate: new Date(input.incomeDate) }),
          ...(input.documentNo === undefined ? {} : { documentNo: input.documentNo }),
        },
        select: {
          id: true,
          amount: true,
          paymentMethod: true,
          description: true,
          incomeDate: true,
          documentNo: true,
        },
      });
    });
    await this.audit.record({
      action: AuditAction.UPDATE,
      entity: 'Income',
      entityId: id,
      changes: { fields: Object.keys(input) },
    });
    return income;
  }

  async removeIncome(id: string): Promise<void> {
    await this.prisma.withTenant(async (tx) => {
      const existing = await tx.income.findFirst({
        where: { id, deletedAt: null },
        select: { id: true, cashSessionId: true },
      });
      if (!existing) throw new NotFoundError('Gelir kaydı bulunamadı.');
      this.assertNotCashLinked(existing.cashSessionId);
      await tx.income.update({ where: { id }, data: { deletedAt: new Date() } });
    });
    await this.audit.record({ action: AuditAction.DELETE, entity: 'Income', entityId: id });
  }

  private async requireOpenSession(tx: TenantTransaction, cashSessionId: string): Promise<void> {
    const session = await tx.cashSession.findFirst({
      where: { id: cashSessionId },
      select: { status: true },
    });
    if (!session) throw new NotFoundError('Vardiya bulunamadı.');
    if (session.status !== 'OPEN') {
      throw new BusinessRuleError('SESSION_CLOSED', 'Kapalı vardiyaya nakit hareketi eklenemez.');
    }
  }
}
