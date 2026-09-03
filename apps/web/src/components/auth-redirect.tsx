'use client';

import { useRouter } from 'next/navigation';
import { useEffect, type ReactElement, type ReactNode } from 'react';

import { useAuthStore } from '../stores/auth-store';

/**
 * Kimlik ekranlarının tersi kapı: oturum zaten açıksa panele yönlendirir
 * (giriş yapmış kullanıcı /login'de takılmasın). Yaygın durum — girişsiz kullanıcı —
 * formu anında görür; yönlendirme yalnız rehydrate sonrası oturum varsa tetiklenir.
 */
export function AuthRedirect({ children }: { children: ReactNode }): ReactElement {
  const router = useRouter();
  const hydrated = useAuthStore((s) => s.hydrated);
  const user = useAuthStore((s) => s.user);

  useEffect(() => {
    if (hydrated && user) router.replace('/');
  }, [hydrated, user, router]);

  return <>{children}</>;
}
