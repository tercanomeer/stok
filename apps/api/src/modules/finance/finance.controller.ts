import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';

import { PERMISSIONS } from '@stokk/types';

import { FinanceService } from './finance.service.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Permissions } from '../../common/decorators/permissions.decorator.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import type { AuthenticatedUser } from '../auth/auth.service.js';
import {
  createExpenseCategorySchema,
  createExpenseSchema,
  createIncomeSchema,
  listExpensesSchema,
  listIncomesSchema,
  updateExpenseCategorySchema,
  updateExpenseSchema,
  updateIncomeSchema,
  type CreateExpenseCategoryInput,
  type CreateExpenseInput,
  type CreateIncomeInput,
  type ListExpensesInput,
  type ListIncomesInput,
  type UpdateExpenseCategoryInput,
  type UpdateExpenseInput,
  type UpdateIncomeInput,
} from './dto/finance.dto.js';

@Controller()
export class FinanceController {
  constructor(private readonly finance: FinanceService) {}

  @Get('expense-categories')
  @Permissions(PERMISSIONS.EXPENSE_VIEW)
  listCategories() {
    return this.finance.listCategories();
  }

  @Post('expense-categories')
  @Permissions(PERMISSIONS.EXPENSE_MANAGE)
  createCategory(
    @Body(new ZodValidationPipe(createExpenseCategorySchema)) body: CreateExpenseCategoryInput,
  ) {
    return this.finance.createCategory(body);
  }

  @Patch('expense-categories/:id')
  @Permissions(PERMISSIONS.EXPENSE_MANAGE)
  updateCategory(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateExpenseCategorySchema)) body: UpdateExpenseCategoryInput,
  ) {
    return this.finance.updateCategory(id, body);
  }

  @Delete('expense-categories/:id')
  @HttpCode(204)
  @Permissions(PERMISSIONS.EXPENSE_MANAGE)
  async removeCategory(@Param('id') id: string): Promise<void> {
    await this.finance.removeCategory(id);
  }

  @Get('expenses')
  @Permissions(PERMISSIONS.EXPENSE_VIEW)
  listExpenses(@Query(new ZodValidationPipe(listExpensesSchema)) query: ListExpensesInput) {
    return this.finance.listExpenses(query);
  }

  @Post('expenses')
  @Permissions(PERMISSIONS.EXPENSE_MANAGE)
  createExpense(
    @Body(new ZodValidationPipe(createExpenseSchema)) body: CreateExpenseInput,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.finance.createExpense(body, user.id);
  }

  @Patch('expenses/:id')
  @Permissions(PERMISSIONS.EXPENSE_MANAGE)
  updateExpense(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateExpenseSchema)) body: UpdateExpenseInput,
  ) {
    return this.finance.updateExpense(id, body);
  }

  @Delete('expenses/:id')
  @HttpCode(204)
  @Permissions(PERMISSIONS.EXPENSE_MANAGE)
  async removeExpense(@Param('id') id: string): Promise<void> {
    await this.finance.removeExpense(id);
  }

  @Get('incomes')
  @Permissions(PERMISSIONS.INCOME_VIEW)
  listIncomes(@Query(new ZodValidationPipe(listIncomesSchema)) query: ListIncomesInput) {
    return this.finance.listIncomes(query);
  }

  @Post('incomes')
  @Permissions(PERMISSIONS.INCOME_MANAGE)
  createIncome(
    @Body(new ZodValidationPipe(createIncomeSchema)) body: CreateIncomeInput,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.finance.createIncome(body, user.id);
  }

  @Patch('incomes/:id')
  @Permissions(PERMISSIONS.INCOME_MANAGE)
  updateIncome(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateIncomeSchema)) body: UpdateIncomeInput,
  ) {
    return this.finance.updateIncome(id, body);
  }

  @Delete('incomes/:id')
  @HttpCode(204)
  @Permissions(PERMISSIONS.INCOME_MANAGE)
  async removeIncome(@Param('id') id: string): Promise<void> {
    await this.finance.removeIncome(id);
  }
}
