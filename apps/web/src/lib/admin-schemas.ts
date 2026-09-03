import { z } from 'zod';

/** Kullanıcı ve rol formlarının istemci doğrulaması — backend DTO'larıyla hizalı. */

export const userSchema = z.object({
  fullName: z.string().trim().min(2, 'Ad soyad en az 2 karakter.').max(120),
  email: z.email('Geçerli bir e-posta girin.'),
  phone: z.string().trim().max(20).optional(),
  /** Yalnız yeni kullanıcıda zorunlu; düzenlemede alan gösterilmez. */
  password: z.string().min(8, 'Şifre en az 8 karakter.').max(72),
  roleIds: z.array(z.string().min(1)).min(1, 'En az bir rol seçin.'),
});

export const userUpdateSchema = userSchema.omit({ password: true, email: true }).extend({
  status: z.enum(['ACTIVE', 'INACTIVE']),
});

export const roleSchema = z.object({
  name: z.string().trim().min(2, 'Rol adı en az 2 karakter.').max(60),
  description: z.string().trim().max(200).optional(),
  permissions: z.array(z.string()).min(1, 'En az bir izin seçin.'),
});

export type UserValues = z.infer<typeof userSchema>;
export type UserUpdateValues = z.infer<typeof userUpdateSchema>;
export type RoleValues = z.infer<typeof roleSchema>;
