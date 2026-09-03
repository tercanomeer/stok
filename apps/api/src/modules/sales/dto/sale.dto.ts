import { z } from 'zod';

import { paginationSchema } from '../../../common/pagination/pagination.js';

const money = z.string().regex(/^\d{1,10}(\.\d{1,2})?$/, 'Geçerli bir tutar girin.');
const quantity = z
  .string()
  .regex(/^\d{1,9}(\.\d{1,3})?$/, 'Geçerli bir miktar girin.')
  .refine((v) => Number(v) > 0, 'Miktar sıfırdan büyük olmalı.');
const rate = z
  .string()
  .regex(/^\d{1,3}(\.\d{1,2})?$/, 'Geçerli bir oran girin.')
  .refine((v) => Number(v) <= 100, 'Oran %100’ü aşamaz.');

const saleLineSchema = z
  .object({
    productId: z.string().min(1),
    quantity,
    /** Birim satış fiyatı — KDV DAHİL (SaleItem sözleşmesi). */
    unitPrice: money,
    vatRate: z.number().int().min(0).max(100),
    discountRate: rate.optional(),
    note: z.string().max(200).optional(),
  })
  .strict();

const paymentSchema = z
  .object({
    method: z.enum(['CASH', 'CARD', 'CREDIT', 'TRANSFER']),
    amount: money,
    /** Nakitte müşterinin verdiği tutar; para üstü bundan hesaplanır. */
    receivedAmount: money.optional(),
    reference: z.string().max(120).optional(),
  })
  .strict();

const saleBodySchema = z.object({
  cashSessionId: z.string().min(1),
  contactId: z.string().min(1).optional(),
  documentDiscountRate: rate.optional(),
  lines: z.array(saleLineSchema).min(1, 'En az bir kalem gerekli.'),
  note: z.string().max(500).optional(),
  /** Offline satışın POS'ta gerçekleştiği an. */
  soldAt: z.iso.datetime().optional(),
});

export const createSaleSchema = saleBodySchema
  .extend({
    clientSaleId: z.string().min(1).max(64).optional(),
    payments: z.array(paymentSchema).min(1, 'En az bir ödeme gerekli.'),
  })
  .strict();

export const parkSaleSchema = saleBodySchema.strict();

export const completeParkedSchema = z.object({ payments: z.array(paymentSchema).min(1) }).strict();

export const returnSaleSchema = z
  .object({
    refundMethod: z.enum(['CASH', 'CARD', 'CREDIT', 'TRANSFER']),
    reason: z.string().trim().min(1).max(300),
    items: z
      .array(z.object({ saleItemId: z.string().min(1), quantity }).strict())
      .min(1, 'En az bir iade kalemi gerekli.'),
  })
  .strict();

export const listSalesSchema = paginationSchema.extend({
  cashSessionId: z.string().min(1).optional(),
  status: z.enum(['PARKED', 'COMPLETED', 'CANCELLED', 'PARTIALLY_RETURNED', 'RETURNED']).optional(),
  /** Kasiyer filtresi — satışı kaydeden kullanıcı. */
  userId: z.string().min(1).optional(),
  /** Ödeme tipi filtresi: satışın ödemelerinden en az biri bu yöntemle yapılmışsa eşleşir. */
  paymentMethod: z.enum(['CASH', 'CARD', 'CREDIT', 'TRANSFER']).optional(),
  from: z.iso.datetime().optional(),
  to: z.iso.datetime().optional(),
});

export type CreateSaleInput = z.infer<typeof createSaleSchema>;
export type ParkSaleInput = z.infer<typeof parkSaleSchema>;
export type CompleteParkedInput = z.infer<typeof completeParkedSchema>;
export type ReturnSaleInput = z.infer<typeof returnSaleSchema>;
export type ListSalesInput = z.infer<typeof listSalesSchema>;
export type SalePaymentInput = z.infer<typeof paymentSchema>;
export type SaleLineDtoInput = z.infer<typeof saleLineSchema>;
