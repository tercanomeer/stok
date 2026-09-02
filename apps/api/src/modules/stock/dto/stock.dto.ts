import { z } from 'zod';

import { paginationSchema } from '../../../common/pagination/pagination.js';

const quantity = z.string().regex(/^\d{1,9}(\.\d{1,3})?$/, 'Geçerli bir miktar girin.');

export const wasteSchema = z
  .object({
    productId: z.string().min(1),
    quantity,
    reason: z.string().trim().min(1, 'Fire sebebi zorunlu.').max(200),
  })
  .strict();

export const adjustSchema = z
  .object({
    productId: z.string().min(1),
    newQuantity: quantity,
    reason: z.string().trim().min(1, 'Düzeltme sebebi zorunlu.').max(200),
  })
  .strict();

const MOVEMENT_TYPES = [
  'SALE',
  'SALE_RETURN',
  'PURCHASE',
  'PURCHASE_RETURN',
  'COUNT_ADJUSTMENT',
  'WASTE',
  'MANUAL_ADJUSTMENT',
] as const;

export const listMovementsSchema = paginationSchema.extend({
  productId: z.string().min(1).optional(),
  type: z.enum(MOVEMENT_TYPES).optional(),
  from: z.iso.datetime().optional(),
  to: z.iso.datetime().optional(),
});

export const startCountSchema = z.object({ note: z.string().max(500).optional() }).strict();

export const addCountItemSchema = z
  .object({
    /** Ürün id'si veya barkod (barkodla hızlı giriş). */
    product: z.string().trim().min(1),
    /** Bu okutmada eklenen miktar (üst üste okutmada birikir). */
    quantity: quantity.default('1'),
  })
  .strict();

export type WasteInput = z.infer<typeof wasteSchema>;
export type AdjustInput = z.infer<typeof adjustSchema>;
export type ListMovementsInput = z.infer<typeof listMovementsSchema>;
export type StartCountInput = z.infer<typeof startCountSchema>;
export type AddCountItemInput = z.infer<typeof addCountItemSchema>;
