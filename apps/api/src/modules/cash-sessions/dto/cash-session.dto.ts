import { z } from 'zod';

const money = z.string().regex(/^\d{1,10}(\.\d{1,2})?$/, 'Geçerli bir tutar girin.');

export const openSessionSchema = z
  .object({
    registerId: z.string().min(1),
    openingAmount: money,
    note: z.string().max(300).optional(),
  })
  .strict();

export const closeSessionSchema = z
  .object({
    closingAmount: money,
    note: z.string().max(300).optional(),
  })
  .strict();

export const cashMovementSchema = z
  .object({
    type: z.enum(['DEPOSIT', 'WITHDRAWAL']),
    amount: money,
    description: z.string().trim().min(1).max(200),
  })
  .strict();

export type OpenSessionInput = z.infer<typeof openSessionSchema>;
export type CloseSessionInput = z.infer<typeof closeSessionSchema>;
export type CashMovementInput = z.infer<typeof cashMovementSchema>;
