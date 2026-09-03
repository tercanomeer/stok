import { z } from 'zod';

import { toDecimalString } from './catalog-schemas';

/**
 * Cari, alış ve finans formlarının istemci doğrulaması — backend DTO'larıyla hizalı
 * (contacts/dto, purchases/dto, finance/dto, cash-sessions/dto).
 * Para ve miktar STRING taşınır; virgüllü giriş `toDecimalString` ile noktaya çevrilir.
 */

const money = z
  .string()
  .trim()
  .min(1, 'Tutar gerekli.')
  .transform(toDecimalString)
  .refine((v) => /^\d{1,10}(\.\d{1,2})?$/.test(v), 'Geçerli bir tutar girin (ör. 1250,00).');

const optionalMoney = z
  .string()
  .trim()
  .transform(toDecimalString)
  .refine((v) => v === '' || /^\d{1,10}(\.\d{1,2})?$/.test(v), 'Geçerli bir tutar girin.');

const positiveAmount = money.refine(
  (v) => Number.parseFloat(v) > 0,
  'Tutar sıfırdan büyük olmalı.',
);

export const contactSchema = z.object({
  type: z.enum(['CUSTOMER', 'SUPPLIER', 'BOTH']),
  name: z.string().trim().min(1, 'Cari adı gerekli.').max(160),
  code: z.string().trim().max(60).optional(),
  taxNumber: z.string().trim().max(20).optional(),
  taxOffice: z.string().trim().max(80).optional(),
  phone: z.string().trim().max(20).optional(),
  email: z.union([z.literal(''), z.email('Geçerli bir e-posta girin.')]).optional(),
  address: z.string().trim().max(400).optional(),
  creditLimit: optionalMoney,
  note: z.string().trim().max(500).optional(),
});

export const paymentSchema = z.object({
  direction: z.enum(['collect', 'pay']),
  amount: positiveAmount,
  method: z.enum(['CASH', 'CARD', 'TRANSFER']),
  description: z.string().trim().max(200).optional(),
});

export const purchaseHeaderSchema = z.object({
  contactId: z.string().min(1, 'Tedarikçi seçin.'),
  invoiceNo: z.string().trim().max(60).optional(),
  /** `<input type="date">` değeri; gönderirken gün başlangıcı ISO'suna çevrilir. */
  invoiceDate: z.string().min(1, 'Fatura tarihi gerekli.'),
  note: z.string().trim().max(500).optional(),
});

/**
 * Gelir ve gider tek form şeması paylaşır. Backend alan adları farklı
 * (`expenseDate` / `incomeDate`); dönüşüm gönderim anında yapılır, form tek `date` tutar.
 * `categoryId` yalnız giderde gösterilir — gelir ucu kategori almaz.
 */
export const financeEntrySchema = z.object({
  amount: positiveAmount,
  paymentMethod: z.enum(['CASH', 'CARD', 'CREDIT', 'TRANSFER']),
  description: z.string().trim().min(1, 'Açıklama gerekli.').max(300),
  date: z.string().min(1, 'Tarih gerekli.'),
  categoryId: z.string().optional(),
  documentNo: z.string().trim().max(60).optional(),
});

export const expenseCategorySchema = z.object({
  name: z.string().trim().min(1, 'Kategori adı gerekli.').max(100),
});

export type ContactValues = z.input<typeof contactSchema>;
export type ContactOutput = z.output<typeof contactSchema>;
export type PaymentValues = z.input<typeof paymentSchema>;
export type PaymentOutput = z.output<typeof paymentSchema>;
export type PurchaseHeaderValues = z.infer<typeof purchaseHeaderSchema>;
export type FinanceEntryValues = z.input<typeof financeEntrySchema>;
export type FinanceEntryOutput = z.output<typeof financeEntrySchema>;
export type ExpenseCategoryValues = z.infer<typeof expenseCategorySchema>;
