import { z } from 'zod';

import { paginationSchema } from '../../../common/pagination/pagination.js';

/** Para alanları string olarak gelir (CLAUDE.md), Decimal'e Prisma çeviriyor. */
const money = z.string().regex(/^\d{1,10}(\.\d{1,2})?$/, 'Geçerli bir tutar girin (ör. "12.50").');

const quantity = z
  .string()
  .regex(/^\d{1,9}(\.\d{1,3})?$/, 'Geçerli bir miktar girin.')
  .optional();

export const createProductSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    code: z.string().trim().max(60).optional(),
    categoryId: z.string().min(1).optional(),
    brandId: z.string().min(1).optional(),
    unitId: z.string().min(1),
    salePrice: money,
    vatRate: z.number().int().min(0).max(100),
    criticalLevel: quantity,
    trackStock: z.boolean().optional(),
    isWeighed: z.boolean().optional(),
    description: z.string().max(1000).optional(),
    /** Çoklu barkod; ilki birincil sayılır. */
    barcodes: z.array(z.string().trim().min(1).max(64)).max(20).optional(),
  })
  .strict();

export const updateProductSchema = createProductSchema
  .omit({ barcodes: true })
  .partial()
  .extend({ isActive: z.boolean().optional(), imageUrl: z.url().optional() })
  .strict();

export const listProductsSchema = paginationSchema.extend({
  categoryId: z.string().min(1).optional(),
  brandId: z.string().min(1).optional(),
  /** all | active | low | out — stok durumu filtresi. */
  stock: z.enum(['all', 'active', 'low', 'out']).default('all'),
  sort: z.string().max(40).optional(),
});

export const bulkLabelSchema = z
  .object({ productIds: z.array(z.string().min(1)).min(1).max(500) })
  .strict();

export const addBarcodeSchema = z
  .object({ value: z.string().trim().min(1).max(64), isPrimary: z.boolean().optional() })
  .strict();

export const bulkPriceSchema = z
  .object({
    productIds: z.array(z.string().min(1)).min(1).max(1000).optional(),
    categoryId: z.string().min(1).optional(),
    brandId: z.string().min(1).optional(),
    mode: z.enum(['percent', 'amount']),
    /** Yüzde modunda oran (ör. "10" = %10 zam, "-5" = %5 indirim), tutar modunda TL. */
    value: z.string().regex(/^-?\d{1,10}(\.\d{1,2})?$/),
    /** true ise yalnız önizleme döner, fiyatları değiştirmez. */
    preview: z.boolean().optional(),
  })
  .strict()
  .refine((v) => v.productIds || v.categoryId || v.brandId, {
    message: 'En az bir seçim ölçütü verin (productIds, categoryId veya brandId).',
  });

export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;
export type ListProductsInput = z.infer<typeof listProductsSchema>;
export type AddBarcodeInput = z.infer<typeof addBarcodeSchema>;
export type BulkPriceInput = z.infer<typeof bulkPriceSchema>;
