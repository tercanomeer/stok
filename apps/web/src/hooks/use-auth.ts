'use client';

import { useMutation, type UseMutationResult } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';

import { apiPost, apiPostVoid } from '../lib/api';
import type { AuthSession } from '../lib/api-types';
import { useAuthStore } from '../stores/auth-store';

interface LoginArgs {
  email: string;
  password: string;
}

interface RegisterArgs {
  businessName: string;
  fullName: string;
  email: string;
  password: string;
}

/** Giriş → oturum kur → panele git. */
export function useLogin(): UseMutationResult<AuthSession, Error, LoginArgs> {
  const router = useRouter();
  const setSession = useAuthStore((s) => s.setSession);
  return useMutation({
    mutationFn: (args: LoginArgs) => apiPost<AuthSession>('/auth/login', args),
    onSuccess: (session) => {
      setSession(session);
      router.replace('/');
    },
  });
}

/** Kayıt (işletme + patron) → oturum kur → panele git. */
export function useRegister(): UseMutationResult<AuthSession, Error, RegisterArgs> {
  const router = useRouter();
  const setSession = useAuthStore((s) => s.setSession);
  return useMutation({
    mutationFn: (args: RegisterArgs) => apiPost<AuthSession>('/auth/register', args),
    onSuccess: (session) => {
      setSession(session);
      router.replace('/');
    },
  });
}

/** Şifremi unuttum — yanıt her durumda 204 (kullanıcı varlığı sızmaz). */
export function useForgotPassword(): UseMutationResult<void, Error, { email: string }> {
  return useMutation({
    mutationFn: (args: { email: string }) => apiPostVoid('/auth/forgot-password', args),
  });
}

/** Şifre sıfırlama (token + yeni şifre). */
export function useResetPassword(): UseMutationResult<
  void,
  Error,
  { token: string; password: string }
> {
  return useMutation({
    mutationFn: (args: { token: string; password: string }) =>
      apiPostVoid('/auth/reset-password', args),
  });
}
