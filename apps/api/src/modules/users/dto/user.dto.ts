import { z } from 'zod';

export const createUserSchema = z
  .object({
    email: z.email(),
    password: z.string().min(8).max(72),
    fullName: z.string().min(2).max(120),
    phone: z.string().max(20).optional(),
    roleIds: z.array(z.string().min(1)).min(1, 'En az bir rol seçilmeli.'),
  })
  .strict();

export const updateUserSchema = z
  .object({
    fullName: z.string().min(2).max(120).optional(),
    phone: z.string().max(20).optional(),
    status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
    roleIds: z.array(z.string().min(1)).min(1).optional(),
  })
  .strict();

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
