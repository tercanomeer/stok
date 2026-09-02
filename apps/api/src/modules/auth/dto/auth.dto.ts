import { z } from 'zod';

const password = z
  .string()
  .min(8, 'Şifre en az 8 karakter olmalı.')
  .max(72, 'Şifre en fazla 72 karakter olabilir.'); // bcrypt 72 bayttan sonrasını yok sayar

export const registerSchema = z
  .object({
    businessName: z.string().min(2).max(120),
    fullName: z.string().min(2).max(120),
    email: z.email(),
    password,
    phone: z.string().max(20).optional(),
  })
  .strict();

export const loginSchema = z
  .object({
    email: z.email(),
    password: z.string().min(1),
    totpCode: z.string().length(6).optional(),
  })
  .strict();

export const refreshSchema = z.object({ refreshToken: z.string().min(1) }).strict();

export const forgotPasswordSchema = z.object({ email: z.email() }).strict();

export const resetPasswordSchema = z.object({ token: z.string().min(1), password }).strict();

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type RefreshInput = z.infer<typeof refreshSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
