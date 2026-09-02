import { z } from 'zod';

import { paginationSchema } from '../../../common/pagination/pagination.js';

const money = z.string().regex(/^\d{1,10}(\.\d{1,2})?$/, 'Geçerli bir tutar girin.');
// Miktar sıfırdan büyük olmalı: "0" birim maliyette 0/0 = NaN üretir, maliyeti bozar.
const quantity = z
  .string()
  .regex(/^\d{1,9}(\.\d{1,3})?$/, 'Geçerli bir miktar girin.')
  .refine((v) => Number(v) > 0, 'Miktar sıfırdan büyük olmalı.');
// İskonto oranı 0-100 aralığında: >100 negatif satır matrahı → negatif/bozuk maliyet.
const rate = z
  .string()
  .regex(/^\d{1,3}(\.\d{1,2})?$/, 'Geçerli bir oran girin.')
  .refine((v) => Number(v) <= 100, 'İskonto oranı %100’ü aşamaz.');

const purchaseItemSchema = z
  .object({
    productId: z.string().min(1),
    quantity,
    /** Birim alış fiyatı — KDV HARİÇ (maliyet ve indirilecek KDV ayrımı). */
    unitPrice: money,
    discountRate: rate.optional(),
    vatRate: z.number().int().min(0).max(100),
  })
  .strict();

export const createPurchaseSchema = z
  .object({
    contactId: z.string().min(1),
    invoiceNo: z.string().trim().max(60).optional(),
    invoiceDate: z.iso.datetime(),
    note: z.string().max(500).optional(),
    items: z.array(purchaseItemSchema).min(1, 'En az bir kalem gerekli.'),
  })
  .strict();

export const listPurchasesSchema = paginationSchema.extend({
  contactId: z.string().min(1).optional(),
  status: z.enum(['COMPLETED', 'CANCELLED']).optional(),
});

export type CreatePurchaseInput = z.infer<typeof createPurchaseSchema>;
export type ListPurchasesInput = z.infer<typeof listPurchasesSchema>;
