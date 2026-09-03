'use client';

import { useRouter } from 'next/navigation';
import { useEffect, type ReactElement, type ReactNode } from 'react';

import { Spinner } from '@stokk/ui';

import { useAuthStore } from '../stores/auth-store';

/**
 * Oturum kapısı: rehydrate bitene kadar bekler (erken redirect flash'ı önler),
 * oturum yoksa /login'e yönlendirir. Token süresi dolarsa kullanıcı DÜŞMEZ —
 * axios interceptor sessiz refresh yapar; guard yalnız oturumun hiç olmadığı durumu ele alır.
 */
export function RouteGuard({ children }: { children: ReactNode }): ReactElement {
  const router = useRouter();
  const hydrated = useAuthStore((s) => s.hydrated);
  const user = useAuthStore((s) => s.user);

  useEffect(() => {
    if (hydrated && !user) router.replace('/login');
  }, [hydrated, user, router]);

  if (!hydrated || !user) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Spinner label="Yükleniyor" />
      </div>
    );
  }

  return <>{children}</>;
}
