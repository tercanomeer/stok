import { z } from 'zod';

export const createCategorySchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    parentId: z.string().min(1).optional(),
    sortOrder: z.number().int().min(0).optional(),
  })
  .strict();

export const updateCategorySchema = createCategorySchema.partial().strict();

export const createBrandSchema = z.object({ name: z.string().trim().min(1).max(80) }).strict();
export const updateBrandSchema = createBrandSchema.partial().strict();

export const createUnitSchema = z
  .object({
    name: z.string().trim().min(1).max(40),
    abbreviation: z.string().trim().min(1).max(10),
    allowsDecimal: z.boolean().optional(),
  })
  .strict();

export const updateUnitSchema = createUnitSchema.partial().strict();

export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;
export type CreateBrandInput = z.infer<typeof createBrandSchema>;
export type UpdateBrandInput = z.infer<typeof updateBrandSchema>;
export type CreateUnitInput = z.infer<typeof createUnitSchema>;
export type UpdateUnitInput = z.infer<typeof updateUnitSchema>;
