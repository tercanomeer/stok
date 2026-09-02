import { z } from 'zod';

export const createRegisterSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    deviceId: z.string().trim().max(120).optional(),
  })
  .strict();

export const updateRegisterSchema = z
  .object({
    name: z.string().trim().min(1).max(80).optional(),
    deviceId: z.string().trim().max(120).optional(),
    isActive: z.boolean().optional(),
  })
  .strict();

export type CreateRegisterInput = z.infer<typeof createRegisterSchema>;
export type UpdateRegisterInput = z.infer<typeof updateRegisterSchema>;
