'use client';

import { QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from 'next-themes';
import { useEffect, useState, type ReactElement, type ReactNode } from 'react';

import { ToastProvider } from '@stokk/ui';

import { makeQueryClient } from '../lib/query-client';
import { useAuthStore } from '../stores/auth-store';

/** Uygulama sağlayıcı katmanı: tema (açık/koyu), veri (query), bildirim (toast). */
export function Providers({ children }: { children: ReactNode }): ReactElement {
  const [queryClient] = useState(makeQueryClient);

  // Oturumu mount'tan sonra localStorage'dan yükle (SSR uyuşmazlığı yok).
  useEffect(() => {
    void useAuthStore.persist.rehydrate();
  }, []);

  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>{children}</ToastProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
