import { z } from 'zod';

import { ALL_PERMISSIONS } from '@stokk/types';

const permissionCode = z
  .string()
  .refine(
    (code): boolean => (ALL_PERMISSIONS as readonly string[]).includes(code),
    'Tanımsız izin kodu.',
  );

export const createRoleSchema = z
  .object({
    name: z.string().min(2).max(60),
    description: z.string().max(200).optional(),
    permissions: z.array(permissionCode).min(1, 'En az bir izin seçilmeli.'),
  })
  .strict();

export const updateRoleSchema = z
  .object({
    name: z.string().min(2).max(60).optional(),
    description: z.string().max(200).optional(),
    permissions: z.array(permissionCode).min(1).optional(),
  })
  .strict();

export type CreateRoleInput = z.infer<typeof createRoleSchema>;
export type UpdateRoleInput = z.infer<typeof updateRoleSchema>;
