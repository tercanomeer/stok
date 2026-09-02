import { z } from 'zod';

import { paginationSchema } from '../../../common/pagination/pagination.js';

const money = z.string().regex(/^\d{1,10}(\.\d{1,2})?$/, 'Geçerli bir tutar girin.');

export const createExpenseCategorySchema = z
  .object({ name: z.string().trim().min(1).max(100) })
  .strict();

export const createExpenseSchema = z
  .object({
    amount: money,
    paymentMethod: z.enum(['CASH', 'CARD', 'CREDIT', 'TRANSFER']),
    description: z.string().trim().min(1).max(300),
    expenseDate: z.iso.datetime(),
    categoryId: z.string().min(1).optional(),
    cashSessionId: z.string().min(1).optional(),
    documentNo: z.string().trim().max(60).optional(),
  })
  .strict();

export const createIncomeSchema = z
  .object({
    amount: money,
    paymentMethod: z.enum(['CASH', 'CARD', 'CREDIT', 'TRANSFER']),
    description: z.string().trim().min(1).max(300),
    incomeDate: z.iso.datetime(),
    cashSessionId: z.string().min(1).optional(),
    documentNo: z.string().trim().max(60).optional(),
  })
  .strict();

export const listExpensesSchema = paginationSchema.extend({
  categoryId: z.string().min(1).optional(),
  from: z.iso.datetime().optional(),
  to: z.iso.datetime().optional(),
});

export const listIncomesSchema = paginationSchema.extend({
  from: z.iso.datetime().optional(),
  to: z.iso.datetime().optional(),
});

export type CreateExpenseCategoryInput = z.infer<typeof createExpenseCategorySchema>;
export type CreateExpenseInput = z.infer<typeof createExpenseSchema>;
export type CreateIncomeInput = z.infer<typeof createIncomeSchema>;
export type ListExpensesInput = z.infer<typeof listExpensesSchema>;
export type ListIncomesInput = z.infer<typeof listIncomesSchema>;
