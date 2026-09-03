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

export const updateExpenseCategorySchema = z
  .object({ name: z.string().trim().min(1).max(100) })
  .strict();

/**
 * Gider güncelleme. Tüm alanlar isteğe bağlı; yalnız gönderilen değişir.
 * Vardiyaya bağlı kayıt için kısıt servis katmanında (kasa mutabakatı bozulmasın).
 */
export const updateExpenseSchema = z
  .object({
    amount: money.optional(),
    paymentMethod: z.enum(['CASH', 'CARD', 'CREDIT', 'TRANSFER']).optional(),
    description: z.string().trim().min(1).max(300).optional(),
    expenseDate: z.iso.datetime().optional(),
    /** `null` gönderilirse kategori bağlantısı kaldırılır. */
    categoryId: z.string().min(1).nullable().optional(),
    documentNo: z.string().trim().max(60).nullable().optional(),
  })
  .strict();

export const updateIncomeSchema = z
  .object({
    amount: money.optional(),
    paymentMethod: z.enum(['CASH', 'CARD', 'CREDIT', 'TRANSFER']).optional(),
    description: z.string().trim().min(1).max(300).optional(),
    incomeDate: z.iso.datetime().optional(),
    documentNo: z.string().trim().max(60).nullable().optional(),
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
export type UpdateExpenseCategoryInput = z.infer<typeof updateExpenseCategorySchema>;
export type UpdateExpenseInput = z.infer<typeof updateExpenseSchema>;
export type UpdateIncomeInput = z.infer<typeof updateIncomeSchema>;
export type CreateExpenseInput = z.infer<typeof createExpenseSchema>;
export type CreateIncomeInput = z.infer<typeof createIncomeSchema>;
export type ListExpensesInput = z.infer<typeof listExpensesSchema>;
export type ListIncomesInput = z.infer<typeof listIncomesSchema>;
