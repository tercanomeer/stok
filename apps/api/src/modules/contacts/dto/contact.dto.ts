import { z } from 'zod';

import { paginationSchema } from '../../../common/pagination/pagination.js';

const money = z.string().regex(/^\d{1,10}(\.\d{1,2})?$/, 'Geçerli bir tutar girin.');

export const createContactSchema = z
  .object({
    type: z.enum(['CUSTOMER', 'SUPPLIER', 'BOTH']),
    name: z.string().trim().min(1).max(160),
    code: z.string().trim().max(60).optional(),
    taxNumber: z.string().trim().max(20).optional(),
    taxOffice: z.string().trim().max(80).optional(),
    phone: z.string().trim().max(20).optional(),
    email: z.email().optional(),
    address: z.string().max(400).optional(),
    creditLimit: money.optional(),
    note: z.string().max(500).optional(),
  })
  .strict();

export const updateContactSchema = createContactSchema
  .partial()
  .extend({ isActive: z.boolean().optional() })
  .strict();

export const listContactsSchema = paginationSchema.extend({
  type: z.enum(['CUSTOMER', 'SUPPLIER']).optional(),
  balance: z.enum(['debtor', 'creditor']).optional(),
});

export const paymentSchema = z
  .object({
    contactId: z.string().min(1),
    /** collect = tahsilat (müşteriden), pay = ödeme (tedarikçiye). */
    direction: z.enum(['collect', 'pay']),
    amount: money,
    method: z.enum(['CASH', 'CARD', 'TRANSFER']),
    description: z.string().max(200).optional(),
  })
  .strict();

export const statementSchema = z.object({ from: z.iso.datetime(), to: z.iso.datetime() }).strict();

export type CreateContactInput = z.infer<typeof createContactSchema>;
export type UpdateContactInput = z.infer<typeof updateContactSchema>;
export type ListContactsInput = z.infer<typeof listContactsSchema>;
export type PaymentInput = z.infer<typeof paymentSchema>;
export type StatementInput = z.infer<typeof statementSchema>;
