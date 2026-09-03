import { z } from 'zod';

/**
 * İstemci form doğrulaması — backend auth.dto ile hizalı (kaynak backend'de).
 * Türkçe mesajlar kullanıcıya gösterilir.
 */

const password = z
  .string()
  .min(8, 'Şifre en az 8 karakter olmalı.')
  .max(72, 'Şifre en fazla 72 karakter olabilir.');

export const loginSchema = z.object({
  email: z.email('Geçerli bir e-posta girin.'),
  password: z.string().min(1, 'Şifre gerekli.'),
});

export const registerSchema = z
  .object({
    businessName: z.string().min(2, 'İşletme adı en az 2 karakter.').max(120),
    fullName: z.string().min(2, 'Ad soyad en az 2 karakter.').max(120),
    email: z.email('Geçerli bir e-posta girin.'),
    password,
    passwordConfirm: z.string(),
  })
  .refine((v) => v.password === v.passwordConfirm, {
    message: 'Şifreler eşleşmiyor.',
    path: ['passwordConfirm'],
  });

export const forgotPasswordSchema = z.object({
  email: z.email('Geçerli bir e-posta girin.'),
});

export const resetPasswordSchema = z
  .object({
    password,
    passwordConfirm: z.string(),
  })
  .refine((v) => v.password === v.passwordConfirm, {
    message: 'Şifreler eşleşmiyor.',
    path: ['passwordConfirm'],
  });

export type LoginValues = z.infer<typeof loginSchema>;
export type RegisterValues = z.infer<typeof registerSchema>;
export type ForgotPasswordValues = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordValues = z.infer<typeof resetPasswordSchema>;
